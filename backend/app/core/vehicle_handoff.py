"""Shared vehicle lock for operations that can race a secretariat handoff."""
from fastapi import HTTPException
from sqlalchemy import select

from app.models.vehicle import Vehicle
from app.models.vehicle_loan import VehicleLoan
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department


async def lock_vehicle_handoff(db, vehicle_id):
    if await db.scalar(select(Vehicle.id).where(Vehicle.id == vehicle_id).with_for_update()) is None:
        raise HTTPException(404, 'Veículo não encontrado')


async def prevent_loan_location_bypass(db, vehicle_id):
    loan = await db.scalar(select(VehicleLoan.id).where(VehicleLoan.vehicle_id == vehicle_id,
        VehicleLoan.status.in_(('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT'))).limit(1))
    if loan:
        raise HTTPException(409, detail={'code': 'LOAN_LOCATION_LOCKED',
            'message': 'Use o fluxo de empréstimo/devolução para alterar a lotação deste veículo.'})


async def ensure_order_handoff_scope(db, vehicle_id, organization_id):
    effective_loan = await db.scalar(select(VehicleLoan.id).where(VehicleLoan.vehicle_id == vehicle_id,
        VehicleLoan.started_at.is_not(None)).limit(1))
    if effective_loan is None:
        return
    organizations = (await db.scalars(select(Department.organization_id).select_from(LocationHistory)
        .join(Allocation, Allocation.id == LocationHistory.allocation_id)
        .join(Department, Department.id == Allocation.department_id)
        .where(LocationHistory.vehicle_id == vehicle_id, LocationHistory.end_date.is_(None)).distinct())).all()
    if organizations != [organization_id]:
        raise HTTPException(409, detail={'code': 'LOAN_ORDER_ORGANIZATION_CHANGED',
            'message': 'A ordem deve pertencer à secretaria que está com o veículo. Atualize a seleção.'})
