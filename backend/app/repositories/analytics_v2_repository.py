"""Two grouped SELECTs, independent of number of vehicles/drivers/months.

Organization scope uses the existing event-responsibility rule, not ownership.
Only scalars are loaded; there are no ORM lazy loads or snapshot writes.
"""
from decimal import Decimal
from sqlalchemy import Date, Numeric, String, and_, case, cast, func, literal, null, select, union_all
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import aliased

from app.models.claim import Claim
from app.models.fine import Fine
from app.models.fuel_supply import FuelSupply
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle
from app.repositories.vehicle_scope import fine_occurred_at, historical_organization, responsible_to
from app.schemas.analytics_v2 import AnalyticsV2Filter, AnalyticsV2Period


def summary_statement(filters: AnalyticsV2Filter, current: AnalyticsV2Period, previous: AnalyticsV2Period, *, include_organization=False):
    queries = []
    sources = [
        ("fuel", FuelSupply, FuelSupply.supplied_at, FuelSupply.total_amount),
        ("maintenance", MaintenanceRecord, MaintenanceRecord.start_date, MaintenanceRecord.total_cost),
        ("fines", Fine, fine_occurred_at(Fine), Fine.amount),
        ("claim_estimate", Claim, Claim.data_ocorrencia, Claim.valor_estimado),
    ]
    for name, model, instant, amount in sources:
        day = model.infraction_date if model is Fine else cast(func.timezone("America/Bahia", instant), Date)
        is_current = day >= current.date_from
        valid_amount = and_(amount >= 0, amount < literal(Decimal("Infinity"), type_=Numeric))
        liters = FuelSupply.liters if model is FuelSupply else literal(0)
        valid_liters = and_(liters >= 0, liters < float("inf"))
        field = getattr(model, "responsible_organization_id", None)
        if field is None:
            field = model.organization_id
        period_end = None
        if model is Fine:
            from sqlalchemy import text
            period_end = case((model.infraction_time.is_(None), instant + text("INTERVAL '1 day' - INTERVAL '1 microsecond'")), else_=instant)
        organization = func.coalesce(field, cast(historical_organization(model.vehicle_id, instant, period_end), PGUUID(as_uuid=True)))
        query = select(
            case((is_current, literal("current")), else_=literal("previous")).label("period"),
            func.to_char(day, "YYYY-MM").label("month"),
            literal(name).label("source"), model.vehicle_id.label("vehicle_id"),
            *((organization.label("organization_id"),) if include_organization else ()),
            (getattr(model, "driver_id", null())).label("driver_id"),
            (cast(Fine.status, String) if model is Fine else literal("")).label("status"),
            case((valid_amount, amount), else_=None).label("amount"),
            case((valid_liters, liters), else_=None).label("liters"),
            (case((FuelSupply.is_consumption_anomaly.is_(True), 1), else_=0) if model is FuelSupply else literal(0)).label("anomaly"),
        ).select_from(model).join(Vehicle, Vehicle.id == model.vehicle_id)
        if model is Fine:
            query = query.where(day >= previous.date_from, day <= current.date_to)
        else:
            query = query.where(instant >= previous.start_at, instant < current.end_exclusive)
        if filters.organization is not None:
            query = query.where(responsible_to(model, instant, filters.organization))
        if filters.vehicle_type is not None:
            query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
        if filters.vehicle_id is not None:
            query = query.where(model.vehicle_id == filters.vehicle_id)
        queries.append(query)
    facts = union_all(*queries).subquery("scoped_events")
    dimensions = [facts.c.period, facts.c.month, facts.c.source, facts.c.vehicle_id, facts.c.driver_id, facts.c.status]
    if include_organization:
        dimensions.append(facts.c.organization_id)
    return select(*dimensions, func.count().label("records"),
        func.count(facts.c.amount).label("known_amounts"), func.sum(facts.c.amount).label("amount"),
        func.count(facts.c.liters).label("known_liters"), func.sum(cast(facts.c.liters, Numeric)).label("liters"),
        func.sum(facts.c.anomaly).label("anomalies")).group_by(*dimensions)


class AnalyticsV2Repository:
    def __init__(self, db):
        self.db = db

    async def summary_rows(self, filters, current, previous):
        result = await self.db.execute(summary_statement(filters, current, previous))
        return result.mappings().all()

    async def cost_rows(self, filters, current, previous):
        result = await self.db.execute(summary_statement(filters, current, previous, include_organization=True))
        return result.mappings().all()

    async def mileage_rows(self, filters, current, previous):
        result = await self.db.execute(mileage_statement(filters, current, previous))
        return result.mappings().all()


def mileage_conditions(possession, window):
    """The same eligibility rule for grouped mileage and its source records."""
    other = aliased(VehiclePossession)
    overlap = select(other.id).where(other.id != possession.id,
        other.vehicle_id == possession.vehicle_id, other.end_date.is_not(None),
        other.end_date > other.start_date, other.start_date < possession.end_date,
        other.end_date > possession.start_date).correlate(possession).exists()
    start, end = possession.start_odometer_km, possession.end_odometer_km
    readings_valid = and_(start.is_not(None), end.is_not(None), start >= 0, end >= start,
        end < float("inf"))
    contained = and_(possession.start_date >= window.start_at, possession.end_date <= window.end_exclusive)
    return and_(contained, readings_valid, possession.end_date > possession.start_date, ~overlap), contained, overlap


def mileage_event_statement(filters, window):
    possession = VehiclePossession
    query = select(possession.id, possession.public_number, possession.vehicle_id, Vehicle.plate,
        possession.start_date, possession.end_date, possession.start_odometer_km, possession.end_odometer_km,
        (cast(possession.end_odometer_km, Numeric) - cast(possession.start_odometer_km, Numeric)).label("distance_km"),
    ).select_from(possession).join(Vehicle, Vehicle.id == possession.vehicle_id).where(
        mileage_conditions(possession, window)[0])
    if filters.organization is not None:
        query = query.where(responsible_to(possession, possession.start_date, filters.organization))
    if filters.vehicle_type is not None:
        query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
    if filters.vehicle_id is not None:
        query = query.where(possession.vehicle_id == filters.vehicle_id)
    return query


def mileage_statement(filters, current, previous):
    """Only complete, non-overlapping closed possessions, no time proration."""
    possession = VehiclePossession
    start, end = possession.start_odometer_km, possession.end_odometer_km
    queries = []
    for name, window in [("current", current), ("previous", previous)]:
        valid, contained, overlap = mileage_conditions(possession, window)
        query = select(literal(name).label("period"), possession.vehicle_id,
            func.count().label("records"), func.sum(case((valid, 1), else_=0)).label("valid_records"),
            func.sum(case((valid, cast(end, Numeric) - cast(start, Numeric)), else_=0)).label("distance_km"),
            func.sum(case((~contained, 1), else_=0)).label("crossing_records"),
            func.sum(case((overlap, 1), else_=0)).label("overlapping_records"),
        ).select_from(possession).join(Vehicle, Vehicle.id == possession.vehicle_id).where(
            possession.end_date.is_not(None), possession.start_date < window.end_exclusive,
            possession.end_date > window.start_at)
        if filters.organization is not None:
            query = query.where(responsible_to(possession, possession.start_date, filters.organization))
        if filters.vehicle_type is not None:
            query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
        if filters.vehicle_id is not None:
            query = query.where(possession.vehicle_id == filters.vehicle_id)
        queries.append(query.group_by(possession.vehicle_id))
    return union_all(*queries)
