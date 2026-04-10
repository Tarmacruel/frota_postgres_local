from __future__ import annotations

from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.master_data import Allocation, Department, Organization


class MasterDataRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_catalog(self) -> list[Organization]:
        stmt = (
            select(Organization)
            .options(joinedload(Organization.departments).joinedload(Department.allocations))
            .order_by(Organization.name)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def list_organizations(self) -> list[Organization]:
        result = await self.db.execute(select(Organization).order_by(Organization.name))
        return list(result.scalars().all())

    async def list_departments(self, organization_id: UUID | None = None) -> list[Department]:
        stmt = (
            select(Department)
            .options(joinedload(Department.organization))
            .order_by(Department.name)
        )
        if organization_id:
            stmt = stmt.where(Department.organization_id == organization_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def list_allocations(self, organization_id: UUID | None = None, department_id: UUID | None = None) -> list[Allocation]:
        stmt = (
            select(Allocation)
            .options(joinedload(Allocation.department).joinedload(Department.organization))
            .order_by(Allocation.name)
        )
        if department_id:
            stmt = stmt.where(Allocation.department_id == department_id)
        elif organization_id:
            stmt = stmt.join(Department, Department.id == Allocation.department_id).where(Department.organization_id == organization_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_organization(self, organization_id: UUID) -> Organization | None:
        result = await self.db.execute(select(Organization).where(Organization.id == organization_id))
        return result.scalar_one_or_none()

    async def get_department(self, department_id: UUID) -> Department | None:
        result = await self.db.execute(
            select(Department)
            .options(joinedload(Department.organization))
            .where(Department.id == department_id)
        )
        return result.scalar_one_or_none()

    async def get_allocation(self, allocation_id: UUID) -> Allocation | None:
        result = await self.db.execute(
            select(Allocation)
            .options(joinedload(Allocation.department).joinedload(Department.organization))
            .where(Allocation.id == allocation_id)
        )
        return result.scalar_one_or_none()

    async def create_organization(self, organization: Organization) -> Organization:
        self.db.add(organization)
        await self.db.flush()
        await self.db.refresh(organization)
        return organization

    async def create_department(self, department: Department) -> Department:
        self.db.add(department)
        await self.db.flush()
        await self.db.refresh(department)
        return await self.get_department(department.id)

    async def create_allocation(self, allocation: Allocation) -> Allocation:
        self.db.add(allocation)
        await self.db.flush()
        await self.db.refresh(allocation)
        return await self.get_allocation(allocation.id)

    async def delete(self, entity) -> None:
        await self.db.delete(entity)
