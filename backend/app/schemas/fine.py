from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.fine import FineStatus
from app.schemas.common import PaginatedResponse


class FineCreate(BaseModel):
    vehicle_id: UUID
    driver_id: UUID | None = None
    infraction_type_id: UUID
    ticket_number: str = Field(min_length=3, max_length=50)
    infraction_date: date
    infraction_time: time | None = None
    due_date: date | None = None
    amount: Decimal = Field(ge=0)
    description: str | None = Field(default=None, max_length=4000)
    location: str | None = Field(default=None, max_length=200)
    status: FineStatus = FineStatus.PENDENTE
    communication_number: str | None = Field(default=None, max_length=50)
    sent_date: date | None = None
    process_number: str | None = Field(default=None, max_length=80)
    source_status: str | None = Field(default=None, max_length=80)
    imported_driver_name: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("ticket_number", "description", "location")
    @classmethod
    def normalize_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FineUpdate(BaseModel):
    driver_id: UUID | None = None
    infraction_type_id: UUID | None = None
    ticket_number: str | None = Field(default=None, min_length=3, max_length=50)
    infraction_date: date | None = None
    infraction_time: time | None = None
    due_date: date | None = None
    amount: Decimal | None = Field(default=None, ge=0)
    description: str | None = Field(default=None, max_length=4000)
    location: str | None = Field(default=None, max_length=200)
    status: FineStatus | None = None
    communication_number: str | None = Field(default=None, max_length=50)
    sent_date: date | None = None
    process_number: str | None = Field(default=None, max_length=80)
    source_status: str | None = Field(default=None, max_length=80)
    imported_driver_name: str | None = Field(default=None, max_length=150)
    notes: str | None = Field(default=None, max_length=4000)


class FineInfractionBase(BaseModel):
    code: str = Field(min_length=1, max_length=40)
    desdobramento: str = Field(default="0", min_length=1, max_length=10)
    description: str = Field(min_length=3, max_length=4000)
    ctb_article: str | None = Field(default=None, max_length=120)
    offender: str | None = Field(default=None, max_length=80)
    severity: str | None = Field(default=None, max_length=80)
    competent_body: str | None = Field(default=None, max_length=120)
    default_amount: Decimal | None = Field(default=None, ge=0)
    points: int | None = Field(default=None, ge=0, le=99)
    is_active: bool = True
    source: str | None = Field(default=None, max_length=255)

    @field_validator("code", "desdobramento", "description", "ctb_article", "offender", "severity", "competent_body", "source")
    @classmethod
    def normalize_infraction_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class FineInfractionCreate(FineInfractionBase):
    pass


class FineInfractionUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=40)
    desdobramento: str | None = Field(default=None, min_length=1, max_length=10)
    description: str | None = Field(default=None, min_length=3, max_length=4000)
    ctb_article: str | None = Field(default=None, max_length=120)
    offender: str | None = Field(default=None, max_length=80)
    severity: str | None = Field(default=None, max_length=80)
    competent_body: str | None = Field(default=None, max_length=120)
    default_amount: Decimal | None = Field(default=None, ge=0)
    points: int | None = Field(default=None, ge=0, le=99)
    is_active: bool | None = None
    source: str | None = Field(default=None, max_length=255)


class FineInfractionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    desdobramento: str
    description: str
    ctb_article: str | None
    offender: str | None
    severity: str | None
    competent_body: str | None
    default_amount: Decimal | None
    points: int | None
    is_active: bool
    is_official: bool
    is_provisional: bool
    source: str | None
    created_at: datetime
    updated_at: datetime


class FineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    vehicle_plate: str
    driver_id: UUID | None
    driver_name: str | None
    infraction_type_id: UUID | None
    infraction_type: FineInfractionOut | None
    ticket_number: str
    infraction_date: date
    infraction_time: time | None
    due_date: date | None
    amount: Decimal
    description: str
    location: str | None
    status: FineStatus
    communication_number: str | None
    sent_date: date | None
    process_number: str | None
    source_status: str | None
    imported_driver_name: str | None
    notes: str | None
    source_import_row_id: UUID | None
    created_by: UUID
    created_at: datetime
    updated_at: datetime


class FineListResponse(PaginatedResponse[FineOut]):
    pass
