from __future__ import annotations

from app.repositories.interactive_kpis import IndicatorRequest, indicator_context

from uuid import UUID
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin, require_superuser
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.core.roles import is_superuser
from app.models.user import User
from app.models.audit_log import AuditLog
from app.db.session import get_db_session
from app.schemas.audit import AuditLogOut, AuditListResponse
from app.schemas.common import build_pagination
from app.services.audit_service import AuditService
from app.services.ip_geolocation import locate_audit_ip

router = APIRouter(prefix="/api/audit", tags=["Audit"])
AUDIT_TIMEZONE = ZoneInfo("America/Bahia")


@router.get("/paginated", response_model=AuditListResponse, dependencies=[Depends(require_admin)])
async def list_audit_logs_paginated(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    search: str | None = Query(default=None),
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    organization_id: UUID | None = Query(default=None),
    without_organization: bool = Query(default=False),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    kpis: IndicatorRequest = Depends(indicator_context('audit')),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    if production_scope_is_empty(current_user):
        return kpis.attach({'data': [], 'pagination': build_pagination(page, limit, 0), 'deleted': 0})
    if (date_from and date_to and date_from > date_to) or date_to == date.max:
        raise HTTPException(status_code=422, detail="Informe um período de auditoria válido.")
    rows, total, deleted = await AuditService(db).list_paginated(
        page=page, limit=limit, search=search, action=action, entity_type=entity_type,
        organization_id=scoped_organization_id(current_user, organization_id), without_organization=without_organization and is_superuser(current_user),
        include_access=is_superuser(current_user),
        since=datetime.combine(date_from, time.min, AUDIT_TIMEZONE) if date_from else None,
        until=datetime.combine(date_to + timedelta(days=1), time.min, AUDIT_TIMEZONE) if date_to else None,
    )
    return kpis.attach({"data": rows, "pagination": build_pagination(page, limit, total), "deleted": deleted})


@router.get("", response_model=list[AuditLogOut], dependencies=[Depends(require_admin)])
async def list_audit_logs(
    limit: int = Query(default=100, ge=1, le=300),
    entity_type: str | None = Query(default=None),
    action: str | None = Query(default=None),
    actor_user_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    if production_scope_is_empty(current_user):
        return []
    return await AuditService(db).list(
        limit=limit,
        entity_type=entity_type,
        action=action,
        actor_user_id=actor_user_id,
        organization_id=scoped_organization_id(current_user),
        include_access=is_superuser(current_user),
    )


@router.get("/{event_id}/ip-location", dependencies=[Depends(require_superuser)])
async def audit_ip_location(event_id: UUID, db: AsyncSession = Depends(get_db_session)):
    event = await db.get(AuditLog, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento de auditoria não encontrado.")
    context = (event.details or {}).get("request_context") or {}
    return await run_in_threadpool(locate_audit_ip, context.get("ip_address"))
