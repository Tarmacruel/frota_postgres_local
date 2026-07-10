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
    renavam: str | None = Field(default=None, max_length=30)
    brand: str = Field(min_length=1, max_length=50)
    model: str = Field(min_length=1, max_length=50)
    year: str | None = Field(default=None, max_length=20)
    prefix: str | None = Field(default=None, max_length=80)
    patrimonio_numero_frota: str | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, max_length=40)
    fuel_type: str | None = Field(default=None, max_length=120)
    tank_capacity_liters: float | None = Field(default=None, ge=0)
    transmission: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=2)
    registered_detran: bool | None = None
    engine_spec: str | None = Field(default=None, max_length=120)
    is_provisional: bool = False
    provisional_source: str | None = Field(default=None, max_length=255)
    vehicle_type: VehicleType
    ownership_type: VehicleOwnershipType = VehicleOwnershipType.PROPRIO
    status: VehicleStatus = VehicleStatus.ATIVO
    allocation_id: UUID


class VehicleUpdate(BaseModel):
    plate: str | None = Field(default=None, min_length=5, max_length=20)
    chassis_number: str | None = Field(default=None, min_length=5, max_length=50)
    renavam: str | None = Field(default=None, max_length=30)
    brand: str | None = Field(default=None, min_length=1, max_length=50)
    model: str | None = Field(default=None, min_length=1, max_length=50)
    year: str | None = Field(default=None, max_length=20)
    prefix: str | None = Field(default=None, max_length=80)
    patrimonio_numero_frota: str | None = Field(default=None, max_length=80)
    color: str | None = Field(default=None, max_length=40)
    fuel_type: str | None = Field(default=None, max_length=120)
    tank_capacity_liters: float | None = Field(default=None, ge=0)
    transmission: str | None = Field(default=None, max_length=40)
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=2)
    registered_detran: bool | None = None
    engine_spec: str | None = Field(default=None, max_length=120)
    is_provisional: bool | None = None
    provisional_source: str | None = Field(default=None, max_length=255)
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
            raise ValueError("Justificativa da edição deve ter ao menos 8 caracteres")
        return normalized


class VehicleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plate: str
    chassis_number: str | None = None
    renavam: str | None = None
    brand: str
    model: str
    year: str | None = None
    prefix: str | None = None
    patrimonio_numero_frota: str | None = None
    color: str | None = None
    fuel_type: str | None = None
    tank_capacity_liters: float | None = None
    transmission: str | None = None
    city: str | None = None
    state: str | None = None
    registered_detran: bool | None = None
    engine_spec: str | None = None
    is_provisional: bool = False
    provisional_source: str | None = None
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
