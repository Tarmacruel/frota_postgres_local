from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus


class FuelSupplyOrderRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def expire_open_orders(self) -> int:
        now = datetime.now(timezone.utc)
        result = await self.db.execute(
            update(FuelSupplyOrder)
            .where(
                FuelSupplyOrder.status == FuelSupplyOrderStatus.OPEN,
                FuelSupplyOrder.expires_at < now,
            )
            .values(status=FuelSupplyOrderStatus.EXPIRED)
        )
        return int(result.rowcount or 0)


    async def create(self, order: FuelSupplyOrder) -> FuelSupplyOrder:
        self.db.add(order)
        await self.db.flush()
        await self.db.refresh(order)
        return order

    async def get_by_id(self, order_id: UUID) -> FuelSupplyOrder | None:
        result = await self.db.execute(
            select(FuelSupplyOrder)
            .options(
                joinedload(FuelSupplyOrder.vehicle),
                joinedload(FuelSupplyOrder.driver),
                joinedload(FuelSupplyOrder.organization),
                joinedload(FuelSupplyOrder.fuel_station),
            )
            .where(FuelSupplyOrder.id == order_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        status: FuelSupplyOrderStatus | None = None,
        vehicle_id: UUID | None = None,
        fuel_station_id: UUID | None = None,
    ) -> tuple[list[FuelSupplyOrder], int]:
        stmt = select(FuelSupplyOrder).options(
            joinedload(FuelSupplyOrder.vehicle),
            joinedload(FuelSupplyOrder.driver),
            joinedload(FuelSupplyOrder.organization),
            joinedload(FuelSupplyOrder.fuel_station),
        )
        count_stmt = select(func.count(FuelSupplyOrder.id))

        if status:
            stmt = stmt.where(FuelSupplyOrder.status == status)
            count_stmt = count_stmt.where(FuelSupplyOrder.status == status)
        if vehicle_id:
            stmt = stmt.where(FuelSupplyOrder.vehicle_id == vehicle_id)
            count_stmt = count_stmt.where(FuelSupplyOrder.vehicle_id == vehicle_id)
        if fuel_station_id:
            stmt = stmt.where(FuelSupplyOrder.fuel_station_id == fuel_station_id)
            count_stmt = count_stmt.where(FuelSupplyOrder.fuel_station_id == fuel_station_id)

        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list(
            (
                await self.db.execute(
                    stmt.order_by(FuelSupplyOrder.created_at.desc()).offset((page - 1) * limit).limit(limit)
                )
            )
            .scalars()
            .all()
        )
        return items, total
