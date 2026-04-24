from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.schemas.common import PaginatedResponse


class MaintenanceCreate(BaseModel):
    vehicle_id: UUID
    start_date: datetime
    end_date: datetime | None = None
    service_description: str = Field(min_length=10, max_length=2000)
    parts_replaced: str | None = Field(default=None, max_length=1000)
    total_cost: Decimal = Field(ge=0)

    @field_validator("service_description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Descricao não pode ser vazia")
        return normalized

    @field_validator("parts_replaced")
    @classmethod
    def normalize_parts(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_dates(self) -> "MaintenanceCreate":
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("Data final não pode ser anterior a data inicial")
        return self


class MaintenanceUpdate(BaseModel):
    end_date: datetime | None = None
    service_description: str | None = Field(default=None, min_length=10, max_length=2000)
    parts_replaced: str | None = Field(default=None, max_length=1000)
    total_cost: Decimal | None = Field(default=None, ge=0)

    @field_validator("service_description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("Descricao não pode ser vazia")
        return normalized

    @field_validator("parts_replaced")
    @classmethod
    def normalize_parts(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class MaintenanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    start_date: datetime
    end_date: datetime | None
    service_description: str
    parts_replaced: str | None
    total_cost: Decimal
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class MaintenanceListResponse(PaginatedResponse[MaintenanceOut]):
    pass
