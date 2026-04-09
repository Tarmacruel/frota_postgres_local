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

    async def create(self, record: MaintenanceRecord) -> MaintenanceRecord:
        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)
        return record

    async def delete(self, record: MaintenanceRecord) -> None:
        await self.db.delete(record)
