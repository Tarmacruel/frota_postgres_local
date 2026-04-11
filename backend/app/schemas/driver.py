from __future__ import annotations

from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.driver import DriverLicenseCategory
from app.schemas.common import PaginatedResponse, normalize_email


class DriverBase(BaseModel):
    nome_completo: str = Field(min_length=3, max_length=150)
    documento: str = Field(min_length=5, max_length=20)
    contato: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=100)
    cnh_categoria: DriverLicenseCategory
    cnh_validade: date | None = None

    @field_validator("nome_completo")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("Nome completo deve ter ao menos 3 caracteres")
        return normalized

    @field_validator("documento")
    @classmethod
    def normalize_document(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) < 5:
            raise ValueError("Documento deve ter ao menos 5 caracteres")
        return normalized

    @field_validator("contato")
    @classmethod
    def normalize_contact(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("email")
    @classmethod
    def validate_optional_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalize_email(normalized) if normalized else None


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    nome_completo: str | None = Field(default=None, min_length=3, max_length=150)
    documento: str | None = Field(default=None, min_length=5, max_length=20)
    contato: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=100)
    cnh_categoria: DriverLicenseCategory | None = None
    cnh_validade: date | None = None
    ativo: bool | None = None

    @field_validator("nome_completo")
    @classmethod
    def validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if len(normalized) < 3:
            raise ValueError("Nome completo deve ter ao menos 3 caracteres")
        return normalized

    @field_validator("documento")
    @classmethod
    def normalize_document(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if len(normalized) < 5:
            raise ValueError("Documento deve ter ao menos 5 caracteres")
        return normalized

    @field_validator("contato")
    @classmethod
    def normalize_contact(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @field_validator("email")
    @classmethod
    def validate_optional_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalize_email(normalized) if normalized else None


class DriverOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome_completo: str
    documento: str
    contato: str | None
    email: str | None
    cnh_categoria: DriverLicenseCategory
    cnh_validade: date | None
    ativo: bool
    created_at: datetime
    updated_at: datetime


class DriverListResponse(PaginatedResponse[DriverOut]):
    pass
