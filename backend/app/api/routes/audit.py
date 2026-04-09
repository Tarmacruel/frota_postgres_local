from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin
from app.db.session import get_db_session
from app.schemas.audit import AuditLogOut
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/audit", tags=["Audit"])


@router.get("", response_model=list[AuditLogOut], dependencies=[Depends(require_admin)])
async def list_audit_logs(
    limit: int = Query(default=100, ge=1, le=300),
    entity_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    actor_user_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await AuditService(db).list(
        limit=limit,
        entity_type=entity_type,
        action=action,
        actor_user_id=actor_user_id,
    )
