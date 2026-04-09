from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models.vehicle import VehicleStatus


class VehicleCreate(BaseModel):
    plate: str = Field(min_length=5, max_length=20)
    brand: str = Field(min_length=1, max_length=50)
    model: str = Field(min_length=1, max_length=50)
    status: VehicleStatus = VehicleStatus.ATIVO
    department: str = Field(min_length=1, max_length=100)


class VehicleUpdate(BaseModel):
    plate: str | None = Field(default=None, min_length=5, max_length=20)
    brand: str | None = Field(default=None, min_length=1, max_length=50)
    model: str | None = Field(default=None, min_length=1, max_length=50)
    status: VehicleStatus | None = None
    department: str | None = Field(default=None, min_length=1, max_length=100)


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plate: str
    brand: str
    model: str
    status: VehicleStatus
    current_department: str | None = None
    current_driver_name: str | None = None
    created_at: datetime
    updated_at: datetime
