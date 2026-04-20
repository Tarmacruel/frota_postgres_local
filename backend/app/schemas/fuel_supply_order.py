from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.schemas.common import PaginatedResponse


class FuelSupplyOrderCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID | None = None
    organization_id: UUID | None = None
    fuel_station_id: UUID | None = None
    requested_liters: float | None = Field(default=None, gt=0)
    max_amount: float | None = Field(default=None, ge=0)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("notes")
    @classmethod
    def normalize_notes(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FuelSupplyOrderFilter(BaseModel):
    status: FuelSupplyOrderStatus | None = None
    vehicle_id: UUID | None = None
    fuel_station_id: UUID | None = None


class FuelSupplyOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    driver_id: UUID | None
    organization_id: UUID | None
    fuel_station_id: UUID | None
    fuel_station_name: str | None
    status: FuelSupplyOrderStatus
    expires_at: datetime
    remaining_seconds: int
    created_by_user_id: UUID
    confirmed_by_user_id: UUID | None
    requested_liters: float | None
    max_amount: float | None
    notes: str | None
    confirmed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class FuelSupplyOrderConfirmPayload(BaseModel):
    notes: str | None = Field(default=None, max_length=4000)


class FuelSupplyOrderListResponse(PaginatedResponse[FuelSupplyOrderOut]):
    pass
