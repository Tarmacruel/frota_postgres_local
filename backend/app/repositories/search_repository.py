from __future__ import annotations

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, joinedload
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle


class SearchRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def search_vehicles(self, query: str, limit: int) -> list[tuple[Vehicle, LocationHistory | None, VehiclePossession | None]]:
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
                    Vehicle.brand.ilike(query),
                    Vehicle.model.ilike(query),
                    active_history.department.ilike(query),
                    active_possession.driver_name.ilike(query),
                )
            )
            .order_by(Vehicle.updated_at.desc(), Vehicle.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.all())

    async def search_possessions(self, query: str, limit: int) -> list[VehiclePossession]:
        stmt = (
            select(VehiclePossession)
            .options(joinedload(VehiclePossession.vehicle))
            .join(Vehicle, Vehicle.id == VehiclePossession.vehicle_id)
            .where(
                or_(
                    Vehicle.plate.ilike(query),
                    Vehicle.brand.ilike(query),
                    Vehicle.model.ilike(query),
                    VehiclePossession.driver_name.ilike(query),
                    VehiclePossession.driver_document.ilike(query),
                    VehiclePossession.driver_contact.ilike(query),
                    VehiclePossession.observation.ilike(query),
                )
            )
            .order_by(VehiclePossession.start_date.desc(), VehiclePossession.created_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def search_maintenances(self, query: str, limit: int) -> list[MaintenanceRecord]:
        stmt = (
            select(MaintenanceRecord)
            .options(joinedload(MaintenanceRecord.vehicle))
            .join(Vehicle, Vehicle.id == MaintenanceRecord.vehicle_id)
            .where(
                or_(
                    Vehicle.plate.ilike(query),
                    Vehicle.brand.ilike(query),
                    Vehicle.model.ilike(query),
                    MaintenanceRecord.service_description.ilike(query),
                    MaintenanceRecord.parts_replaced.ilike(query),
                )
            )
            .order_by(MaintenanceRecord.updated_at.desc(), MaintenanceRecord.start_date.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())
