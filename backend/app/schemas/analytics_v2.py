"""Read-only V2 contract. No V1 response or persisted model is changed."""
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.vehicle import VehicleType


class AnalyticsV2Filter(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    date_from: date
    date_to: date
    organization: UUID | None = None
    vehicle_type: VehicleType | None = None
    vehicle_id: UUID | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if self.date_from > self.date_to:
            raise ValueError("date_from deve ser anterior ou igual a date_to")
        if not 1 <= (self.date_to - self.date_from).days + 1 <= 366:
            raise ValueError("O intervalo deve conter entre 1 e 366 dias")
        if self.date_from.year < 1901:
            raise ValueError("date_from deve ser a partir de 1901")
        return self


class AnalyticsV2Period(BaseModel):
    date_from: date
    date_to: date
    timezone: str = "America/Bahia"
    start_at: datetime
    end_exclusive: datetime
    days: int


class AnalyticsV2Comparison(BaseModel):
    reference: Literal["previous_period"] = "previous_period"
    value: Decimal | None
    delta: Decimal | None
    delta_percent: Decimal | None


class AnalyticsV2Calculation(BaseModel):
    formula: str
    sources: list[str]
    numerator: Decimal | None = None
    denominator: Decimal | None = None
    reference_type: str | None = None
    reference_source: str | None = None
    rule_version: str = "analytics-v2.1"
    limitations: list[str] = Field(default_factory=list)
    sample_size: int | None = None


class AnalyticsV2Kpi(BaseModel):
    key: str
    label: str
    value: Decimal | None
    unit: str
    quality: Literal["recorded", "partial", "unavailable"]
    comparison: AnalyticsV2Comparison
    calculation: AnalyticsV2Calculation


class AnalyticsV2Amount(BaseModel):
    value: Decimal | None
    known_value: Decimal
    records: int
    missing_or_invalid: int


class AnalyticsV2Totals(BaseModel):
    fuel: AnalyticsV2Amount
    maintenance: AnalyticsV2Amount
    fines: AnalyticsV2Amount
    claim_estimate: AnalyticsV2Amount
    fines_by_status: dict[str, AnalyticsV2Amount]
    operational_cost: AnalyticsV2Amount
    liters: AnalyticsV2Amount


class AnalyticsV2Month(BaseModel):
    month: str
    date_from: date
    date_to: date
    totals: AnalyticsV2Totals


class AnalyticsV2DriverRisk(BaseModel):
    driver_id: UUID
    fines_count: int
    claims_count: int
    anomalies_count: int
    score: Decimal


class AnalyticsV2Mileage(BaseModel):
    source: Literal["closed_possessions"] = "closed_possessions"
    distance_km: Decimal | None
    valid_records: int
    excluded_records: int
    crossing_records: int
    overlapping_records: int
    vehicles_with_valid_distance: int


class AnalyticsV2Summary(BaseModel):
    version: Literal["2"] = "2"
    generated_at: datetime
    filters: AnalyticsV2Filter
    period: AnalyticsV2Period
    previous_period: AnalyticsV2Period
    kpis: list[AnalyticsV2Kpi]
    current: AnalyticsV2Totals
    previous: AnalyticsV2Totals
    monthly: list[AnalyticsV2Month]
    driver_risk: list[AnalyticsV2DriverRisk]
    mileage: AnalyticsV2Mileage
    previous_mileage: AnalyticsV2Mileage
    quality: dict[str, int | str]
    methodology: dict[str, str]
