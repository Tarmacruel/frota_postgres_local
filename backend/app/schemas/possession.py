from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.schemas.common import PaginatedResponse


class PossessionCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID | None = None
    driver_name: str = Field(min_length=3, max_length=150)
    driver_document: str | None = Field(default=None, max_length=20)
    driver_contact: str | None = Field(default=None, max_length=50)
    start_date: datetime | None = None
    observation: str | None = Field(default=None, max_length=1000)
    start_odometer_km: float | None = Field(default=None, ge=0)

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


class PossessionUpdate(BaseModel):
    end_date: datetime | None = None
    observation: str | None = Field(default=None, max_length=1000)
    end_odometer_km: float | None = Field(default=None, ge=0)

    @field_validator("observation")
    @classmethod
    def normalize_observation(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class PossessionAdminUpdate(BaseModel):
    driver_id: UUID | None = None
    driver_name: str = Field(min_length=3, max_length=150)
    driver_document: str | None = Field(default=None, max_length=20)
    driver_contact: str | None = Field(default=None, max_length=50)
    start_date: datetime
    end_date: datetime | None = None
    observation: str | None = Field(default=None, max_length=1000)
    start_odometer_km: float | None = Field(default=None, ge=0)
    end_odometer_km: float | None = Field(default=None, ge=0)
    edit_reason: str = Field(min_length=8, max_length=500)

    @field_validator("driver_name")
    @classmethod
    def validate_admin_driver_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("Nome do condutor deve ter ao menos 3 caracteres")
        return normalized

    @field_validator("driver_document", "driver_contact", "observation")
    @classmethod
    def normalize_admin_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("edit_reason")
    @classmethod
    def validate_edit_reason(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 8:
            raise ValueError("Justificativa da edicao deve ter ao menos 8 caracteres")
        return normalized


class CaptureLocationOut(BaseModel):
    latitude: float
    longitude: float
    accuracy_meters: float
    maps_url: str


class PossessionPhotoCreate(BaseModel):
    photo_captured_at: datetime
    capture_latitude: float
    capture_longitude: float
    capture_accuracy_meters: float

    @field_validator("capture_latitude")
    @classmethod
    def validate_photo_latitude(cls, value: float) -> float:
        if value < -90 or value > 90:
            raise ValueError("Latitude deve estar entre -90 e 90")
        return value

    @field_validator("capture_longitude")
    @classmethod
    def validate_photo_longitude(cls, value: float) -> float:
        if value < -180 or value > 180:
            raise ValueError("Longitude deve estar entre -180 e 180")
        return value

    @field_validator("capture_accuracy_meters")
    @classmethod
    def validate_photo_accuracy(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("Precisao da localizacao deve ser maior que zero")
        return value


class PossessionPhotoOut(BaseModel):
    id: UUID | None = None
    url: str
    captured_at: datetime | None
    capture_location: CaptureLocationOut | None
    is_legacy: bool = False


class PossessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    driver_id: UUID | None
    driver_name: str
    driver_document: str | None
    driver_contact: str | None
    start_date: datetime
    end_date: datetime | None
    observation: str | None
    start_odometer_km: float | None
    end_odometer_km: float | None
    kilometers_driven: float | None
    created_at: datetime
    is_active: bool
    photo_available: bool
    photo_count: int
    photo_url: str | None
    photo_captured_at: datetime | None
    photos: list[PossessionPhotoOut]
    document_available: bool
    document_name: str | None
    document_url: str | None
    document_uploaded_at: datetime | None
    capture_location: CaptureLocationOut | None


class PossessionListResponse(PaginatedResponse[PossessionOut]):
    pass
