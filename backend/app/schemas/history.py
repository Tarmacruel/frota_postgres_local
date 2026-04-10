from __future__ import annotations

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
