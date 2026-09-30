from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.vehicle_responsibility import LoanPeriod, VehicleScope, operating_organization
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department
from app.models.vehicle import Vehicle
from app.models.vehicle_loan import VehicleLoan


class VehicleLoanRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def effective_periods(self, vehicle_id: UUID) -> tuple[LoanPeriod, ...]:
        result = await self.db.execute(select(VehicleLoan).where(
            VehicleLoan.vehicle_id == vehicle_id,
            VehicleLoan.status.in_(('ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED')),
            VehicleLoan.started_at.is_not(None),
        ).order_by(VehicleLoan.started_at, VehicleLoan.id))
        return tuple(LoanPeriod(row.id, row.recipient_organization_id, row.started_at, row.returned_at)
                     for row in result.scalars())

    async def location_organization_at(self, vehicle_id: UUID, at: datetime) -> UUID | None:
        result = await self.db.execute(select(Department.organization_id).select_from(LocationHistory)
            .join(Allocation, Allocation.id == LocationHistory.allocation_id)
            .join(Department, Department.id == Allocation.department_id)
            .where(LocationHistory.vehicle_id == vehicle_id, LocationHistory.start_date <= at,
                   (LocationHistory.end_date.is_(None) | (LocationHistory.end_date > at))).distinct())
        organizations = list(result.scalars())
        if len(organizations) > 1:
            raise ValueError('Ambiguous vehicle location requires administrative review')
        return organizations[0] if organizations else None

    async def responsibility_at(self, vehicle_id: UUID, at: datetime):
        return operating_organization(at=at,
            location_organization_id=await self.location_organization_at(vehicle_id, at),
            loans=await self.effective_periods(vehicle_id))

    async def scope(self, vehicle_id: UUID, now: datetime) -> VehicleScope | None:
        vehicle = await self.db.get(Vehicle, vehicle_id)
        if vehicle is None:
            return None
        periods = await self.effective_periods(vehicle_id)
        current, _ = operating_organization(at=now,
            location_organization_id=await self.location_organization_at(vehicle_id, now), loans=periods)
        return VehicleScope(vehicle.owner_organization_id, current, periods)
