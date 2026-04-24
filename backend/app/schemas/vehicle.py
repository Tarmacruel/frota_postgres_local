from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.vehicle import VehicleOwnershipType, VehicleStatus, VehicleType
from app.schemas.common import PaginatedResponse


class VehicleLocationOut(BaseModel):
    organization_id: UUID | None = None
    organization_name: str | None = None
    department_id: UUID | None = None
    department_name: str | None = None
    allocation_id: UUID | None = None
    allocation_name: str | None = None
    display_name: str


class VehicleCreate(BaseModel):
    plate: str = Field(min_length=5, max_length=20)
    chassis_number: str | None = Field(default=None, min_length=5, max_length=50)
    brand: str = Field(min_length=1, max_length=50)
    model: str = Field(min_length=1, max_length=50)
    vehicle_type: VehicleType
    ownership_type: VehicleOwnershipType = VehicleOwnershipType.PROPRIO
    status: VehicleStatus = VehicleStatus.ATIVO
    allocation_id: UUID


class VehicleUpdate(BaseModel):
    plate: str | None = Field(default=None, min_length=5, max_length=20)
    chassis_number: str | None = Field(default=None, min_length=5, max_length=50)
    brand: str | None = Field(default=None, min_length=1, max_length=50)
    model: str | None = Field(default=None, min_length=1, max_length=50)
    vehicle_type: VehicleType | None = None
    ownership_type: VehicleOwnershipType | None = None
    status: VehicleStatus | None = None
    allocation_id: UUID | None = None
    edit_reason: str = Field(min_length=8, max_length=500)

    @field_validator("edit_reason")
    @classmethod
    def validate_edit_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 8:
            raise ValueError("Justificativa da edicao deve ter ao menos 8 caracteres")
        return normalized


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plate: str
    chassis_number: str | None = None
    brand: str
    model: str
    vehicle_type: VehicleType
    ownership_type: VehicleOwnershipType
    status: VehicleStatus
    current_department: str | None = None
    current_location: VehicleLocationOut | None = None
    current_driver_name: str | None = None
    created_at: datetime
    updated_at: datetime


class VehicleListResponse(PaginatedResponse[VehicleOut]):
    pass
