from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator

TagColor = Literal[
    'blue', 'amber', 'red', 'green', 'purple', 'neutral',
    'orange', 'teal', 'pink', 'cyan', 'indigo', 'brown',
]


class VehicleTagWrite(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=40)
    color: TagColor = 'blue'
    is_active: bool = True

    @field_validator('name', mode='before')
    @classmethod
    def clean_name(cls, value):
        return ' '.join(value.split()) if isinstance(value, str) else value


class VehicleTagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    owner_user_id: UUID | None
    owner_name: str
    name: str
    color: TagColor
    is_active: bool


class VehicleTagApply(BaseModel):
    model_config = ConfigDict(extra='forbid')
    tag_id: UUID
    note: str | None = Field(default=None, max_length=500)


class VehicleTagRemove(BaseModel):
    model_config = ConfigDict(extra='forbid')
    reason: str | None = Field(default=None, max_length=500)


class VehicleTagMarkOut(BaseModel):
    id: UUID
    tag_id: UUID
    name: str
    color: TagColor
    owner_user_id: UUID | None
    owner_name: str
    applied_by_user_id: UUID | None
    applied_by_name: str
    applied_at: datetime
    note: str | None
