from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.possession_trip import VehiclePossessionTripStatus
from app.schemas.common import PaginatedResponse


class _StrictSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @staticmethod
    def _normalize_required(value: str) -> str:
        return value.strip()

    @staticmethod
    def _normalize_optional(value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @staticmethod
    def _timezone_aware(value: datetime | None) -> datetime | None:
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("Data e hora devem informar fuso horÃ¡rio")
        return value


class TripDestinationCreate(_StrictSchema):
    description: str = Field(min_length=1, max_length=300)
    address_reference: str | None = Field(default=None, max_length=500)
    observation: str | None = Field(default=None, max_length=2000)
    arrived_at: datetime | None = None
    departed_at: datetime | None = None

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return cls._normalize_required(value)

    @field_validator("address_reference", "observation")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        return cls._normalize_optional(value)

    @field_validator("arrived_at", "departed_at")
    @classmethod
    def validate_timezone(cls, value: datetime | None) -> datetime | None:
        return cls._timezone_aware(value)

    @model_validator(mode="after")
    def validate_time_order(self):
        if self.departed_at is not None and self.arrived_at is None:
            raise ValueError("A saÃ­da do destino exige data/hora de chegada")
        if self.departed_at is not None and self.departed_at < self.arrived_at:
            raise ValueError("A saÃ­da do destino nÃ£o pode anteceder a chegada")
        return self


class TripDestinationBatchCreate(_StrictSchema):
    destinations: list[TripDestinationCreate] = Field(min_length=1, max_length=50)


class TripCreate(_StrictSchema):
    origin: str = Field(min_length=1, max_length=255)
    purpose: str = Field(min_length=1, max_length=500)
    departure_at: datetime
    start_odometer_km: Decimal = Field(ge=0, max_digits=12, decimal_places=1)
    observation: str | None = Field(default=None, max_length=2000)
    destinations: list[TripDestinationCreate] = Field(default_factory=list, max_length=50)

    @field_validator("origin", "purpose")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        return cls._normalize_required(value)

    @field_validator("observation")
    @classmethod
    def normalize_observation(cls, value: str | None) -> str | None:
        return cls._normalize_optional(value)

    @field_validator("departure_at")
    @classmethod
    def validate_departure_timezone(cls, value: datetime) -> datetime:
        return cls._timezone_aware(value)


class TripEnd(_StrictSchema):
    return_at: datetime
    end_odometer_km: Decimal = Field(ge=0, max_digits=12, decimal_places=1)
    observation: str | None = Field(default=None, max_length=2000)

    @field_validator("return_at")
    @classmethod
    def validate_return_timezone(cls, value: datetime) -> datetime:
        return cls._timezone_aware(value)

    @field_validator("observation")
    @classmethod
    def normalize_observation(cls, value: str | None) -> str | None:
        return cls._normalize_optional(value)


class TripCancel(_StrictSchema):
    reason: str = Field(min_length=8, max_length=1000)

    @field_validator("reason")
    @classmethod
    def normalize_reason(cls, value: str) -> str:
        return cls._normalize_required(value)


class TripDestinationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sequence_number: int
    description: str
    address_reference: str | None
    observation: str | None
    arrived_at: datetime | None
    departed_at: datetime | None
    created_at: datetime


class TripOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    possession_id: UUID
    sequence_number: int
    status: VehiclePossessionTripStatus
    origin: str
    purpose: str
    departure_at: datetime
    return_at: datetime | None
    start_odometer_km: Decimal
    end_odometer_km: Decimal | None
    kilometers_driven: Decimal | None
    observation: str | None
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime
    closed_at: datetime | None
    cancelled_at: datetime | None
    destinations: list[TripDestinationOut]
    operational_details_restricted: bool = False


class TripListResponse(PaginatedResponse[TripOut]):
    pass
