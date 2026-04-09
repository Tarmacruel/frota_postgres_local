from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.user import UserRole
from app.schemas.common import normalize_email


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: str
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.PADRAO

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    email: str | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: UserRole | None = None

    @field_validator("email")
    @classmethod
    def validate_optional_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_email(value)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str
    role: UserRole
    created_at: datetime
    updated_at: datetime

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)
