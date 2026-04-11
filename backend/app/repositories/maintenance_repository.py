from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.maintenance import MaintenanceRecord


class MaintenanceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, record_id: UUID) -> MaintenanceRecord | None:
        result = await self.db.execute(
            select(MaintenanceRecord)
            .options(joinedload(MaintenanceRecord.vehicle))
            .where(MaintenanceRecord.id == record_id)
        )
        return result.scalar_one_or_none()

    async def list(
        self,
        vehicle_id: UUID | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[MaintenanceRecord]:
        stmt = (
            select(MaintenanceRecord)
            .options(joinedload(MaintenanceRecord.vehicle))
            .order_by(MaintenanceRecord.start_date.desc(), MaintenanceRecord.created_at.desc())
        )

        if vehicle_id:
            stmt = stmt.where(MaintenanceRecord.vehicle_id == vehicle_id)
        if start:
            stmt = stmt.where(func.coalesce(MaintenanceRecord.end_date, func.now()) >= start)
        if end:
            stmt = stmt.where(MaintenanceRecord.start_date <= end)

        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        start: datetime | None = None,
        end: datetime | None = None,
        only_open: bool | None = None,
        search: str | None = None,
    ) -> tuple[list[MaintenanceRecord], int]:
        stmt = select(MaintenanceRecord).options(joinedload(MaintenanceRecord.vehicle))
        count_stmt = select(func.count(MaintenanceRecord.id))

        if vehicle_id:
            stmt = stmt.where(MaintenanceRecord.vehicle_id == vehicle_id)
            count_stmt = count_stmt.where(MaintenanceRecord.vehicle_id == vehicle_id)
        if start:
            stmt = stmt.where(func.coalesce(MaintenanceRecord.end_date, func.now()) >= start)
            count_stmt = count_stmt.where(func.coalesce(MaintenanceRecord.end_date, func.now()) >= start)
        if end:
            stmt = stmt.where(MaintenanceRecord.start_date <= end)
            count_stmt = count_stmt.where(MaintenanceRecord.start_date <= end)
        if only_open is True:
            stmt = stmt.where(MaintenanceRecord.end_date.is_(None))
            count_stmt = count_stmt.where(MaintenanceRecord.end_date.is_(None))
        elif only_open is False:
            stmt = stmt.where(MaintenanceRecord.end_date.is_not(None))
            count_stmt = count_stmt.where(MaintenanceRecord.end_date.is_not(None))
        if search:
            term = f"%{search.strip()}%"
            filter_clause = (
                MaintenanceRecord.service_description.ilike(term)
                | MaintenanceRecord.parts_replaced.ilike(term)
            )
            stmt = stmt.where(filter_clause)
            count_stmt = count_stmt.where(filter_clause)

        stmt = stmt.order_by(MaintenanceRecord.start_date.desc(), MaintenanceRecord.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().unique().all())
        return items, total

    async def create(self, record: MaintenanceRecord) -> MaintenanceRecord:
        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)
        return record

    async def delete(self, record: MaintenanceRecord) -> None:
        await self.db.delete(record)
