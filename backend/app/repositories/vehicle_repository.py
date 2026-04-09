from __future__ import annotations

from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.location_history import LocationHistory
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle, VehicleStatus


class VehicleRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, vehicle_id: UUID) -> Vehicle | None:
        result = await self.db.execute(select(Vehicle).where(Vehicle.id == vehicle_id))
        return result.scalar_one_or_none()

    async def get_by_plate(self, plate: str) -> Vehicle | None:
        result = await self.db.execute(select(Vehicle).where(Vehicle.plate == plate.upper()))
        return result.scalar_one_or_none()

    async def list(self, skip: int = 0, limit: int = 50, status: VehicleStatus | None = None) -> list[Vehicle]:
        stmt = select(Vehicle).offset(skip).limit(limit).order_by(Vehicle.created_at.desc())
        if status:
            stmt = stmt.where(Vehicle.status == status)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, vehicle: Vehicle) -> Vehicle:
        self.db.add(vehicle)
        await self.db.flush()
        await self.db.refresh(vehicle)
        return vehicle

    async def delete(self, vehicle: Vehicle) -> None:
        await self.db.delete(vehicle)

    async def get_active_history(self, vehicle_id: UUID) -> LocationHistory | None:
        result = await self.db.execute(
            select(LocationHistory)
            .where(LocationHistory.vehicle_id == vehicle_id, LocationHistory.end_date.is_(None))
            .order_by(LocationHistory.start_date.desc())
        )
        return result.scalar_one_or_none()

    async def list_history(self, vehicle_id: UUID) -> list[LocationHistory]:
        result = await self.db.execute(
            select(LocationHistory)
            .where(LocationHistory.vehicle_id == vehicle_id)
            .order_by(LocationHistory.start_date.desc())
        )
        return list(result.scalars().all())

    async def create_history(self, history: LocationHistory) -> LocationHistory:
        self.db.add(history)
        await self.db.flush()
        await self.db.refresh(history)
        return history

    async def get_active_possession(self, vehicle_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .where(VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None))
            .order_by(VehiclePossession.start_date.desc())
        )
        return result.scalar_one_or_none()
