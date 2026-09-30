"""Temporal responsibility for operational writes; module permissions remain at routes."""
from datetime import datetime, time, timedelta, timezone
from fastapi import HTTPException
from sqlalchemy import inspect, select

from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.core.official_identity import INSTITUTIONAL_TIMEZONE
from app.core.vehicle_handoff import lock_vehicle_handoff
from app.models.fine import Fine
from app.models.vehicle import Vehicle
from app.repositories.vehicle_loan_repository import VehicleLoanRepository
from app.repositories.vehicle_scope import record_visible


def occurred_at(record):
    if isinstance(record, Fine):
        return datetime.combine(record.infraction_date, record.infraction_time or time.min,
                                INSTITUTIONAL_TIMEZONE)
    for field in ('start_date', 'supplied_at', 'data_ocorrencia', 'created_at'):
        value = getattr(record, field, None)
        if isinstance(value, datetime):
            return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


async def ensure_record_visible(db, record, user):
    org = scoped_organization_id(user)
    if production_scope_is_empty(user):
        raise HTTPException(404, 'Registro não encontrado')
    if org is not None:
        instant = occurred_at(record)
        if isinstance(record, Fine) and record.infraction_time is None:
            instant += timedelta(days=1) - timedelta(microseconds=1)
        allowed = await db.scalar(select(Vehicle.id).where(Vehicle.id == record.vehicle_id,
            record_visible(Vehicle.id, instant, org)))
        if allowed is None:
            raise HTTPException(404, 'Registro não encontrado')


async def attribute_operation(db, record, user, *, new=False):
    """Lock against handoff, authorize by event time and derive attribution server-side."""
    with db.no_autoflush:
        await lock_vehicle_handoff(db, record.vehicle_id)
        from app.models.fuel_supply_order import FuelSupplyOrder
        if new and isinstance(record, FuelSupplyOrder) and record.created_at is None:
            record.created_at = datetime.now(timezone.utc)
        return await _attribute_locked(db, record, user, new=new)


async def _attribute_locked(db, record, user, *, new):
    repository = VehicleLoanRepository(db)
    field = 'responsible_organization_id' if hasattr(record, 'responsible_organization_id') else 'organization_id'
    previous = getattr(record, field, None)
    state = inspect(record)
    date_changed = any(state.attrs[name].history.has_changes() for name in (
        'vehicle_id', 'start_date', 'supplied_at', 'data_ocorrencia', 'infraction_date', 'infraction_time'
    ) if name in state.attrs)
    preserve = not new and previous is not None and not date_changed
    try:
        if preserve:
            organization, loan_id = previous, record.vehicle_loan_id
        else:
            organization, loan_id = await repository.responsibility_at(record.vehicle_id, occurred_at(record))
        if not preserve and isinstance(record, Fine) and record.infraction_time is None:
            start = occurred_at(record)
            end = start + timedelta(days=1)
            periods = await repository.effective_periods(record.vehicle_id)
            final = await repository.responsibility_at(record.vehicle_id, end - timedelta(microseconds=1))
            if final != (organization, loan_id) or any(
                start < boundary < end for loan in periods
                for boundary in (loan.started_at, loan.returned_at) if boundary is not None
            ):
                organization, loan_id = None, None
    except ValueError as exc:
        raise HTTPException(409, 'Histórico de lotação ambíguo; requer revisão administrativa') from exc
    from app.models.possession import VehiclePossession
    if isinstance(record, VehiclePossession):
        end = record.end_date or datetime.now(timezone.utc)
        start = occurred_at(record)
        periods = await repository.effective_periods(record.vehicle_id)
        if any(start < boundary <= end for loan in periods
               for boundary in (loan.started_at, loan.returned_at) if boundary is not None):
            raise HTTPException(409, 'A posse não pode atravessar uma entrega ou devolução entre secretarias')
    scoped = scoped_organization_id(user)
    if production_scope_is_empty(user) or (scoped is not None and scoped != organization):
        raise HTTPException(403, 'A operação pertence a outra secretaria ou não tem responsabilidade identificada')
    if not new and previous is not None and scoped is not None and previous != scoped:
        raise HTTPException(403, 'Somente a secretaria responsável pode alterar este registro')
    # A correction that moves the event into an unknown period must not retain a guessed owner.
    setattr(record, field, organization)
    record.vehicle_loan_id = loan_id


async def ensure_registration_manager(db, vehicle_id, user):
    org = scoped_organization_id(user)
    if org is None and not production_scope_is_empty(user):
        return
    scope = await VehicleLoanRepository(db).scope(vehicle_id, datetime.now(timezone.utc))
    if scope is None or not scope.can_manage_registration(org):
        raise HTTPException(403, 'O cadastro pertence à secretaria de origem do veículo')
