from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class AnalyticsOverviewResponse(BaseModel):
    period_days: int
    fleet_active: int
    average_consumption_l_100km: float
    average_tco_per_km: float
    active_alerts: int
    generated_at: datetime


class AnalyticsEfficiencyItem(BaseModel):
    vehicle_type: str
    vehicle_id: UUID | None = None
    total_km: float
    total_liters: float
    consumption_l_100km: float | None
    category_average: float | None
    variance_percentage: float | None


class AnalyticsTcoItem(BaseModel):
    vehicle_type: str
    vehicle_id: UUID | None = None
    total_km: float
    tco_cost_per_km: float | None
    category_average: float | None
    market_benchmark: float | None
    variance_percentage: float | None


class DriverRiskItem(BaseModel):
    driver_id: UUID
    driver_name: str
    fines_count: int
    claims_count: int
    anomalies_count: int
    risk_score: float
    normalized_risk_score: float = Field(ge=0, le=100)


class AnalyticsInsightItem(BaseModel):
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    vehicle_type: str
    metric: str
    current_value: float
    category_average: float | None = None
    variance_percentage: float | None = None
    severity: str
    message: str
    recommended_action: str
    generated_at: datetime


class AnalyticsExportResponse(BaseModel):
    export_type: str
    generated_at: datetime
    filename: str


class AnalyticsCostTrendItem(BaseModel):
    month: str
    fuel_cost: float
    maintenance_cost: float
    fines_cost: float
    total_cost: float
