from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus


class FuelSupplyOrderRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, record: FuelSupplyOrder) -> FuelSupplyOrder:
        self.db.add(record)
        await self.db.flush()
        return record

    async def get_by_id(self, order_id: UUID) -> FuelSupplyOrder | None:
        result = await self.db.execute(
            select(FuelSupplyOrder)
            .options(
                joinedload(FuelSupplyOrder.vehicle),
                joinedload(FuelSupplyOrder.organization),
                joinedload(FuelSupplyOrder.creator),
                joinedload(FuelSupplyOrder.confirmer),
            )
            .where(FuelSupplyOrder.id == order_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        status_filter: FuelSupplyOrderStatus | None = None,
        organization_id: UUID | None = None,
        vehicle_id: UUID | None = None,
        fuel_station_id: UUID | None = None,
        due_until: datetime | None = None,
    ) -> tuple[list[FuelSupplyOrder], int]:
        stmt = select(FuelSupplyOrder).options(
            joinedload(FuelSupplyOrder.vehicle),
            joinedload(FuelSupplyOrder.organization),
            joinedload(FuelSupplyOrder.creator),
            joinedload(FuelSupplyOrder.confirmer),
        )
        count_stmt = select(func.count(FuelSupplyOrder.id))

        filters = []
        if status_filter:
            filters.append(FuelSupplyOrder.status == status_filter)
        if organization_id:
            filters.append(FuelSupplyOrder.organization_id == organization_id)
        if vehicle_id:
            filters.append(FuelSupplyOrder.vehicle_id == vehicle_id)
        if fuel_station_id:
            filters.append(FuelSupplyOrder.fuel_station_id == fuel_station_id)
        if due_until:
            filters.append(FuelSupplyOrder.expires_at <= due_until)

        if filters:
            clause = and_(*filters)
            stmt = stmt.where(clause)
            count_stmt = count_stmt.where(clause)

        stmt = stmt.order_by(FuelSupplyOrder.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        records = list((await self.db.execute(stmt)).scalars().unique().all())
        return records, total
