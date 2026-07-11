from __future__ import annotations

from uuid import UUID
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.core.request_context import RequestAuditContext, get_request_audit_context


_SECRET_KEYS = {
    "access_token",
    "authorization",
    "cookie",
    "csrf_token",
    "password",
    "password_hash",
    "refresh_token",
    "secret",
    "token",
}
_PERSONAL_KEYS = {"contact", "cpf", "document", "driver_contact", "driver_document", "email", "phone", "telefone"}


def _mask_personal_value(value):
    if not isinstance(value, str) or not value:
        return value
    if "***" in value:
        return value[:128]
    suffix = "".join(character for character in value if character.isalnum())[-4:]
    return f"***{suffix}" if suffix else "***"


def _sanitize_audit_value(value, *, key: str = "", depth: int = 0):
    normalized_key = key.casefold()
    if normalized_key in _SECRET_KEYS or normalized_key.endswith(("_cookie", "_secret", "_token")):
        return "[REDACTED]"
    if normalized_key in _PERSONAL_KEYS and not normalized_key.endswith(("_hash", "_masked", "_sha256")):
        return _mask_personal_value(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        return "[BINARY_OMITTED]"
    if depth >= 8:
        return "[DEPTH_LIMIT]"
    if isinstance(value, dict):
        return {
            str(item_key)[:128]: _sanitize_audit_value(item_value, key=str(item_key), depth=depth + 1)
            for item_key, item_value in list(value.items())[:100]
        }
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_audit_value(item, depth=depth + 1) for item in list(value)[:100]]
    if isinstance(value, str):
        return value[:2048]
    return value


class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit_logs = AuditRepository(db)

    async def list(
        self,
        limit: int = 100,
        entity_type: str | None = None,
        action: str | None = None,
        actor_user_id: UUID | None = None,
    ) -> list[AuditLog]:
        return await self.audit_logs.list(
            limit=limit,
            entity_type=entity_type,
            action=action,
            actor_user_id=actor_user_id,
        )

    async def record(
        self,
        *,
        actor: User,
        action: str,
        entity_type: str,
        entity_id: UUID,
        entity_label: str,
        details: dict | None = None,
        request_context: RequestAuditContext | None = None,
    ) -> AuditLog:
        sanitized_details = jsonable_encoder(_sanitize_audit_value(details)) if details is not None else {}
        context = request_context or get_request_audit_context()
        if context is not None:
            sanitized_details["request_context"] = context.as_dict()
        audit_log = AuditLog(
            actor_user_id=actor.id,
            actor_name=actor.name,
            actor_email=actor.email,
            actor_role=actor.role.value,
            action=action.upper(),
            entity_type=entity_type.upper(),
            entity_id=entity_id,
            entity_label=entity_label,
            details=sanitized_details or None,
        )
        return await self.audit_logs.create(audit_log)
