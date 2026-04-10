from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class OrganizationUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=150)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class OrganizationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    created_at: datetime
    updated_at: datetime


class DepartmentCreate(BaseModel):
    organization_id: UUID
    name: str = Field(min_length=2, max_length=150)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class DepartmentUpdate(BaseModel):
    organization_id: UUID
    name: str = Field(min_length=2, max_length=150)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    organization_name: str | None = None
    name: str
    created_at: datetime
    updated_at: datetime


class AllocationCreate(BaseModel):
    department_id: UUID
    name: str = Field(min_length=2, max_length=150)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class AllocationUpdate(BaseModel):
    department_id: UUID
    name: str = Field(min_length=2, max_length=150)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class AllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    department_id: UUID
    department_name: str | None = None
    organization_id: UUID | None = None
    organization_name: str | None = None
    name: str
    display_name: str
    created_at: datetime
    updated_at: datetime


class CatalogDepartmentOut(DepartmentOut):
    allocations: list[AllocationOut] = []


class CatalogOrganizationOut(OrganizationOut):
    departments: list[CatalogDepartmentOut] = []


class MasterDataCatalogOut(BaseModel):
    organizations: list[CatalogOrganizationOut]
