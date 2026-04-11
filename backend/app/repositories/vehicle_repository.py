from __future__ import annotations

from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle, VehicleOwnershipType, VehicleStatus


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

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        status: VehicleStatus | None = None,
        ownership_type: VehicleOwnershipType | None = None,
        search: str | None = None,
        sort: str = "created_at",
        order: str = "desc",
    ) -> tuple[list[Vehicle], int]:
        sort_map = {
            "created_at": Vehicle.created_at,
            "updated_at": Vehicle.updated_at,
            "plate": Vehicle.plate,
            "brand": Vehicle.brand,
            "model": Vehicle.model,
        }
        sort_column = sort_map.get(sort, Vehicle.created_at)
        sort_column = sort_column.asc() if order.lower() == "asc" else sort_column.desc()

        stmt = select(Vehicle)
        count_stmt = select(func.count(Vehicle.id))
        if status:
            stmt = stmt.where(Vehicle.status == status)
            count_stmt = count_stmt.where(Vehicle.status == status)
        if ownership_type:
            stmt = stmt.where(Vehicle.ownership_type == ownership_type)
            count_stmt = count_stmt.where(Vehicle.ownership_type == ownership_type)
        if search:
            term = f"%{search.strip()}%"
            filter_clause = (
                Vehicle.plate.ilike(term)
                | Vehicle.chassis_number.ilike(term)
                | Vehicle.brand.ilike(term)
                | Vehicle.model.ilike(term)
            )
            stmt = stmt.where(filter_clause)
            count_stmt = count_stmt.where(filter_clause)

        stmt = stmt.order_by(sort_column).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().all())
        return items, total

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
            .options(joinedload(LocationHistory.allocation).joinedload(Allocation.department).joinedload(Department.organization))
            .where(LocationHistory.vehicle_id == vehicle_id, LocationHistory.end_date.is_(None))
            .order_by(LocationHistory.start_date.desc())
        )
        return result.scalar_one_or_none()

    async def list_history(self, vehicle_id: UUID) -> list[LocationHistory]:
        result = await self.db.execute(
            select(LocationHistory)
            .options(joinedload(LocationHistory.allocation).joinedload(Allocation.department).joinedload(Department.organization))
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
