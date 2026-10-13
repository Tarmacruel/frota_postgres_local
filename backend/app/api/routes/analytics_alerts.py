from uuid import UUID
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.api.routes.analytics_v2 import common_filter
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.analytics_alert import AlertRule, AlertSeverity, AlertStatus, AlertStatusChange
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_alerts import AnalyticsAlerts

router = APIRouter(prefix='/alerts', tags=['Casos analíticos'])


def private(response: Response):
    response.headers['Cache-Control'] = 'private, no-store'


def closed_query(request: Request, allowed=()):
    if set(request.query_params) - set(allowed):
        raise HTTPException(422, 'Parâmetro não suportado')


@router.get('')
async def list_alerts(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    status: AlertStatus | None = None, severity: AlertSeverity | None = None, rule_key: AlertRule | None = None,
    offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('analytics', 'view'))):
    private(response)
    return await AnalyticsAlerts(db).list(user, filters=filters, status=status, severity=severity,
        rule_key=rule_key, offset=offset, limit=limit)


@router.post('/reconcile')
async def reconcile_alerts(request: Request, response: Response, filters: AnalyticsV2Filter,
    idempotency_key: str | None = Header(None), db: AsyncSession = Depends(get_db_session),
    user: User = Depends(require_permission('analytics', 'view'))):
    closed_query(request)
    private(response)
    try:
        return await AnalyticsAlerts(db).reconcile(user, filters, idempotency_key)
    except Exception:
        await db.rollback()
        raise


@router.get('/{case_id}')
async def alert_detail(case_id: UUID, request: Request, response: Response,
    db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('analytics', 'view'))):
    closed_query(request)
    private(response)
    result = await AnalyticsAlerts(db).detail(user, case_id)
    response.headers['ETag'] = f'"{result["version"]}"'
    return result


@router.get('/{case_id}/events')
async def alert_events(case_id: UUID, request: Request, response: Response,
    offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('analytics', 'view'))):
    closed_query(request, ('offset', 'limit'))
    private(response)
    return await AnalyticsAlerts(db).events(user, case_id, offset=offset, limit=limit)


@router.patch('/{case_id}/status')
async def change_alert_status(case_id: UUID, change: AlertStatusChange, request: Request, response: Response,
    idempotency_key: str | None = Header(None), if_match: str | None = Header(None),
    db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('analytics', 'view'))):
    closed_query(request)
    private(response)
    try:
        result = await AnalyticsAlerts(db).change_status(user, case_id, change, idempotency_key, if_match)
    except Exception:
        await db.rollback()
        raise
    response.headers['ETag'] = f'"{result["version"]}"'
    return result
