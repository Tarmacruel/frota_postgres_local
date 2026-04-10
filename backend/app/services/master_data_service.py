from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.master_data import Allocation, Department, Organization
from app.models.user import User
from app.repositories.master_data_repository import MasterDataRepository
from app.schemas.master_data import (
    AllocationCreate,
    AllocationUpdate,
    DepartmentCreate,
    DepartmentUpdate,
    OrganizationCreate,
    OrganizationUpdate,
)
from app.services.audit_service import AuditService


class MasterDataService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = MasterDataRepository(db)
        self.audit = AuditService(db)

    async def get_catalog(self) -> dict:
        organizations = await self.repo.list_catalog()
        return {"organizations": organizations}

    async def list_organizations(self) -> list[Organization]:
        return await self.repo.list_organizations()

    async def list_departments(self, organization_id: UUID | None = None) -> list[Department]:
        return await self.repo.list_departments(organization_id=organization_id)

    async def list_allocations(self, organization_id: UUID | None = None, department_id: UUID | None = None) -> list[Allocation]:
        return await self.repo.list_allocations(organization_id=organization_id, department_id=department_id)

    async def create_organization(self, data: OrganizationCreate, current_user: User) -> Organization:
        organization = Organization(name=data.name.strip())
        try:
            organization = await self.repo.create_organization(organization)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="ORGANIZATION",
                entity_id=organization.id,
                entity_label=organization.name,
                details={"name": organization.name},
            )
            await self.db.commit()
            return organization
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Orgao ja cadastrado") from exc

    async def update_organization(self, organization_id: UUID, data: OrganizationUpdate, current_user: User) -> Organization:
        organization = await self.repo.get_organization(organization_id)
        if not organization:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orgao nao encontrado")

        previous = organization.name
        organization.name = data.name.strip()

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="ORGANIZATION",
                entity_id=organization.id,
                entity_label=organization.name,
                details={"before": {"name": previous}, "after": {"name": organization.name}},
            )
            await self.db.flush()
            await self.db.refresh(organization)
            await self.db.commit()
            return organization
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar o orgao") from exc

    async def delete_organization(self, organization_id: UUID, current_user: User) -> None:
        organization = await self.repo.get_organization(organization_id)
        if not organization:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orgao nao encontrado")
        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="ORGANIZATION",
                entity_id=organization.id,
                entity_label=organization.name,
                details={"name": organization.name},
            )
            await self.repo.delete(organization)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel remover o orgao") from exc

    async def create_department(self, data: DepartmentCreate, current_user: User) -> Department:
        parent = await self.repo.get_organization(data.organization_id)
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orgao nao encontrado")

        department = Department(organization_id=data.organization_id, name=data.name.strip())
        try:
            department = await self.repo.create_department(department)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="DEPARTMENT",
                entity_id=department.id,
                entity_label=department.name,
                details={"organization": parent.name, "name": department.name},
            )
            await self.db.commit()
            return department
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Departamento ja cadastrado para este orgao") from exc

    async def update_department(self, department_id: UUID, data: DepartmentUpdate, current_user: User) -> Department:
        department = await self.repo.get_department(department_id)
        if not department:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Departamento nao encontrado")

        parent = await self.repo.get_organization(data.organization_id)
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orgao nao encontrado")

        before = {"name": department.name, "organization": department.organization_name}
        department.organization_id = data.organization_id
        department.name = data.name.strip()

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="DEPARTMENT",
                entity_id=department.id,
                entity_label=department.name,
                details={
                    "before": before,
                    "after": {"name": department.name, "organization": parent.name},
                },
            )
            await self.db.flush()
            department = await self.repo.get_department(department.id)
            await self.db.commit()
            return department
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar o departamento") from exc

    async def delete_department(self, department_id: UUID, current_user: User) -> None:
        department = await self.repo.get_department(department_id)
        if not department:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Departamento nao encontrado")
        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="DEPARTMENT",
                entity_id=department.id,
                entity_label=department.name,
                details={"name": department.name, "organization": department.organization_name},
            )
            await self.repo.delete(department)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel remover o departamento") from exc

    async def create_allocation(self, data: AllocationCreate, current_user: User) -> Allocation:
        parent = await self.repo.get_department(data.department_id)
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Departamento nao encontrado")

        allocation = Allocation(department_id=data.department_id, name=data.name.strip())
        try:
            allocation = await self.repo.create_allocation(allocation)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="ALLOCATION",
                entity_id=allocation.id,
                entity_label=allocation.display_name,
                details={
                    "organization": allocation.organization_name,
                    "department": allocation.department_name,
                    "name": allocation.name,
                },
            )
            await self.db.commit()
            return allocation
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Lotacao ja cadastrada para este departamento") from exc

    async def update_allocation(self, allocation_id: UUID, data: AllocationUpdate, current_user: User) -> Allocation:
        allocation = await self.repo.get_allocation(allocation_id)
        if not allocation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lotacao nao encontrada")

        parent = await self.repo.get_department(data.department_id)
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Departamento nao encontrado")

        before = {
            "organization": allocation.organization_name,
            "department": allocation.department_name,
            "name": allocation.name,
        }
        allocation.department_id = data.department_id
        allocation.name = data.name.strip()

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="ALLOCATION",
                entity_id=allocation.id,
                entity_label=allocation.name,
                details={
                    "before": before,
                    "after": {
                        "organization": parent.organization_name,
                        "department": parent.name,
                        "name": allocation.name,
                    },
                },
            )
            await self.db.flush()
            allocation = await self.repo.get_allocation(allocation.id)
            await self.db.commit()
            return allocation
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar a lotacao") from exc

    async def delete_allocation(self, allocation_id: UUID, current_user: User) -> None:
        allocation = await self.repo.get_allocation(allocation_id)
        if not allocation:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lotacao nao encontrada")
        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="ALLOCATION",
                entity_id=allocation.id,
                entity_label=allocation.display_name,
                details={
                    "organization": allocation.organization_name,
                    "department": allocation.department_name,
                    "name": allocation.name,
                },
            )
            await self.repo.delete(allocation)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Nao foi possivel remover a lotacao porque ela ja esta vinculada a historicos",
            ) from exc
