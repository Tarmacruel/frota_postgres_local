from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin
from app.db.session import get_db_session
from app.schemas.analytics import (
    AnalyticsEfficiencyItem,
    AnalyticsInsightItem,
    AnalyticsOverviewResponse,
    AnalyticsTcoItem,
    DriverRiskItem,
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/api/analytics", tags=["Analytics"], dependencies=[Depends(require_admin)])


@router.get("/overview", response_model=AnalyticsOverviewResponse)
async def analytics_overview(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db_session),
):
    return await AnalyticsService(db).overview(period_days)


@router.get("/efficiency", response_model=list[AnalyticsEfficiencyItem])
async def analytics_efficiency(
    period_days: int = Query(default=30, ge=1, le=365),
    vehicle_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await AnalyticsService(db).efficiency(period_days, vehicle_type)


@router.get("/costs/tco", response_model=list[AnalyticsTcoItem])
async def analytics_tco(
    period_days: int = Query(default=30, ge=1, le=365),
    vehicle_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await AnalyticsService(db).tco(period_days, vehicle_type)


@router.get("/risk/drivers", response_model=list[DriverRiskItem])
async def analytics_driver_risk(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db_session),
):
    return await AnalyticsService(db).driver_risk(period_days)


@router.get("/insights", response_model=list[AnalyticsInsightItem])
async def analytics_insights(
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db_session),
):
    return await AnalyticsService(db).insights(period_days)


@router.get("/export")
async def analytics_export(
    export_format: str = Query(default="xlsx", pattern="^(pdf|xlsx)$"),
    period_days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    return await AnalyticsService(db).export(period_days=period_days, export_format=export_format)
