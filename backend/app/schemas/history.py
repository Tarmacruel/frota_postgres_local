from __future__ import annotations

from enum import Enum
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class LocationHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    vehicle_id: UUID
    allocation_id: UUID | None = None
    department: str
    display_name: str
    organization_name: str | None = None
    department_name: str | None = None
    allocation_name: str | None = None
    start_date: datetime
    end_date: datetime | None
    created_at: datetime
    justification: str | None = None


class VehicleHistoryEventType(str, Enum):
    CREATE = "CREATE"
    EDIT = "EDIT"
    MOVEMENT = "MOVEMENT"


class VehicleHistoryEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    event_type: VehicleHistoryEventType
    action: str | None = None
    occurred_at: datetime
    title: str
    actor_name: str | None = None
    justification: str | None = None
    allocation_id: UUID | None = None
    department: str | None = None
    display_name: str | None = None
    organization_name: str | None = None
    department_name: str | None = None
    allocation_name: str | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    created_at: datetime | None = None
    before: dict | None = None
    after: dict | None = None
