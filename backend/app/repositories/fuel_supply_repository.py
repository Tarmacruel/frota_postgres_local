from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.fuel_supply import FuelSupply
from app.models.vehicle import Vehicle


class FuelSupplyRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, record: FuelSupply) -> FuelSupply:
        self.db.add(record)
        await self.db.flush()
        return record

    async def get_by_id(self, supply_id: UUID) -> FuelSupply | None:
        result = await self.db.execute(
            select(FuelSupply)
            .options(joinedload(FuelSupply.vehicle), joinedload(FuelSupply.driver), joinedload(FuelSupply.organization))
            .where(FuelSupply.id == supply_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        driver_id: UUID | None = None,
        organization_id: UUID | None = None,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        only_anomalies: bool | None = None,
    ) -> tuple[list[FuelSupply], int]:
        stmt = select(FuelSupply).options(joinedload(FuelSupply.vehicle), joinedload(FuelSupply.driver), joinedload(FuelSupply.organization))
        count_stmt = select(func.count(FuelSupply.id))

        filters = []
        if vehicle_id:
            filters.append(FuelSupply.vehicle_id == vehicle_id)
        if driver_id:
            filters.append(FuelSupply.driver_id == driver_id)
        if organization_id:
            filters.append(FuelSupply.organization_id == organization_id)
        if start_date:
            filters.append(FuelSupply.supplied_at >= start_date)
        if end_date:
            filters.append(FuelSupply.supplied_at <= end_date)
        if only_anomalies is not None:
            filters.append(FuelSupply.is_consumption_anomaly.is_(only_anomalies))

        if filters:
            clause = and_(*filters)
            stmt = stmt.where(clause)
            count_stmt = count_stmt.where(clause)

        stmt = stmt.order_by(FuelSupply.supplied_at.desc(), FuelSupply.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        records = list((await self.db.execute(stmt)).scalars().unique().all())
        return records, total

    async def get_latest_for_vehicle(self, vehicle_id: UUID, *, before_supply_at: datetime | None = None) -> FuelSupply | None:
        stmt = (
            select(FuelSupply)
            .where(FuelSupply.vehicle_id == vehicle_id)
            .order_by(FuelSupply.supplied_at.desc(), FuelSupply.created_at.desc())
            .limit(1)
        )
        if before_supply_at:
            stmt = stmt.where(FuelSupply.supplied_at < before_supply_at)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_vehicle_consumption_average(self, vehicle_id: UUID) -> float | None:
        result = await self.db.execute(
            select(func.avg(FuelSupply.consumption_km_l)).where(
                FuelSupply.vehicle_id == vehicle_id,
                FuelSupply.consumption_km_l.is_not(None),
            )
        )
        value = result.scalar_one_or_none()
        return float(value) if value is not None else None

    async def list_consumption_report(self, start_date: datetime | None = None, end_date: datetime | None = None) -> list[dict]:
        stmt = (
            select(
                FuelSupply.vehicle_id,
                Vehicle.plate,
                func.count(FuelSupply.id).label("supplies_count"),
                func.sum(FuelSupply.liters).label("liters_total"),
                func.sum(func.coalesce(FuelSupply.consumption_km_l, 0) * FuelSupply.liters).label("distance_total_km"),
                func.avg(FuelSupply.consumption_km_l).label("average_consumption_km_l"),
            )
            .join(Vehicle, Vehicle.id == FuelSupply.vehicle_id)
            .group_by(FuelSupply.vehicle_id, Vehicle.plate)
            .order_by(Vehicle.plate.asc())
        )
        if start_date:
            stmt = stmt.where(FuelSupply.supplied_at >= start_date)
        if end_date:
            stmt = stmt.where(FuelSupply.supplied_at <= end_date)

        rows = (await self.db.execute(stmt)).all()
        return [
            {
                "vehicle_id": row.vehicle_id,
                "vehicle_plate": row.plate,
                "supplies_count": int(row.supplies_count or 0),
                "liters_total": float(row.liters_total or 0),
                "distance_total_km": float(row.distance_total_km or 0),
                "average_consumption_km_l": float(row.average_consumption_km_l) if row.average_consumption_km_l is not None else None,
            }
            for row in rows
        ]

    async def list_anomalies(self, *, start_date: datetime | None = None, end_date: datetime | None = None) -> list[FuelSupply]:
        stmt = (
            select(FuelSupply)
            .options(joinedload(FuelSupply.vehicle))
            .where(FuelSupply.is_consumption_anomaly.is_(True))
            .order_by(FuelSupply.supplied_at.desc())
        )
        if start_date:
            stmt = stmt.where(FuelSupply.supplied_at >= start_date)
        if end_date:
            stmt = stmt.where(FuelSupply.supplied_at <= end_date)

        return list((await self.db.execute(stmt)).scalars().unique().all())
