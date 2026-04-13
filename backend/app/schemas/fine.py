from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.fine import FineStatus
from app.schemas.common import PaginatedResponse


class FineCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID | None = None
    ticket_number: str = Field(min_length=3, max_length=50)
    infraction_date: date
    due_date: date | None = None
    amount: Decimal = Field(ge=0)
    description: str = Field(min_length=5, max_length=4000)
    location: str | None = Field(default=None, max_length=200)
    status: FineStatus = FineStatus.PENDENTE

    @field_validator("ticket_number", "description", "location")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FineUpdate(BaseModel):
    driver_id: UUID | None = None
    ticket_number: str | None = Field(default=None, min_length=3, max_length=50)
    infraction_date: date | None = None
    due_date: date | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, min_length=5, max_length=4000)
    location: str | None = Field(default=None, max_length=200)
    status: FineStatus | None = None


class FineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    driver_id: UUID | None
    driver_name: str | None
    ticket_number: str
    infraction_date: date
    due_date: date | None
    amount: Decimal
    description: str
    location: str | None
    status: FineStatus
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class FineListResponse(PaginatedResponse[FineOut]):
    pass
