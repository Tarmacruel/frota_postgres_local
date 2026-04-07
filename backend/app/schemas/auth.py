from __future__ import annotations

from uuid import UUID
from pydantic import BaseModel, field_validator
from app.models.user import UserRole
from app.schemas.common import normalize_email


class LoginInput(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class MessageOut(BaseModel):
    message: str


class CurrentUserOut(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)
