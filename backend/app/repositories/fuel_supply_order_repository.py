from __future__ import annotations

from app.repositories.interactive_kpis import populate_indicators, filter_indicator

from datetime import datetime
from uuid import UUID
from sqlalchemy import String, and_, cast, func, or_, select, update
from app.repositories.vehicle_scope import record_visible, responsible_to
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.fuel_supply import FuelSupply
from app.models.fuel_station import FuelStation
from app.models.master_data import Organization
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department


class FuelSupplyOrderRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, record: FuelSupplyOrder) -> FuelSupplyOrder:
        self.db.add(record)
        await self.db.flush()
        return record

    async def get_by_id(
        self,
        order_id: UUID,
        *,
        populate_existing: bool = False,
    ) -> FuelSupplyOrder | None:
        statement = (
            select(FuelSupplyOrder)
            .options(
                joinedload(FuelSupplyOrder.vehicle),
                joinedload(FuelSupplyOrder.driver),
                joinedload(FuelSupplyOrder.organization),
                joinedload(FuelSupplyOrder.fuel_station_ref),
                joinedload(FuelSupplyOrder.creator),
                joinedload(FuelSupplyOrder.confirmer),
                joinedload(FuelSupplyOrder.supply),
            )
            .where(FuelSupplyOrder.id == order_id)
        )
        if populate_existing:
            statement = statement.execution_options(populate_existing=True)
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_validation_code(self, validation_code: str) -> FuelSupplyOrder | None:
        result = await self.db.execute(
            select(FuelSupplyOrder)
            .options(
                joinedload(FuelSupplyOrder.vehicle),
                joinedload(FuelSupplyOrder.driver),
                joinedload(FuelSupplyOrder.organization),
                joinedload(FuelSupplyOrder.fuel_station_ref),
                joinedload(FuelSupplyOrder.creator),
                joinedload(FuelSupplyOrder.confirmer),
                joinedload(FuelSupplyOrder.supply),
            )
            .where(FuelSupplyOrder.validation_code == validation_code)
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
        fuel_station_ids: list[UUID] | None = None,
        due_until: datetime | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
        search: str | None = None,
    ) -> tuple[list[FuelSupplyOrder], int]:
        stmt = select(FuelSupplyOrder).options(
            joinedload(FuelSupplyOrder.vehicle),
            joinedload(FuelSupplyOrder.driver),
            joinedload(FuelSupplyOrder.organization),
            joinedload(FuelSupplyOrder.fuel_station_ref),
            joinedload(FuelSupplyOrder.creator),
            joinedload(FuelSupplyOrder.confirmer),
            joinedload(FuelSupplyOrder.supply),
        )
        count_stmt = select(func.count(FuelSupplyOrder.id))

        filters = []
        if status_filter:
            filters.append(FuelSupplyOrder.status == status_filter)
        if organization_id:
            filters.append(self._organization_scope_clause(organization_id))
        if vehicle_id:
            filters.append(FuelSupplyOrder.vehicle_id == vehicle_id)
        if fuel_station_id:
            filters.append(FuelSupplyOrder.fuel_station_id == fuel_station_id)
        if fuel_station_ids:
            filters.append(FuelSupplyOrder.fuel_station_id.in_(fuel_station_ids))
        if due_until:
            filters.append(FuelSupplyOrder.expires_at <= due_until)
        if created_from:
            filters.append(FuelSupplyOrder.created_at >= created_from)
        if created_to:
            filters.append(FuelSupplyOrder.created_at <= created_to)
        if search and search.strip():
            term = f"%{search.strip()}%"
            number_term = f"{search.strip()[3:]}%" if search.strip().upper().startswith('AB-') else term
            filters.append(or_(
                cast(FuelSupplyOrder.id, String).ilike(number_term),
                FuelSupplyOrder.notes.ilike(term),
                FuelSupplyOrder.vehicle.has(Vehicle.plate.ilike(term)),
                FuelSupplyOrder.organization.has(Organization.name.ilike(term)),
                FuelSupplyOrder.fuel_station_ref.has(or_(FuelStation.name.ilike(term), FuelStation.phone.ilike(term))),
                FuelSupplyOrder.creator.has(User.name.ilike(term)),
                FuelSupplyOrder.supply.has(cast(FuelSupply.fuel_type, String).ilike(term)),
            ))

        if filters:
            clause = and_(*filters)
            stmt = stmt.where(clause)
            count_stmt = count_stmt.where(clause)

        stmt = await populate_indicators(self.db, 'fuel_orders', stmt)
        count_stmt = filter_indicator(self.db, 'fuel_orders', count_stmt)
        stmt = stmt.order_by(FuelSupplyOrder.created_at.desc()).offset((page - 1) * limit).limit(limit)
        total = int((await self.db.execute(count_stmt)).scalar_one())
        records = list((await self.db.execute(stmt)).scalars().unique().all())
        return records, total

    def _organization_scope_clause(self, organization_id: UUID):
        return record_visible(FuelSupplyOrder.vehicle_id, FuelSupplyOrder.created_at, organization_id)

    async def expire_overdue(self, *, reference_time: datetime) -> int:
        result = await self.db.execute(
            update(FuelSupplyOrder)
            .where(
                FuelSupplyOrder.status == FuelSupplyOrderStatus.OPEN,
                FuelSupplyOrder.expires_at < reference_time,
            )
            .values(status=FuelSupplyOrderStatus.EXPIRED)
        )
        return int(result.rowcount or 0)
