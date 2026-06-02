from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.schemas.common import PaginatedResponse


class FuelSupplyCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID | None = None
    organization_id: UUID | None = None
    fuel_station_id: UUID | None = None
    supplied_at: datetime | None = None
    odometer_km: float = Field(gt=0)
    liters: float = Field(gt=0)
    total_amount: float = Field(gt=0)
    fuel_type: str = Field(min_length=1, max_length=80)
    additive_type: str | None = Field(default=None, max_length=80)
    additive_quantity_liters: float | None = Field(default=None, gt=0)
    fuel_station: str | None = Field(default=None, max_length=180)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("fuel_type")
    @classmethod
    def normalize_required_fuel_type(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Tipo de combustível é obrigatório")
        return normalized

    @field_validator("additive_type", "fuel_station", "notes")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_additive_details(self) -> "FuelSupplyCreate":
        if self.additive_quantity_liters is not None and not self.additive_type:
            raise ValueError("Tipo do aditivo deve ser informado quando houver quantidade de aditivo")
        return self


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
    fuel_type: str | None
    additive_type: str | None
    additive_quantity_liters: float | None
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


class FuelSupplyOrderCreate(BaseModel):
    vehicle_id: UUID
    organization_id: UUID | None = None
    fuel_station_id: UUID
    expires_at: datetime
    requested_liters: float | None = Field(default=None, gt=0)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("notes")
    @classmethod
    def normalize_order_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FuelSupplyOrderConfirm(BaseModel):
    supplied_at: datetime | None = None
    odometer_km: float = Field(gt=0)
    liters: float = Field(gt=0)
    total_amount: float = Field(gt=0)
    fuel_type: str = Field(min_length=1, max_length=80)
    additive_type: str | None = Field(default=None, max_length=80)
    additive_quantity_liters: float | None = Field(default=None, gt=0)
    fuel_station: str | None = Field(default=None, max_length=180)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("fuel_type")
    @classmethod
    def normalize_required_fuel_type(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Tipo de combustível é obrigatório")
        return normalized

    @field_validator("additive_type", "fuel_station", "notes")
    @classmethod
    def normalize_confirm_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_additive_details(self) -> "FuelSupplyOrderConfirm":
        if self.additive_quantity_liters is not None and not self.additive_type:
            raise ValueError("Tipo do aditivo deve ser informado quando houver quantidade de aditivo")
        return self


class FuelSupplyOrderCancel(BaseModel):
    reason: str | None = Field(default=None, max_length=500)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FuelSupplyOrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    request_number: str
    validation_code: str
    public_validation_path: str
    status: FuelSupplyOrderStatus
    vehicle_id: UUID
    vehicle_plate: str
    vehicle_description: str | None
    driver_id: UUID | None
    driver_name: str | None
    driver_contact: str | None
    organization_id: UUID | None
    organization_name: str | None
    fuel_station_id: UUID | None
    fuel_station_name: str | None
    fuel_station_cnpj: str | None
    fuel_station_address: str | None
    fuel_station_phone: str | None
    fuel_station_latitude: float | None
    fuel_station_longitude: float | None
    fuel_station_maps_url: str | None
    created_by_user_id: UUID
    created_by_name: str | None
    created_by_contact: str | None
    confirmed_by_user_id: UUID | None
    confirmed_by_name: str | None
    expires_at: datetime
    requested_liters: float | None
    max_amount: float | None
    notes: str | None
    confirmed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class FuelSupplyOrderListResponse(PaginatedResponse[FuelSupplyOrderOut]):
    pass


class FuelSupplyOrderPublicOut(BaseModel):
    request_number: str
    validation_code: str
    public_validation_path: str
    status: FuelSupplyOrderStatus
    vehicle_plate: str
    vehicle_description: str | None
    organization_name: str | None
    fuel_station_name: str | None
    fuel_station_cnpj: str | None
    fuel_station_address: str | None
    fuel_station_phone: str | None
    fuel_station_latitude: float | None
    fuel_station_longitude: float | None
    fuel_station_maps_url: str | None
    created_by_name: str | None
    confirmed_by_name: str | None
    requested_liters: float | None
    notes: str | None
    created_at: datetime
    expires_at: datetime
    confirmed_at: datetime | None
