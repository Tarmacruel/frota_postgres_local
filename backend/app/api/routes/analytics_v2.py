from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.api.routes.analytics import analytics_organization_scope
from app.db.session import get_db_session
from app.models.user import User
from app.models.vehicle import VehicleType
from app.schemas.analytics_v2 import AnalyticsV2Filter, AnalyticsV2Summary
from app.services.analytics_v2_periods import equivalent_periods
from app.services.analytics_v2_service import AnalyticsV2Service
from app.services.analytics_v2_cockpit import AnalyticsV2Cockpit, FleetStatus, CockpitAttention

router = APIRouter(prefix="/api/analytics/v2", tags=["Análises V2"])


def common_filter(request: Request, date_from: date = Query(), date_to: date = Query(),
    organization: UUID | None = Query(default=None), vehicle_type: VehicleType | None = Query(default=None),
    vehicle_id: UUID | None = Query(default=None)) -> AnalyticsV2Filter:
    unsupported = set(request.query_params) - set(AnalyticsV2Filter.model_fields)
    if unsupported:
        raise HTTPException(422, "Filtro não suportado: " + ", ".join(sorted(unsupported)))
    try:
        filters = AnalyticsV2Filter(date_from=date_from, date_to=date_to, organization=organization,
            vehicle_type=vehicle_type, vehicle_id=vehicle_id)
        equivalent_periods(date_from, date_to, now=datetime.now(timezone.utc))
        return filters
    except (ValueError, ValidationError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/summary", response_model=AnalyticsV2Summary)
async def summary(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Service(db).summary(scoped)


@router.get("/fleet-status", response_model=FleetStatus)
async def fleet_status(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session), current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Cockpit(db).fleet(scoped)


@router.get("/attention", response_model=CockpitAttention)
async def attention(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session), current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Cockpit(db).attention(scoped)
