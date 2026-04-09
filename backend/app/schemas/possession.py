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

    @field_validator("observation")
    @classmethod
    def normalize_observation(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


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
