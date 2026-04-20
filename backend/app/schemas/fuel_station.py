from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class FuelStationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    cnpj: str | None = Field(default=None, max_length=18)
    address: str = Field(min_length=4, max_length=255)
    active: bool = True

    @field_validator("name", "address", "cnpj")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FuelStationUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    cnpj: str | None = Field(default=None, max_length=18)
    address: str = Field(min_length=4, max_length=255)
    active: bool = True

    @field_validator("name", "address", "cnpj")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FuelStationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    cnpj: str | None
    address: str
    active: bool
    created_at: datetime
    updated_at: datetime


class FuelStationUserCreate(BaseModel):
    user_id: UUID
    active: bool = True


class FuelStationUserUpdate(BaseModel):
    active: bool


class FuelStationUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    fuel_station_id: UUID
    active: bool
    created_at: datetime
    updated_at: datetime
    user_name: str | None = None
    user_email: str | None = None
