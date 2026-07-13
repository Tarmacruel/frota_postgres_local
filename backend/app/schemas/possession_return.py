from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PossessionReturnDeclarationOut(BaseModel):
    version: str
    text: str


class PossessionEndWithConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    end_date: datetime
    end_odometer_km: float = Field(ge=0)
    vehicle_condition_notes: str = Field(min_length=3, max_length=4000)
    declaration_accepted: bool

    @field_validator("vehicle_condition_notes")
    @classmethod
    def normalize_notes(cls, value: str) -> str:
        return " ".join(value.split())


class PossessionReturnCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    end_odometer_km: float = Field(ge=0)
    vehicle_condition_notes: str = Field(min_length=3, max_length=4000)
    correction_reason: str = Field(min_length=8, max_length=1000)
    declaration_accepted: bool

    @field_validator("vehicle_condition_notes", "correction_reason")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        return " ".join(value.split())


class PossessionReturnConfirmationOut(BaseModel):
    id: UUID
    version: int
    is_current: bool
    declaration_version: str
    declaration_text: str
    canonical_payload_hash: str
    confirmer_name: str
    confirmer_role: str
    confirmed_at: datetime
    final_odometer_km: float
    vehicle_condition_notes: str
    last_trip_id: UUID | None
    superseded_at: datetime | None
    superseded_by_confirmation_id: UUID | None
    admin_correction_reason: str | None


class PossessionReturnContextOut(BaseModel):
    possession_id: UUID
    possession_public_number: int
    vehicle_plate: str
    driver_name: str
    start_date: datetime
    start_odometer_km: float | None
    last_trip_id: UUID | None
    minimum_end_odometer_km: float
    has_open_trip: bool
    declaration: PossessionReturnDeclarationOut
    current_confirmation: PossessionReturnConfirmationOut | None


class PossessionEndResult(BaseModel):
    possession: dict
    confirmation: PossessionReturnConfirmationOut
