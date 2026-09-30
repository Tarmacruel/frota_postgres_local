"""Shared SQL scopes. EXISTS keeps pagination and totals free of join duplicates."""
from sqlalchemy import String, and_, cast, func, or_, select
from sqlalchemy.orm import aliased

from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department
from app.models.vehicle import Vehicle
from app.models.vehicle_loan import VehicleLoan


def current_operator(vehicle_id, organization_id):
    history = aliased(LocationHistory)
    return select(history.id).join(Allocation, Allocation.id == history.allocation_id).join(
        Department, Department.id == Allocation.department_id
    ).where(history.vehicle_id == vehicle_id, history.end_date.is_(None),
            Department.organization_id == organization_id).correlate_except(history, Allocation, Department).exists()


def vehicle_visible(vehicle_id, organization_id):
    vehicle = aliased(Vehicle)
    owner = select(vehicle.id).where(vehicle.id == vehicle_id,
        vehicle.owner_organization_id == organization_id).correlate_except(vehicle).exists()
    return or_(owner, current_operator(vehicle_id, organization_id))


def record_visible(vehicle_id, occurred_at, organization_id):
    loan = aliased(VehicleLoan)
    history = select(loan.id).where(
        loan.vehicle_id == vehicle_id, loan.recipient_organization_id == organization_id,
        loan.status.in_(("ACTIVE", "AWAITING_RETURN_RECEIPT", "RETURNED")),
        loan.started_at <= func.now(),
        or_(loan.returned_at.is_(None), occurred_at <= loan.returned_at),
    ).correlate_except(loan).exists()
    return or_(vehicle_visible(vehicle_id, organization_id), history)


def historical_organization(vehicle_id, occurred_at, period_end=None):
    """Resolve only an unambiguous historical allocation; never use today's location."""
    history = aliased(LocationHistory)
    return select(func.min(cast(Department.organization_id, String))).select_from(history).join(
        Allocation, Allocation.id == history.allocation_id
    ).join(Department, Department.id == Allocation.department_id).where(
        history.vehicle_id == vehicle_id, history.start_date <= occurred_at,
        or_(history.end_date.is_(None), history.end_date > (period_end if period_end is not None else occurred_at)),
    ).having(func.count(func.distinct(Department.organization_id)) == 1).correlate_except(
        history, Allocation, Department).scalar_subquery()


def responsible_to(model, occurred_at, organization_id):
    """Cost/report attribution is separate from permission to read shared history."""
    from sqlalchemy import case, text
    field = getattr(model, 'responsible_organization_id', None)
    if field is None:
        field = model.organization_id
    period_end = None
    if hasattr(model, 'infraction_time'):
        period_end = case((model.infraction_time.is_(None), occurred_at + text("INTERVAL '1 day' - INTERVAL '1 microsecond'")), else_=occurred_at)
    return or_(field == organization_id, and_(field.is_(None),
        historical_organization(model.vehicle_id, occurred_at, period_end) == str(organization_id)))


def fine_occurred_at(model):
    from datetime import time
    return func.timezone('America/Bahia', model.infraction_date + func.coalesce(model.infraction_time, time.min))


def fine_visibility_at(model):
    from sqlalchemy import case, text
    instant = fine_occurred_at(model)
    return case((model.infraction_time.is_(None), instant + text("INTERVAL '1 day' - INTERVAL '1 microsecond'")), else_=instant)
