from __future__ import annotations

from app.repositories.interactive_kpis import populate_indicators, filter_indicator

from datetime import datetime
from uuid import UUID
from sqlalchemy import func, or_, select
from app.repositories.vehicle_scope import record_visible
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from app.models.driver import Driver
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department, Organization
from app.models.possession import VehiclePossession
from app.models.possession_trip import VehiclePossessionTrip
from app.models.vehicle import Vehicle


class PossessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(
        self,
        possession_id: UUID,
        *,
        populate_existing: bool = False,
    ) -> VehiclePossession | None:
        statement = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos), selectinload(VehiclePossession.return_confirmations))
            .where(VehiclePossession.id == possession_id)
        )
        if populate_existing:
            statement = statement.execution_options(populate_existing=True)
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_id_for_update(self, possession_id: UUID) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(
                selectinload(VehiclePossession.vehicle),
                selectinload(VehiclePossession.photos),
            )
            .where(VehiclePossession.id == possession_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    async def get_term_graph(
        self,
        possession_id: UUID,
        *,
        populate_existing: bool = False,
    ) -> VehiclePossession | None:
        """Load the complete, ordered graph used by the official possession term."""
        statement = (
            select(VehiclePossession)
            .options(
                joinedload(VehiclePossession.vehicle),
                joinedload(VehiclePossession.driver),
                selectinload(VehiclePossession.photos),
                selectinload(VehiclePossession.trips).selectinload(VehiclePossessionTrip.destinations),
                selectinload(VehiclePossession.return_confirmations),
            )
            .where(VehiclePossession.id == possession_id)
        )
        if populate_existing:
            statement = statement.execution_options(populate_existing=True)
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def lock_vehicle(self, vehicle_id: UUID) -> bool:
        result = await self.db.execute(
            select(Vehicle.id)
            .where(Vehicle.id == vehicle_id)
            .with_for_update()
        )
        return result.scalar_one_or_none() is not None

    async def get_by_loan_term_validation_code(self, validation_code: str) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos), selectinload(VehiclePossession.return_confirmations))
            .where(VehiclePossession.loan_term_validation_code == validation_code)
        )
        return result.scalar_one_or_none()

    async def get_by_return_term_validation_code(self, validation_code: str) -> VehiclePossession | None:
        result = await self.db.execute(
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos), selectinload(VehiclePossession.return_confirmations))
            .where(VehiclePossession.return_term_validation_code == validation_code)
        )
        return result.scalar_one_or_none()

    async def has_validation_code(self, validation_code: str) -> bool:
        result = await self.db.execute(
            select(VehiclePossession.id).where(
                (VehiclePossession.loan_term_validation_code == validation_code)
                | (VehiclePossession.return_term_validation_code == validation_code)
            )
        )
        return result.scalar_one_or_none() is not None

    async def list(
        self,
        vehicle_id: UUID | None = None,
        active: bool | None = None,
        organization_id: UUID | None = None,
    ) -> list[VehiclePossession]:
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos), selectinload(VehiclePossession.return_confirmations))
            .order_by(VehiclePossession.start_date.desc(), VehiclePossession.created_at.desc())
        )

        if vehicle_id:
            stmt = stmt.where(VehiclePossession.vehicle_id == vehicle_id)
        if organization_id:
            stmt = self._filter_by_active_organization(stmt, organization_id)
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
        organization_id: UUID | None = None,
        include_personal_search: bool = True,
        filter_organization_id: UUID | None = None,
        unassigned: bool = False,
        start_from: datetime | None = None,
        start_to: datetime | None = None,
        focus_id: UUID | None = None,
        with_summary: bool = False,
    ) -> tuple[list[VehiclePossession], int] | tuple[list[VehiclePossession], int, dict]:
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle), joinedload(VehiclePossession.driver), selectinload(VehiclePossession.photos), selectinload(VehiclePossession.return_confirmations))
            .order_by(VehiclePossession.start_date.desc(), VehiclePossession.created_at.desc())
        )
        count_stmt = select(func.count(VehiclePossession.id))
        active_stmt = select(func.count(VehiclePossession.id))
        location_query = select(LocationHistory.id).join(
            Allocation, Allocation.id == LocationHistory.allocation_id
        ).join(Department, Department.id == Allocation.department_id).join(
            Organization, Organization.id == Department.organization_id
        ).where(LocationHistory.vehicle_id == VehiclePossession.vehicle_id,
            LocationHistory.end_date.is_(None)).correlate(VehiclePossession)

        def apply_filter(predicate):
            nonlocal stmt, count_stmt, active_stmt
            stmt = stmt.where(predicate)
            count_stmt = count_stmt.where(predicate)
            active_stmt = active_stmt.where(predicate)

        if vehicle_id:
            apply_filter(VehiclePossession.vehicle_id == vehicle_id)
        if organization_id:
            apply_filter(record_visible(VehiclePossession.vehicle_id, VehiclePossession.start_date, organization_id))
        if focus_id:
            apply_filter(VehiclePossession.id == focus_id)
        else:
            if filter_organization_id:
                apply_filter(location_query.where(Department.organization_id == filter_organization_id).exists())
            elif unassigned:
                apply_filter(~location_query.exists())
            if start_from:
                apply_filter(VehiclePossession.start_date >= start_from)
            if start_to:
                apply_filter(VehiclePossession.start_date <= start_to)
        if driver_id:
            apply_filter(VehiclePossession.driver_id == driver_id)
        if not focus_id and active is True:
            apply_filter(VehiclePossession.end_date.is_(None))
        elif not focus_id and active is False:
            apply_filter(VehiclePossession.end_date.is_not(None))
        if not focus_id and search:
            normalized_search = search.strip()
            term = f"%{normalized_search}%"
            search_conditions = [
                VehiclePossession.vehicle.has(Vehicle.plate.ilike(term)),
            ]
            if with_summary:
                search_conditions.append(location_query.where(Organization.name.ilike(term)).exists())
            if normalized_search.isdecimal():
                search_conditions.append(VehiclePossession.public_number == int(normalized_search))
            if include_personal_search:
                search_conditions.extend(
                    [
                        VehiclePossession.observation.ilike(term),
                        VehiclePossession.driver_name.ilike(term),
                        VehiclePossession.driver_document.ilike(term),
                        VehiclePossession.driver_contact.ilike(term),
                        VehiclePossession.driver.has(Driver.matricula.ilike(term)),
                    ]
                )
            search_predicate = or_(*search_conditions)
            apply_filter(search_predicate)

        stmt = await populate_indicators(self.db, 'possession', stmt)
        count_stmt = filter_indicator(self.db, 'possession', count_stmt)
        stmt = stmt.offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        items = list((await self.db.execute(stmt)).scalars().unique().all())
        if with_summary:
            active_total = int((await self.db.execute(active_stmt.where(VehiclePossession.end_date.is_(None)))).scalar_one())
            return items, total, {"total": total, "active": active_total}
        return items, total

    def _filter_by_active_organization(self, stmt, organization_id: UUID):
        return stmt.where(record_visible(VehiclePossession.vehicle_id, VehiclePossession.start_date, organization_id))

    async def get_odometer_suggestion(self, vehicle_id: UUID, start_date: datetime):
        result = await self.db.execute(
            select(VehiclePossession.end_odometer_km, VehiclePossession.end_date)
            .where(
                VehiclePossession.vehicle_id == vehicle_id,
                VehiclePossession.end_date <= start_date,
                VehiclePossession.end_odometer_km.is_not(None),
            )
            .order_by(
                VehiclePossession.end_date.desc(),
                VehiclePossession.created_at.desc(),
                VehiclePossession.id.desc(),
            )
            .limit(1)
        )
        record = result.first()
        if record is None:
            return None
        return {"odometer_km": record.end_odometer_km, "end_date": record.end_date}

    async def get_active_by_vehicle(
        self,
        vehicle_id: UUID,
        *,
        for_update: bool = False,
    ) -> VehiclePossession | None:
        statement = (
            select(VehiclePossession)
            .where(VehiclePossession.vehicle_id == vehicle_id, VehiclePossession.end_date.is_(None))
            .order_by(VehiclePossession.start_date.desc())
        )
        if for_update:
            statement = statement.with_for_update()
        else:
            statement = statement.options(
                joinedload(VehiclePossession.vehicle),
                joinedload(VehiclePossession.driver),
                selectinload(VehiclePossession.photos),
                selectinload(VehiclePossession.return_confirmations),
            )
        result = await self.db.execute(statement)
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

    async def create(self, possession: VehiclePossession) -> VehiclePossession:
        self.db.add(possession)
        await self.db.flush()
        await self.db.refresh(possession)
        return possession
