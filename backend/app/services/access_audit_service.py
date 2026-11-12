from __future__ import annotations

import logging
from uuid import UUID, uuid4

from sqlalchemy.exc import SQLAlchemyError

from app.core.request_context import get_request_audit_context
from app.models.audit_log import AuditLog
from app.models.user import User
from app.services.audit_service import AuditService

ACCESS_ENTITY = "AUTH_ACCESS"
logger = logging.getLogger(__name__)


async def record_access(
    db,
    *,
    action: str,
    http_status: int,
    actor: User | None = None,
    attempted_email: str | None = None,
    session_id: UUID | str | None = None,
):
    context = get_request_audit_context()
    details = {"http_status": http_status}
    if session_id:
        details["audit_session_id"] = str(session_id)

    try:
        if actor is not None:
            await AuditService(db).record(
                actor=actor,
                action=action,
                entity_type=ACCESS_ENTITY,
                entity_id=actor.id,
                entity_label=actor.email,
                details=details,
            )
        else:
            if context:
                details["request_context"] = context.as_dict()
            # The identifier was supplied by the caller and has not been authenticated.
            identifier = "".join(character for character in (attempted_email or "")[:255] if character.isprintable())
            db.add(AuditLog(
                actor_name="Identidade não verificada",
                actor_email=None,
                actor_role=None,
                action=action,
                entity_type=ACCESS_ENTITY,
                entity_id=uuid4(),
                entity_label=identifier or "Sem identificação",
                details=details,
            ))
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        logger.error(
            "Falha ao gravar auditoria de acesso: evento=%s request_id=%s",
            action,
            context.request_id if context else None,
        )
