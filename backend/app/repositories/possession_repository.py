from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.possession import VehiclePossession


class PossessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, possession_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle))
            .where(VehiclePossession.id == possession_id)
        )
        return result.scalar_one_or_none()

    async def list(self, vehicle_id: UUID | None = None, active: bool | None = None) -> list[VehiclePossession]:
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle))
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

    async def get_active_by_vehicle(self, vehicle_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle))
            .where(VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None))
            .order_by(VehiclePossession.start_date.desc())
        )
        return result.scalar_one_or_none()

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
