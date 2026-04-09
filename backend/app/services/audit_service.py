from __future__ import annotations

from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog
from app.models.user import User
from app.repositories.audit_repository import AuditRepository


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
    ) -> AuditLog:
        audit_log = AuditLog(
            actor_user_id=actor.id,
            actor_name=actor.name,
            actor_email=actor.email,
            actor_role=actor.role.value,
            action=action.upper(),
            entity_type=entity_type.upper(),
            entity_id=entity_id,
            entity_label=entity_label,
            details=details,
        )
        return await self.audit_logs.create(audit_log)
