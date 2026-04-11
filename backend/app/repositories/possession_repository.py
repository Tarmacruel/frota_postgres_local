from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from app.models.possession import VehiclePossession


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

    async def list(self, vehicle_id: UUID | None = None, active: bool | None = None) -> list[VehiclePossession]:
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos))
            .order_by(VehiclePossession.start_date.desc(), VehiclePossession.created_at.desc())
        )

        if vehicle_id:
            stmt = stmt.where(VehiclePossession.vehicle_id == vehicle_id)
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

    async def get_active_by_vehicle(self, vehicle_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos))
            .where(VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None))
            .order_by(VehiclePossession.start_date.desc())
        )
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

    async def end_active_for_vehicle(self, vehicle_id: UUID, end_date: datetime) -> None:
        await self.db.execute(
            update(VehiclePossession)
            .where(VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None))
            .values(end_date=end_date)
        )

    async def create(self, possession: VehiclePossession) -> VehiclePossession:
        self.db.add(possession)
        await self.db.flush()
        await self.db.refresh(possession)
        return possession
