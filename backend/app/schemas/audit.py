from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.schemas.common import PaginatedResponse


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    actor_user_id: UUID | None
    actor_name: str
    actor_email: str | None
    actor_role: str | None
    action: str
    entity_type: str
    entity_id: UUID
    entity_label: str
    details: dict | None
    created_at: datetime


class AuditLogWithOrganizationOut(AuditLogOut):
    organization_id: UUID | None = None
    organization_name: str = "Sem secretaria"


class AuditListResponse(PaginatedResponse[AuditLogWithOrganizationOut]):
    deleted: int = 0
