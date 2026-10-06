"""Scoped display data for the loan workflow, independent of other module permissions."""
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from app.models.master_data import Allocation, Department, Organization
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.models.vehicle_loan import VehicleLoan
from app.repositories.vehicle_scope import current_operator
from app.schemas.vehicle_loan import LoanOut


async def describe_loans(db, records):
    items = [LoanOut.model_validate(row).model_dump() for row in records]
    if not items:
        return items
    vehicles = {row.id: row for row in (await db.execute(select(Vehicle.id, Vehicle.plate, Vehicle.vehicle_type).where(
        Vehicle.id.in_([item['vehicle_id'] for item in items])))).all()}
    org_ids = {item[key] for item in items for key in ('origin_organization_id', 'recipient_organization_id')}
    names = dict((await db.execute(select(Organization.id, Organization.name).where(Organization.id.in_(org_ids)))).all())
    allocation_ids = {item[key] for item in items for key in ('origin_allocation_id', 'destination_allocation_id', 'return_allocation_id') if item[key]}
    allocations = (await db.scalars(select(Allocation).where(Allocation.id.in_(allocation_ids)).options(
        joinedload(Allocation.department).joinedload(Department.organization)))).all()
    labels = {row.id: row.display_name for row in allocations}
    for item in items:
        vehicle = vehicles.get(item['vehicle_id'])
        item['vehicle_plate'] = vehicle.plate if vehicle else 'Veículo indisponível'
        item['vehicle_type'] = vehicle.vehicle_type if vehicle else None
        for side in ('origin', 'recipient'):
            item[side + '_organization_name'] = names.get(item[side + '_organization_id'])
        for side in ('origin', 'destination', 'return'):
            item[side + '_allocation_name'] = labels.get(item[side + '_allocation_id'])
    return items


async def loan_catalog(db, user):
    if user.role != UserRole.ADMIN and (user.role != UserRole.PRODUCAO or not user.organization_id):
        return {'vehicles': [], 'allocations': [], 'organizations': []}
    statement = select(Vehicle).where(Vehicle.owner_organization_id.is_not(None),
        current_operator(Vehicle.id, Vehicle.owner_organization_id),
        ~select(VehicleLoan.id).where(VehicleLoan.vehicle_id == Vehicle.id,
            VehicleLoan.status.in_(('AWAITING_RECEIPT', 'ACTIVE', 'AWAITING_RETURN_RECEIPT'))).exists())
    if user.role != UserRole.ADMIN:
        statement = statement.where(Vehicle.owner_organization_id == user.organization_id)
    vehicles = (await db.scalars(statement.order_by(Vehicle.plate))).all()
    orgs = (await db.scalars(select(Organization).order_by(Organization.name))).all()
    allocations = (await db.scalars(select(Allocation).options(
        joinedload(Allocation.department).joinedload(Department.organization)).order_by(Allocation.name))).all()
    return {'vehicles': [{'id': row.id, 'plate': row.plate, 'brand': row.brand, 'model': row.model,
                         'owner_organization_id': row.owner_organization_id} for row in vehicles],
            'organizations': [{'id': row.id, 'name': row.name} for row in orgs],
            'allocations': [{'id': row.id, 'organization_id': row.organization_id,
                             'name': row.display_name} for row in allocations]}


async def describe_events(db, events):
    from app.schemas.vehicle_loan import LoanEventOut
    ids = {event.actor_user_id for event in events}
    names = dict((await db.execute(select(User.id, User.name).where(User.id.in_(ids)))).all()) if ids else {}
    return [{**LoanEventOut.model_validate(event).model_dump(), 'actor_name': names.get(event.actor_user_id)}
            for event in events]
