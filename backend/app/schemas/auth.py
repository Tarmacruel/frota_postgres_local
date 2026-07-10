from __future__ import annotations

from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.core.cpf import normalize_cpf
from app.models.user import UserRole
from app.schemas.user import PermissionFlags
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


class RegisterCpfInput(BaseModel):
    cpf: str

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, value: str) -> str:
        return normalize_cpf(value)


class CurrentUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str
    role: UserRole
    must_change_password: bool = False
    cpf_masked: str | None = None
    has_cpf: bool = False
    must_register_cpf: bool = False
    permissions: dict[str, PermissionFlags] = Field(default_factory=dict)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)
