from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.analytics import (
    AnalyticsEfficiencyItem,
    AnalyticsInsightItem,
    AnalyticsOverviewResponse,
    AnalyticsTcoItem,
    DriverRiskItem,
    AnalyticsCostTrendItem,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/analytics", tags=["Analytics"])
EMPTY_ORGANIZATION_ID = UUID("00000000-0000-0000-0000-000000000000")


def analytics_organization_scope(current_user: User, requested_organization_id: UUID | None) -> UUID | None:
    if production_scope_is_empty(current_user):
        return EMPTY_ORGANIZATION_ID
    return scoped_organization_id(current_user, requested_organization_id)


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def analytics_overview(
    period_days: int = Query(default=30, ge=1, le=365),
    organization: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view")),
):
    return await AnalyticsService(db).overview(period_days, organization_id=analytics_organization_scope(current_user, organization))


@router.get("/efficiency", response_model=list[AnalyticsEfficiencyItem])
async def analytics_efficiency(
    period_days: int = Query(default=30, ge=1, le=365),
    vehicle_type: str | None = Query(default=None),
    organization: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view")),
):
    return await AnalyticsService(db).efficiency(period_days, vehicle_type, organization_id=analytics_organization_scope(current_user, organization))




@router.get("/costs/trend", response_model=list[AnalyticsCostTrendItem])
async def analytics_costs_trend(
    months: int = Query(default=12, ge=3, le=24),
    vehicle_type: str | None = Query(default=None),
    organization: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view")),
):
    return await AnalyticsService(db).costs_trend(months=months, vehicle_type=vehicle_type, organization_id=analytics_organization_scope(current_user, organization))


@router.get("/costs/tco", response_model=list[AnalyticsTcoItem])
async def analytics_tco(
    period_days: int = Query(default=30, ge=1, le=365),
    vehicle_type: str | None = Query(default=None),
    organization: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view")),
):
    return await AnalyticsService(db).tco(period_days, vehicle_type, organization_id=analytics_organization_scope(current_user, organization))


@router.get("/risk/drivers", response_model=list[DriverRiskItem])
async def analytics_driver_risk(
    period_days: int = Query(default=30, ge=1, le=365),
    organization: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view")),
):
    return await AnalyticsService(db).driver_risk(period_days, organization_id=analytics_organization_scope(current_user, organization))


@router.get("/insights", response_model=list[AnalyticsInsightItem])
async def analytics_insights(
    period_days: int = Query(default=30, ge=1, le=365),
    vehicle_type: str | None = Query(default=None),
    organization: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view")),
):
    return await AnalyticsService(db).insights(period_days, vehicle_type=vehicle_type, organization_id=analytics_organization_scope(current_user, organization))


@router.get("/export")
async def analytics_export(
    export_format: str = Query(default="xlsx", pattern="^(pdf|xlsx)$"),
    period_days: int = Query(default=30, ge=1, le=365),
    vehicle_type: str | None = Query(default=None),
    organization: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view")),
) -> Response:
    return await AnalyticsService(db).export(
        period_days=period_days,
        export_format=export_format,
        vehicle_type=vehicle_type,
        organization_id=analytics_organization_scope(current_user, organization),
    )
