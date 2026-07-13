from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle


class PossessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, possession_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos))
            .where(VehiclePossession.id == possession_id)
        )
        return result.scalar_one_or_none()

    async def get_by_id_for_update(self, possession_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .where(VehiclePossession.id == possession_id)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def lock_vehicle(self, vehicle_id: UUID) -> bool:
        result = await self.db.execute(
            select(Vehicle.id)
            .where(Vehicle.id == vehicle_id)
            .with_for_update()
        )
        return result.scalar_one_or_none() is not None

    async def get_by_loan_term_validation_code(self, validation_code: str) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos))
            .where(VehiclePossession.loan_term_validation_code == validation_code)
        )
        return result.scalar_one_or_none()

    async def get_by_return_term_validation_code(self, validation_code: str) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos))
            .where(VehiclePossession.return_term_validation_code == validation_code)
        )
        return result.scalar_one_or_none()

    async def has_validation_code(self, validation_code: str) -> bool:
        result = await self.db.execute(
            select(VehiclePossession.id).where(
                (VehiclePossession.loan_term_validation_code == validation_code)
                | (VehiclePossession.return_term_validation_code == validation_code)
            )
        )
        return result.scalar_one_or_none() is not None

    async def list(
        self,
        vehicle_id: UUID | None = None,
        active: bool | None = None,
        organization_id: UUID | None = None,
    ) -> list[VehiclePossession]:
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos))
            .order_by(VehiclePossession.start_date.desc(), VehiclePossession.created_at.desc())
        )

        if vehicle_id:
            stmt = stmt.where(VehiclePossession.vehicle_id == vehicle_id)
        if organization_id:
            stmt = self._filter_by_active_organization(stmt, organization_id)
        if active is True:
            stmt = stmt.where(VehiclePossession.end_date.is_(None))
        elif active is False:
            stmt = stmt.where(VehiclePossession.end_date.is_not(None))

        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        active: bool | None = None,
        driver_id: UUID | None = None,
        search: str | None = None,
        organization_id: UUID | None = None,
    ) -> tuple[list[VehiclePossession], int]:
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos))
            .order_by(VehiclePossession.start_date.desc(), VehiclePossession.created_at.desc())
        )
        count_stmt = select(func.count(VehiclePossession.id))

        if vehicle_id:
            stmt = stmt.where(VehiclePossession.vehicle_id == vehicle_id)
            count_stmt = count_stmt.where(VehiclePossession.vehicle_id == vehicle_id)
        if organization_id:
            stmt = self._filter_by_active_organization(stmt, organization_id)
            count_stmt = self._filter_by_active_organization(count_stmt, organization_id)
        if driver_id:
            stmt = stmt.where(VehiclePossession.driver_id == driver_id)
            count_stmt = count_stmt.where(VehiclePossession.driver_id == driver_id)
        if active is True:
            stmt = stmt.where(VehiclePossession.end_date.is_(None))
            count_stmt = count_stmt.where(VehiclePossession.end_date.is_(None))
        elif active is False:
            stmt = stmt.where(VehiclePossession.end_date.is_not(None))
            count_stmt = count_stmt.where(VehiclePossession.end_date.is_not(None))
        if search:
            term = f"%{search.strip()}%"
            stmt = stmt.where(
                VehiclePossession.driver_name.ilike(term)
                | VehiclePossession.driver_document.ilike(term)
                | VehiclePossession.driver_contact.ilike(term)
            )
            count_stmt = count_stmt.where(
                VehiclePossession.driver_name.ilike(term)
                | VehiclePossession.driver_document.ilike(term)
                | VehiclePossession.driver_contact.ilike(term)
            )

        stmt = stmt.offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().unique().all())
        return items, total

    def _filter_by_active_organization(self, stmt, organization_id: UUID):
        return (
            stmt
            .join(LocationHistory, LocationHistory.vehicle_id == VehiclePossession.vehicle_id)
            .join(Allocation, Allocation.id == LocationHistory.allocation_id)
            .join(Department, Department.id == Allocation.department_id)
            .where(
                LocationHistory.end_date.is_(None),
                Department.organization_id == organization_id,
            )
        )

    async def get_active_by_vehicle(
        self,
        vehicle_id: UUID,
        *,
        for_update: bool = False,
    ) -> VehiclePossession | None:
        statement = (
            select(VehiclePossession)
            .where(VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None))
            .order_by(VehiclePossession.start_date.desc())
        )
        if for_update:
            statement = statement.with_for_update()
        else:
            statement = statement.options(
                joinedload(VehiclePossession.vehicle),
                joinedload(VehiclePossession.driver),
                selectinload(VehiclePossession.photos),
            )
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def driver_had_vehicle_at(self, *, vehicle_id: UUID, driver_id: UUID, occurred_at: datetime) -> bool:
        result = await self.db.execute(
            select(VehiclePossession.id).where(
                VehiclePossession.vehicle_id == vehicle_id,
                VehiclePossession.driver_id == driver_id,
                VehiclePossession.start_date <= occurred_at,
                (VehiclePossession.end_date.is_(None) | (VehiclePossession.end_date >= occurred_at)),
            )
        )
        return result.scalar_one_or_none() is not None

    async def create(self, possession: VehiclePossession) -> VehiclePossession:
        self.db.add(possession)
        await self.db.flush()
        await self.db.refresh(possession)
        return possession
