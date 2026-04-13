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


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str

    @field_validator("current_password", "new_password")
    @classmethod
    def validate_password_fields(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 8:
            raise ValueError("Senha deve ter ao menos 8 caracteres")
        return normalized


class CurrentUserOut(BaseModel):
    id: UUID
    name: str
    email: str
    role: UserRole

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)
