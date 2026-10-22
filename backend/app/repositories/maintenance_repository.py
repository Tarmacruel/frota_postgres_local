from __future__ import annotations

from app.repositories.interactive_kpis import populate_indicators, filter_indicator

from datetime import datetime
from uuid import UUID
from sqlalchemy import func, or_, select
from app.repositories.vehicle_scope import record_visible
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.master_data import Allocation, Department, Organization
from app.models.vehicle import Vehicle


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
        organization_id: UUID | None = None,
    ) -> list[MaintenanceRecord]:
        stmt = (
            select(MaintenanceRecord)
            .options(joinedload(MaintenanceRecord.vehicle))
            .order_by(MaintenanceRecord.start_date.desc(), MaintenanceRecord.created_at.desc())
        )

        if vehicle_id:
            stmt = stmt.where(MaintenanceRecord.vehicle_id == vehicle_id)
        if organization_id:
            stmt = self._filter_by_active_organization(stmt, organization_id)
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
        organization_id: UUID | None = None,
        filter_organization_id: UUID | None = None,
        unassigned: bool = False,
        focus_id: UUID | None = None,
        with_summary: bool = False,
    ) -> tuple[list[MaintenanceRecord], int] | tuple[list[MaintenanceRecord], int, dict]:
        conditions = []
        location_query = select(LocationHistory.id).join(
            Allocation, Allocation.id == LocationHistory.allocation_id
        ).join(Department, Department.id == Allocation.department_id).join(
            Organization, Organization.id == Department.organization_id
        ).where(LocationHistory.vehicle_id == MaintenanceRecord.vehicle_id,
            LocationHistory.end_date.is_(None)).correlate(MaintenanceRecord)
        if vehicle_id:
            conditions.append(MaintenanceRecord.vehicle_id == vehicle_id)
        if organization_id:
            conditions.append(record_visible(MaintenanceRecord.vehicle_id, MaintenanceRecord.start_date, organization_id))
        if focus_id:
            conditions.append(MaintenanceRecord.id == focus_id)
        else:
            if filter_organization_id:
                conditions.append(location_query.where(Department.organization_id == filter_organization_id).exists())
            elif unassigned:
                conditions.append(~location_query.exists())
            if start:
                conditions.append(func.coalesce(MaintenanceRecord.end_date, func.now()) >= start)
            if end:
                conditions.append(MaintenanceRecord.start_date <= end)
            if only_open is True:
                conditions.append(MaintenanceRecord.end_date.is_(None))
            elif only_open is False:
                conditions.append(MaintenanceRecord.end_date.is_not(None))
            if search and search.strip():
                term = f"%{search.strip()}%"
                conditions.append(or_(
                    MaintenanceRecord.service_description.ilike(term),
                    MaintenanceRecord.parts_replaced.ilike(term),
                    MaintenanceRecord.vehicle.has(Vehicle.plate.ilike(term)),
                    location_query.where(Organization.name.ilike(term)).exists(),
                ))

        stmt = select(MaintenanceRecord).options(joinedload(MaintenanceRecord.vehicle)).where(*conditions)
        stmt = await populate_indicators(self.db, 'maintenance', stmt)
        count_stmt = filter_indicator(self.db, 'maintenance', select(func.count(MaintenanceRecord.id)).where(*conditions))
        stmt = stmt.order_by(MaintenanceRecord.start_date.desc(), MaintenanceRecord.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().unique().all())
        if with_summary:
            open_count = int((await self.db.execute(select(func.count(MaintenanceRecord.id)).where(
                *conditions, MaintenanceRecord.end_date.is_(None)))).scalar_one())
            return items, total, {"total": total, "open": open_count, "closed": total - open_count}
        return items, total

    def _filter_by_active_organization(self, stmt, organization_id: UUID):
        return stmt.where(record_visible(MaintenanceRecord.vehicle_id, MaintenanceRecord.start_date, organization_id))

    async def create(self, record: MaintenanceRecord) -> MaintenanceRecord:
        self.db.add(record)
        await self.db.flush()
        await self.db.refresh(record)
        return record

    async def delete(self, record: MaintenanceRecord) -> None:
        await self.db.delete(record)
