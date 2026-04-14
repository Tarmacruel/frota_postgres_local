from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class AdminNotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    message: str
    event_type: str
    severity: str
    payload: dict | None
    read_at: datetime | None
    created_at: datetime


class AdminNotificationCountOut(BaseModel):
    unread: int
