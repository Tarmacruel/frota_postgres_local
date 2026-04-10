from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PossessionCreate(BaseModel):
    vehicle_id: UUID
    driver_name: str = Field(min_length=3, max_length=150)
    driver_document: str | None = Field(default=None, max_length=20)
    driver_contact: str | None = Field(default=None, max_length=50)
    start_date: datetime | None = None
    observation: str | None = Field(default=None, max_length=1000)
    photo_captured_at: datetime
    capture_latitude: float
    capture_longitude: float
    capture_accuracy_meters: float

    @field_validator("driver_name")
    @classmethod
    def validate_driver_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("Nome do condutor deve ter ao menos 3 caracteres")
        return normalized

    @field_validator("driver_document", "driver_contact", "observation")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("capture_latitude")
    @classmethod
    def validate_latitude(cls, value: float) -> float:
        if value < -90 or value > 90:
            raise ValueError("Latitude deve estar entre -90 e 90")
        return value

    @field_validator("capture_longitude")
    @classmethod
    def validate_longitude(cls, value: float) -> float:
        if value < -180 or value > 180:
            raise ValueError("Longitude deve estar entre -180 e 180")
        return value

    @field_validator("capture_accuracy_meters")
    @classmethod
    def validate_accuracy(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Precisao da localizacao deve ser maior que zero")
        return value


class PossessionUpdate(BaseModel):
    end_date: datetime | None = None
    observation: str | None = Field(default=None, max_length=1000)

    @field_validator("observation")
    @classmethod
    def normalize_observation(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class CaptureLocationOut(BaseModel):
    latitude: float
    longitude: float
    accuracy_meters: float
    maps_url: str


class PossessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    driver_name: str
    driver_document: str | None
    driver_contact: str | None
    start_date: datetime
    end_date: datetime | None
    observation: str | None
    created_at: datetime
    is_active: bool
    photo_available: bool
    photo_url: str | None
    photo_captured_at: datetime | None
    capture_location: CaptureLocationOut | None
