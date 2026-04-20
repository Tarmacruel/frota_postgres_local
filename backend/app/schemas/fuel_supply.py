from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.common import PaginatedResponse


class FuelSupplyCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID | None = None
    organization_id: UUID | None = None
    fuel_station_id: UUID | None = None
    supplied_at: datetime | None = None
    odometer_km: float = Field(gt=0)
    liters: float = Field(gt=0)
    total_amount: float | None = Field(default=None, ge=0)
    fuel_station: str | None = Field(default=None, max_length=180)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("fuel_station", "notes")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FuelSupplyFilter(BaseModel):
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    organization_id: UUID | None = None
    fuel_station_id: UUID | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    only_anomalies: bool | None = None


class FuelSupplyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    driver_id: UUID | None
    driver_name: str | None
    organization_id: UUID | None
    organization_name: str | None
    supplied_at: datetime
    odometer_km: float
    liters: float
    total_amount: float | None
    fuel_station_id: UUID | None
    fuel_station_name: str | None
    fuel_station: str | None
    notes: str | None
    consumption_km_l: float | None
    is_consumption_anomaly: bool
    anomaly_details: str | None
    receipt_url: str
    receipt_mime_type: str
    receipt_size_bytes: int
    receipt_uploaded_at: datetime
    alerts: list[str]
    created_at: datetime
    updated_at: datetime


class FuelSupplyListResponse(PaginatedResponse[FuelSupplyOut]):
    pass


class FuelConsumptionReportItem(BaseModel):
    vehicle_id: UUID
    vehicle_plate: str
    supplies_count: int
    liters_total: float
    distance_total_km: float
    average_consumption_km_l: float | None


class FuelAnomalyReportItem(BaseModel):
    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    supplied_at: datetime
    consumption_km_l: float | None
    anomaly_details: str | None
