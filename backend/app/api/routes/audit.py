from __future__ import annotations

from app.repositories.interactive_kpis import IndicatorRequest, indicator_context

from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin
from app.db.session import get_db_session
from app.schemas.audit import AuditLogOut, AuditListResponse
from app.schemas.common import build_pagination
from app.services.audit_service import AuditService

router = APIRouter(prefix="/api/audit", tags=["Audit"])


@router.get("/paginated", response_model=AuditListResponse, dependencies=[Depends(require_admin)])
async def list_audit_logs_paginated(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    search: str | None = Query(default=None),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    organization_id: UUID | None = Query(default=None),
    without_organization: bool = Query(default=False),
    kpis: IndicatorRequest = Depends(indicator_context('audit')),
    db: AsyncSession = Depends(get_db_session),
):
    rows, total, deleted = await AuditService(db).list_paginated(
        page=page, limit=limit, search=search, action=action, entity_type=entity_type,
        organization_id=organization_id, without_organization=without_organization,
    )
    return kpis.attach({"data": rows, "pagination": build_pagination(page, limit, total), "deleted": deleted})


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
