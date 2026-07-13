from __future__ import annotations

from datetime import datetime, timedelta
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


class PossessionReportMode(str, Enum):
    POSSESSION = "POSSESSION"
    TRIP = "TRIP"


class PossessionReportPreset(str, Enum):
    SUMMARY = "SUMMARY"
    OPERATIONAL = "OPERATIONAL"
    COMPLETE = "COMPLETE"
    CUSTOM = "CUSTOM"


class PossessionReportOrientation(str, Enum):
    PORTRAIT = "PORTRAIT"
    LANDSCAPE = "LANDSCAPE"


class PossessionTemporalField(str, Enum):
    POSSESSION_START = "POSSESSION_START"
    TRIP_DEPARTURE = "TRIP_DEPARTURE"


class PossessionStatusFilter(str, Enum):
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class TripStatusFilter(str, Enum):
    IN_PROGRESS = "EM_ANDAMENTO"
    CLOSED = "ENCERRADA"
    CANCELLED = "CANCELADA"


class PossessionReportFilters(BaseModel):
    date_from: datetime | None = None
    date_to: datetime | None = None
    temporal_field: PossessionTemporalField = PossessionTemporalField.POSSESSION_START
    vehicle_id: UUID | None = None
    driver_id: UUID | None = None
    organization_id: UUID | None = None
    possession_status: PossessionStatusFilter | None = None
    trip_status: TripStatusFilter | None = None
    has_return: bool | None = None
    has_return_confirmation: bool | None = None
    search: str | None = Field(default=None, max_length=100)

    @field_validator("date_from", "date_to")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.utcoffset() is None:
            raise ValueError("Datas do relatório devem incluir fuso horário")
        return value

    @field_validator("search")
    @classmethod
    def normalize_search(cls, value: str | None) -> str | None:
        normalized = value.strip() if value else ""
        return normalized or None

    @model_validator(mode="after")
    def validate_range(self):
        if self.date_from and self.date_to:
            if self.date_to < self.date_from:
                raise ValueError("A data final deve ser posterior à data inicial")
            if self.date_to - self.date_from > timedelta(days=366):
                raise ValueError("O período máximo do relatório é de 366 dias")
        return self


class PossessionReportRequest(BaseModel):
    mode: PossessionReportMode = PossessionReportMode.POSSESSION
    preset: PossessionReportPreset = PossessionReportPreset.SUMMARY
    column_keys: list[str] | None = Field(default=None, min_length=1, max_length=30)
    filters: PossessionReportFilters = Field(default_factory=PossessionReportFilters)
    orientation: PossessionReportOrientation = PossessionReportOrientation.LANDSCAPE

    @field_validator("column_keys")
    @classmethod
    def validate_column_keys(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        if len(set(value)) != len(value):
            raise ValueError("As colunas não podem ser repetidas")
        for key in value:
            if not key or len(key) > 64 or not key.replace("_", "").isalnum():
                raise ValueError("Chave de coluna inválida")
        return value

    @model_validator(mode="after")
    def validate_mode_and_columns(self):
        if self.preset == PossessionReportPreset.CUSTOM and not self.column_keys:
            raise ValueError("O preset personalizado exige ao menos uma coluna")
        if self.preset != PossessionReportPreset.CUSTOM and self.column_keys is not None:
            raise ValueError("Colunas manuais exigem o preset personalizado")
        if self.mode == PossessionReportMode.POSSESSION and self.filters.temporal_field == PossessionTemporalField.TRIP_DEPARTURE:
            raise ValueError("Saída da rota só pode ser usada no modo por rota")
        return self


class PossessionReportPreferenceIn(BaseModel):
    mode: PossessionReportMode
    preset: PossessionReportPreset
    column_keys: list[str] = Field(min_length=1, max_length=30)

    @field_validator("column_keys")
    @classmethod
    def validate_preference_keys(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("As colunas não podem ser repetidas")
        return value


class PossessionReportPreferenceOut(PossessionReportPreferenceIn):
    sanitized: bool = False
