"""Read-only maintenance analytics over the existing intervention fields."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import Numeric, and_, case, cast, func, literal, select

from app.models.maintenance import MaintenanceRecord
from app.models.vehicle import Vehicle
from app.repositories.analytics_v2_repository import AnalyticsV2Repository
from app.repositories.vehicle_scope import responsible_to
from app.schemas.analytics_v2 import AnalyticsV2Amount, AnalyticsV2Filter, AnalyticsV2Period
from app.services.analytics_v2_periods import equivalent_periods


def maintenance_statement(filters: AnalyticsV2Filter, period: AnalyticsV2Period):
    record = MaintenanceRecord
    valid_duration = and_(record.end_date.is_not(None), record.end_date >= record.start_date)
    valid_cost = and_(record.total_cost >= 0, record.total_cost < literal(Decimal('Infinity'), type_=Numeric))
    query = select(record.id, record.vehicle_id, Vehicle.plate, record.start_date, record.end_date,
        case((valid_cost, record.total_cost), else_=None).label('cost'),
        case((valid_duration, func.extract('epoch', record.end_date - record.start_date)), else_=None).label('duration_seconds'),
    ).select_from(record).join(Vehicle, Vehicle.id == record.vehicle_id).where(
        record.start_date >= period.start_at, record.start_date < period.end_exclusive)
    if filters.organization is not None:
        query = query.where(responsible_to(record, record.start_date, filters.organization))
    if filters.vehicle_type is not None:
        query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
    if filters.vehicle_id is not None:
        query = query.where(record.vehicle_id == filters.vehicle_id)
    return query


class MaintenanceVehicle(BaseModel):
    vehicle_id: UUID
    plate: str
    cost: AnalyticsV2Amount
    interventions: int
    open_interventions: int
    valid_duration_count: int
    average_duration_hours: Decimal | None
    distance_km: Decimal | None
    cost_per_km: Decimal | None


class MaintenanceAnalysis(BaseModel):
    filters: AnalyticsV2Filter
    period: AnalyticsV2Period
    cost: AnalyticsV2Amount
    interventions: int
    open_interventions: int
    valid_duration_count: int
    invalid_duration_count: int
    average_duration_hours: Decimal | None
    repeated_vehicles: int
    measured_cost: AnalyticsV2Amount
    measured_distance_km: Decimal | None
    measured_vehicles: int
    cost_per_km: Decimal | None
    vehicles: list[MaintenanceVehicle]
    methodology: dict[str, str]


class MaintenanceEvent(BaseModel):
    id: UUID
    vehicle_id: UUID
    plate: str
    start_date: datetime
    end_date: datetime | None
    cost: Decimal | None
    duration_hours: Decimal | None


class MaintenanceEvents(BaseModel):
    total_events: int
    events: list[MaintenanceEvent]
    offset: int
    limit: int = 100


def amount(records: int, known: int, value) -> AnalyticsV2Amount:
    subtotal = Decimal(str(value)) if value is not None else Decimal(0)
    return AnalyticsV2Amount(value=subtotal if records == known else None, known_value=subtotal,
        records=records, missing_or_invalid=records - known)


class AnalyticsV2Maintenance:
    def __init__(self, db):
        self.db = db
        self.repository = AnalyticsV2Repository(db)

    async def get(self, filters: AnalyticsV2Filter):
        period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        facts = maintenance_statement(filters, period).subquery('maintenance_facts')
        rows = (await self.db.execute(select(facts.c.vehicle_id, facts.c.plate,
            func.count().label('records'), func.count(facts.c.cost).label('known'),
            func.sum(facts.c.cost).label('cost'),
            func.sum(case((facts.c.end_date.is_(None), 1), else_=0)).label('open_count'),
            func.count(facts.c.duration_seconds).label('duration_count'),
            func.sum(facts.c.duration_seconds).label('duration_seconds'),
        ).group_by(facts.c.vehicle_id, facts.c.plate))).mappings().all()
        mileage_rows = await self.repository.mileage_rows(filters, period, previous)
        distances = {row['vehicle_id']: Decimal(str(row['distance_km'])) for row in mileage_rows
            if row['period'] == 'current' and row['valid_records'] > 0}
        vehicles = []
        for row in rows:
            cost = amount(row['records'], row['known'], row['cost'])
            km = distances.get(row['vehicle_id'])
            hours = Decimal(str(row['duration_seconds'])) / Decimal(3600) / row['duration_count'] if row['duration_count'] else None
            vehicles.append(MaintenanceVehicle(vehicle_id=row['vehicle_id'], plate=row['plate'], cost=cost,
                interventions=row['records'], open_interventions=row['open_count'],
                valid_duration_count=row['duration_count'], average_duration_hours=hours,
                distance_km=km, cost_per_km=cost.value / km if km and cost.value is not None else None))
        vehicles.sort(key=lambda vehicle: (-vehicle.cost.known_value, -vehicle.interventions, vehicle.plate))
        records = sum(row['records'] for row in rows)
        known = sum(row['known'] for row in rows)
        duration_count = sum(row['duration_count'] for row in rows)
        duration_seconds = sum((Decimal(str(row['duration_seconds'])) for row in rows if row['duration_seconds'] is not None), Decimal(0))
        measured_rows = [row for row in rows if row['vehicle_id'] in distances]
        measured = amount(sum(row['records'] for row in measured_rows), sum(row['known'] for row in measured_rows),
            sum((Decimal(str(row['cost'])) for row in measured_rows if row['cost'] is not None), Decimal(0)))
        km = sum(distances.values(), Decimal(0)) if distances else None
        return MaintenanceAnalysis(filters=filters, period=period,
            cost=amount(records, known, sum((Decimal(str(row['cost'])) for row in rows if row['cost'] is not None), Decimal(0))),
            interventions=records, open_interventions=sum(row['open_count'] for row in rows),
            valid_duration_count=duration_count,
            invalid_duration_count=records - duration_count - sum(row['open_count'] for row in rows),
            average_duration_hours=duration_seconds / Decimal(3600) / duration_count if duration_count else None,
            repeated_vehicles=sum(row['records'] >= 2 for row in rows),
            measured_cost=measured, measured_distance_km=km, measured_vehicles=len(distances),
            cost_per_km=measured.value / km if km and measured.value is not None else None,
            vehicles=vehicles,
            methodology={
                'cohort': 'Intervenções com início nos dias civis encerrados do recorte, em America/Bahia. Uma intervenção conta uma vez.',
                'cost': 'Soma de maintenance_records.total_cost. Valor registrado; não comprova pagamento nem TCO completo. Valores ausentes ou inválidos não são imputados.',
                'mileage': 'Custo de manutenção dos veículos com km válido dividido pelo km das posses encerradas válidas desses veículos no recorte. Veículos medidos sem manutenção entram com custo zero. Cobertura parcial; não é custo total da frota.',
                'duration': 'Média de end_date - start_date, em horas, somente nas intervenções encerradas com intervalo não negativo. Abertas e intervalos inválidos ficam fora da média. Não equivale a tempo de indisponibilidade operacional.',
                'open': 'Intervenções do recorte sem end_date no estado atual do cadastro. Não reconstrói o número que estava aberto no fim histórico do período.',
                'recurrence': 'Veículos com duas ou mais intervenções iniciadas no recorte. Repetição quantitativa, sem inferir mesma falha, causa ou classificação preventiva/corretiva.',
            })

    async def events(self, filters: AnalyticsV2Filter, *, subset: Literal['all', 'open', 'duration', 'repeated', 'measured'] = 'all', offset: int = 0):
        period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        facts = maintenance_statement(filters, period).subquery('maintenance_events')
        query = select(facts)
        if subset == 'open':
            query = query.where(facts.c.end_date.is_(None))
        elif subset == 'duration':
            query = query.where(facts.c.duration_seconds.is_not(None))
        elif subset == 'repeated':
            query = query.where(facts.c.vehicle_id.in_(select(facts.c.vehicle_id).group_by(facts.c.vehicle_id).having(func.count() >= 2)))
        elif subset == 'measured':
            distance = self.repository_distance(filters, period, previous)
            query = query.where(facts.c.vehicle_id.in_(distance))
        selected = query.subquery('selected_maintenance')
        count = (await self.db.execute(select(func.count()).select_from(selected))).scalar_one()
        rows = (await self.db.execute(select(selected).order_by(selected.c.start_date.desc(), selected.c.id)
            .offset(offset).limit(100))).mappings().all()
        return MaintenanceEvents(total_events=count, offset=offset, events=[MaintenanceEvent(
            id=row['id'], vehicle_id=row['vehicle_id'], plate=row['plate'], start_date=row['start_date'],
            end_date=row['end_date'], cost=row['cost'],
            duration_hours=Decimal(str(row['duration_seconds'])) / Decimal(3600) if row['duration_seconds'] is not None else None,
        ) for row in rows])

    @staticmethod
    def repository_distance(filters, period, previous):
        from app.repositories.analytics_v2_repository import mileage_statement
        distance = mileage_statement(filters, period, previous).subquery('maintenance_measured_distance')
        return select(distance.c.vehicle_id).where(distance.c.period == 'current', distance.c.valid_records > 0)
