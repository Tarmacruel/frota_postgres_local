from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, joinedload
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.master_data import Allocation, Department
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle


class SearchRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search_vehicles(
        self,
        query: str,
        limit: int,
        organization_id=None,
    ) -> list[tuple[Vehicle, LocationHistory | None, VehiclePossession | None]]:
        active_history = aliased(LocationHistory)
        active_possession = aliased(VehiclePossession)
        stmt = (
            select(Vehicle, active_history, active_possession)
            .outerjoin(
                active_history,
                and_(active_history.vehicle_id == Vehicle.id, active_history.end_date.is_(None)),
            )
            .outerjoin(
                active_possession,
                and_(active_possession.vehicle_id == Vehicle.id, active_possession.end_date.is_(None)),
            )
            .where(
                or_(
                    Vehicle.plate.ilike(query),
                    Vehicle.chassis_number.ilike(query),
                    Vehicle.brand.ilike(query),
                    Vehicle.model.ilike(query),
                    active_history.department.ilike(query),
                    active_possession.driver_name.ilike(query),
                )
            )
            .order_by(Vehicle.updated_at.desc(), Vehicle.created_at.desc())
            .limit(limit)
        )
        if organization_id:
            stmt = (
                stmt
                .join(Allocation, Allocation.id == active_history.allocation_id)
                .join(Department, Department.id == Allocation.department_id)
                .where(Department.organization_id == organization_id)
            )
        result = await self.db.execute(stmt)
        return list(result.all())

    async def search_possessions(
        self,
        query: str,
        limit: int,
        organization_id=None,
        *,
        include_personal_data: bool = False,
    ) -> list[VehiclePossession]:
        search_fields = [
            Vehicle.plate.ilike(query),
            Vehicle.chassis_number.ilike(query),
            Vehicle.brand.ilike(query),
            Vehicle.model.ilike(query),
            VehiclePossession.driver_name.ilike(query),
            VehiclePossession.observation.ilike(query),
        ]
        if include_personal_data:
            search_fields.extend(
                [
                    VehiclePossession.driver_document.ilike(query),
                    VehiclePossession.driver_contact.ilike(query),
                ]
            )
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle))
            .join(Vehicle, Vehicle.id == VehiclePossession.vehicle_id)
            .where(
                or_(*search_fields)
            )
            .order_by(VehiclePossession.start_date.desc(), VehiclePossession.created_at.desc())
            .limit(limit)
        )
        if organization_id:
            active_history = aliased(LocationHistory)
            stmt = (
                stmt
                .join(active_history, and_(active_history.vehicle_id == VehiclePossession.vehicle_id, active_history.end_date.is_(None)))
                .join(Allocation, Allocation.id == active_history.allocation_id)
                .join(Department, Department.id == Allocation.department_id)
                .where(Department.organization_id == organization_id)
            )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def search_maintenances(self, query: str, limit: int, organization_id=None) -> list[MaintenanceRecord]:
        stmt = (
            select(MaintenanceRecord)
            .options(joinedload(MaintenanceRecord.vehicle))
            .join(Vehicle, Vehicle.id == MaintenanceRecord.vehicle_id)
            .where(
                or_(
                    Vehicle.plate.ilike(query),
                    Vehicle.chassis_number.ilike(query),
                    Vehicle.brand.ilike(query),
                    Vehicle.model.ilike(query),
                    MaintenanceRecord.service_description.ilike(query),
                    MaintenanceRecord.parts_replaced.ilike(query),
                )
            )
            .order_by(MaintenanceRecord.updated_at.desc(), MaintenanceRecord.start_date.desc())
            .limit(limit)
        )
        if organization_id:
            active_history = aliased(LocationHistory)
            stmt = (
                stmt
                .join(active_history, and_(active_history.vehicle_id == MaintenanceRecord.vehicle_id, active_history.end_date.is_(None)))
                .join(Allocation, Allocation.id == active_history.allocation_id)
                .join(Department, Department.id == Allocation.department_id)
                .where(Department.organization_id == organization_id)
            )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())
