from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.core.cpf import normalize_cpf
from app.models.user import UserRole
from app.schemas.common import normalize_email


class PermissionFlags(BaseModel):
    can_view: bool = False
    can_create: bool = False
    can_edit: bool = False
    can_delete: bool = False


class UserPermissionsUpdate(BaseModel):
    permissions: dict[str, PermissionFlags] = Field(default_factory=dict)


class UserPermissionsOut(BaseModel):
    permissions: dict[str, PermissionFlags] = Field(default_factory=dict)


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    email: str
    cpf: str
    organization_id: UUID
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.PADRAO

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, value: str) -> str:
        return normalize_cpf(value)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    email: str | None = None
    cpf: str | None = None
    organization_id: UUID | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: UserRole | None = None

    @field_validator("email")
    @classmethod
    def validate_optional_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_email(value)

    @field_validator("cpf")
    @classmethod
    def validate_optional_cpf(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_cpf(value)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str
    cpf_masked: str | None = None
    has_cpf: bool = False
    must_register_cpf: bool = False
    organization_id: UUID | None = None
    organization_name: str | None = None
    role: UserRole
    must_change_password: bool = False
    permissions: dict[str, PermissionFlags] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        return normalize_email(value)


class UserSignerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str
    cpf_masked: str | None = None
    has_cpf: bool = False
    must_register_cpf: bool = False
    organization_id: UUID | None = None
    organization_name: str | None = None
    role: UserRole

    @field_validator("email")
    @classmethod
    def validate_signer_email(cls, value: str) -> str:
        return normalize_email(value)
