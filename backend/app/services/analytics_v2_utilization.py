"""Read-only possession and current-record context; no utilization-rate inference."""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import Numeric, String, and_, case, cast, func, literal, or_, select
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import aliased

from app.core.official_identity import INSTITUTIONAL_TIMEZONE
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.master_data import Allocation, Department, Organization
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle, VehicleStatus
from app.repositories.analytics_v2_repository import mileage_conditions
from app.repositories.vehicle_scope import current_operator, responsible_to
from app.schemas.analytics_v2 import AnalyticsV2Filter, AnalyticsV2Period
from app.services.analytics_v2_periods import equivalent_periods


def current_organization(vehicle_id):
    history = aliased(LocationHistory)
    return select(func.min(cast(Department.organization_id, String))).select_from(history).join(
        Allocation, Allocation.id == history.allocation_id).join(
        Department, Department.id == Allocation.department_id).where(
        history.vehicle_id == vehicle_id, history.end_date.is_(None),
    ).having(func.count(func.distinct(Department.organization_id)) == 1).correlate_except(
        history, Allocation, Department).scalar_subquery()


def possession_statement(filters: AnalyticsV2Filter, period: AnalyticsV2Period):
    possession = VehiclePossession
    valid_km, contained, overlap = mileage_conditions(possession, period)
    valid_duration = and_(contained, possession.end_date > possession.start_date, ~overlap)
    start_in = and_(possession.start_date >= period.start_at, possession.start_date < period.end_exclusive)
    end_in = and_(possession.end_date >= period.start_at, possession.end_date < period.end_exclusive)
    distance = cast(possession.end_odometer_km, Numeric) - cast(possession.start_odometer_km, Numeric)
    duration = func.extract('epoch', possession.end_date - possession.start_date)
    query = select(possession.id, possession.public_number, possession.vehicle_id, Vehicle.plate,
        possession.start_date, possession.end_date, possession.start_odometer_km, possession.end_odometer_km,
        start_in.label('start_in_period'), func.coalesce(end_in, False).label('end_in_period'),
        func.coalesce(valid_km, False).label('valid_km'), func.coalesce(valid_duration, False).label('valid_duration'),
        case((valid_km, distance), else_=None).label('distance_km'),
        case((valid_duration, duration), else_=None).label('duration_seconds'),
        case((and_(possession.end_date.is_not(None), possession.end_date > possession.start_date,
            possession.end_date < period.end_exclusive), possession.end_date), else_=possession.start_date).label('last_observed_at'),
    ).select_from(possession).join(Vehicle, Vehicle.id == possession.vehicle_id).where(
        possession.start_date < period.end_exclusive)
    if filters.organization is not None:
        query = query.where(current_operator(Vehicle.id, filters.organization),
            responsible_to(possession, possession.start_date, filters.organization))
    if filters.vehicle_type is not None:
        query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
    if filters.vehicle_id is not None:
        query = query.where(possession.vehicle_id == filters.vehicle_id)
    return query


class UtilizationVehicle(BaseModel):
    vehicle_id: UUID
    plate: str
    status: str
    organization_id: UUID | None
    started: int
    ended: int
    valid_duration_count: int
    duration_hours: Decimal | None
    valid_km_count: int
    distance_km: Decimal | None
    last_possession_event_at: datetime | None
    days_since_last_event: int | None
    open_maintenance_records: int


class UtilizationOrganization(BaseModel):
    organization_id: UUID | None
    name: str
    vehicles: int
    without_possession_event: int
    started: int
    ended: int
    distance_km: Decimal | None


class UtilizationAnalysis(BaseModel):
    filters: AnalyticsV2Filter
    period: AnalyticsV2Period
    roster_vehicles: int
    started: int
    ended: int
    valid_duration_count: int
    duration_hours: Decimal | None
    valid_km_count: int
    distance_km: Decimal | None
    km_per_valid_closed_possession: Decimal | None
    without_possession_event: int
    status_counts: dict[str, int]
    vehicles_with_open_maintenance: int
    open_maintenance_records: int
    vehicles: list[UtilizationVehicle]
    organizations: list[UtilizationOrganization]
    methodology: dict[str, str]


class UtilizationEvent(BaseModel):
    id: UUID
    public_number: int
    vehicle_id: UUID
    plate: str
    start_date: datetime
    end_date: datetime | None
    start_odometer_km: float | None
    end_odometer_km: float | None
    start_in_period: bool
    end_in_period: bool
    distance_km: Decimal | None
    duration_hours: Decimal | None


class UtilizationEvents(BaseModel):
    total_events: int
    events: list[UtilizationEvent]
    offset: int
    limit: int = 100


class AnalyticsV2Utilization:
    def __init__(self, db):
        self.db = db

    async def get(self, filters: AnalyticsV2Filter):
        period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        roster = select(Vehicle.id, Vehicle.plate, Vehicle.status,
            cast(current_organization(Vehicle.id), PGUUID(as_uuid=True)).label('organization_id'))
        if filters.organization is not None:
            roster = roster.where(current_operator(Vehicle.id, filters.organization))
        if filters.vehicle_type is not None:
            roster = roster.where(Vehicle.vehicle_type == filters.vehicle_type)
        if filters.vehicle_id is not None:
            roster = roster.where(Vehicle.id == filters.vehicle_id)
        vehicle_rows = (await self.db.execute(roster)).mappings().all()

        facts = possession_statement(filters, period).subquery('utilization_possessions')
        grouped = select(facts.c.vehicle_id,
            func.sum(case((facts.c.start_in_period, 1), else_=0)).label('started'),
            func.sum(case((facts.c.end_in_period, 1), else_=0)).label('ended'),
            func.count(facts.c.duration_seconds).label('duration_count'),
            func.sum(facts.c.duration_seconds).label('duration_seconds'),
            func.count(facts.c.distance_km).label('km_count'),
            func.sum(facts.c.distance_km).label('distance_km'),
            func.max(facts.c.last_observed_at).label('last_event'),
        ).group_by(facts.c.vehicle_id)
        observations = {row['vehicle_id']: row for row in (await self.db.execute(grouped)).mappings().all()}

        maintenance = select(MaintenanceRecord.vehicle_id, func.count().label('records')).join(
            Vehicle, Vehicle.id == MaintenanceRecord.vehicle_id).where(MaintenanceRecord.end_date.is_(None))
        if filters.organization is not None:
            maintenance = maintenance.where(current_operator(Vehicle.id, filters.organization),
                responsible_to(MaintenanceRecord, MaintenanceRecord.start_date, filters.organization))
        if filters.vehicle_type is not None:
            maintenance = maintenance.where(Vehicle.vehicle_type == filters.vehicle_type)
        if filters.vehicle_id is not None:
            maintenance = maintenance.where(Vehicle.id == filters.vehicle_id)
        open_counts = dict((await self.db.execute(maintenance.group_by(MaintenanceRecord.vehicle_id))).all())

        organization_ids = {row['organization_id'] for row in vehicle_rows if row['organization_id'] is not None}
        names = dict((await self.db.execute(select(Organization.id, Organization.name).where(
            Organization.id.in_(organization_ids)))).all()) if organization_ids else {}
        vehicles = []
        for row in vehicle_rows:
            observation = observations.get(row['id'])
            last = observation['last_event'] if observation else None
            km_count = observation['km_count'] if observation else 0
            duration_count = observation['duration_count'] if observation else 0
            vehicles.append(UtilizationVehicle(vehicle_id=row['id'], plate=row['plate'],
                status=getattr(row['status'], 'value', row['status']), organization_id=row['organization_id'],
                started=observation['started'] if observation else 0,
                ended=observation['ended'] if observation else 0,
                valid_duration_count=duration_count,
                duration_hours=Decimal(str(observation['duration_seconds'])) / Decimal(3600) if duration_count else None,
                valid_km_count=km_count,
                distance_km=Decimal(str(observation['distance_km'])) if km_count else None,
                last_possession_event_at=last,
                days_since_last_event=(filters.date_to - last.astimezone(INSTITUTIONAL_TIMEZONE).date()).days if last else None,
                open_maintenance_records=open_counts.get(row['id'], 0)))
        status_counts = {status.value: 0 for status in VehicleStatus}
        for vehicle in vehicles:
            status_counts[vehicle.status] = status_counts.get(vehicle.status, 0) + 1
        by_org = {}
        for vehicle in vehicles:
            item = by_org.setdefault(vehicle.organization_id, dict(vehicles=0, without=0, started=0, ended=0,
                distance=Decimal(0), measured=0))
            item['vehicles'] += 1
            item['without'] += int(vehicle.started == 0 and vehicle.ended == 0)
            item['started'] += vehicle.started
            item['ended'] += vehicle.ended
            if vehicle.distance_km is not None:
                item['distance'] += vehicle.distance_km
                item['measured'] += 1
        organizations = [UtilizationOrganization(organization_id=org_id,
            name=names.get(org_id, 'Sem lotação operadora atual inequívoca' if org_id is None else str(org_id)),
            vehicles=item['vehicles'], without_possession_event=item['without'], started=item['started'],
            ended=item['ended'], distance_km=item['distance'] if item['measured'] else None)
            for org_id, item in by_org.items()]
        organizations.sort(key=lambda item: (-item.vehicles, item.name))
        measured = [vehicle for vehicle in vehicles if vehicle.distance_km is not None]
        distance = sum((vehicle.distance_km for vehicle in measured), Decimal(0)) if measured else None
        valid_count = sum(vehicle.valid_km_count for vehicle in vehicles)
        duration_count = sum(vehicle.valid_duration_count for vehicle in vehicles)
        return UtilizationAnalysis(filters=filters, period=period, roster_vehicles=len(vehicles),
            started=sum(vehicle.started for vehicle in vehicles), ended=sum(vehicle.ended for vehicle in vehicles),
            valid_duration_count=duration_count,
            duration_hours=sum((vehicle.duration_hours for vehicle in vehicles if vehicle.duration_hours is not None), Decimal(0)) if duration_count else None,
            valid_km_count=valid_count, distance_km=distance,
            km_per_valid_closed_possession=distance / valid_count if distance is not None and valid_count else None,
            without_possession_event=sum(vehicle.started == 0 and vehicle.ended == 0 for vehicle in vehicles),
            status_counts=status_counts,
            vehicles_with_open_maintenance=sum(vehicle.open_maintenance_records > 0 for vehicle in vehicles),
            open_maintenance_records=sum(vehicle.open_maintenance_records for vehicle in vehicles),
            vehicles=vehicles, organizations=organizations,
            methodology={
                'roster': 'Veículos do cadastro atual; secretaria pela lotação operadora atual inequívoca. No escopo de uma secretaria, só veículos atualmente operados por ela entram no universo.',
                'events': 'Inícios e encerramentos de posses registrados nos dias civis encerrados do recorte. Para secretaria, cada posse também exige responsabilidade explícita ou lotação histórica no início. Posse não mede deslocamento contínuo.',
                'distance': 'Soma de hodômetro final menos inicial apenas em posses encerradas inteiramente no recorte, com leituras finitas não regressivas, duração positiva e sem sobreposição. Sem rateio de posses que cruzam o limite.',
                'duration': 'Soma de end_date - start_date somente em posses encerradas inteiramente no recorte, com duração positiva e sem sobreposição. Não exige hodômetro válido e não representa horas de motor ligado.',
                'last': 'Última abertura ou encerramento de posse observável até o fim do recorte. Dias desde esse evento são calculados até a data final filtrada; ausência de registro não comprova veículo parado.',
                'without': 'Veículos do cadastro atual sem abertura nem encerramento de posse observável no recorte. Podem ter posse iniciada antes, deslocamentos sem nova posse ou registros fora do escopo.',
                'status': 'Status cadastral atual e manutenções com end_date vazio no estado atual. Não reconstitui disponibilidade histórica nem confirma que um veículo esteve apto ou indisponível.',
                'ranking': 'Maior/menor km apenas entre veículos com ao menos uma posse encerrada com km válido no recorte. Sem km válido é cobertura ausente, não baixa movimentação.',
                'organization': 'Agrupamento pela lotação operadora atual dos veículos. Eventos históricos podem ter outra atribuição; no filtro de secretaria aplica-se também a responsabilidade da posse no início.',
            })

    async def events(self, filters: AnalyticsV2Filter, *, mode: Literal['period', 'history', 'km', 'duration'], offset: int):
        period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        facts = possession_statement(filters, period).subquery('utilization_event_facts')
        query = select(facts)
        if mode == 'period':
            query = query.where(or_(facts.c.start_in_period, facts.c.end_in_period))
        elif mode == 'km':
            query = query.where(facts.c.valid_km)
        elif mode == 'duration':
            query = query.where(facts.c.valid_duration)
        selected = query.subquery('utilization_events')
        count = (await self.db.execute(select(func.count()).select_from(selected))).scalar_one()
        rows = (await self.db.execute(select(selected).order_by(selected.c.last_observed_at.desc(), selected.c.id)
            .offset(offset).limit(100))).mappings().all()
        return UtilizationEvents(total_events=count, offset=offset, events=[UtilizationEvent(
            id=row['id'], public_number=row['public_number'], vehicle_id=row['vehicle_id'], plate=row['plate'],
            start_date=row['start_date'], end_date=row['end_date'], start_odometer_km=row['start_odometer_km'],
            end_odometer_km=row['end_odometer_km'], start_in_period=row['start_in_period'],
            end_in_period=row['end_in_period'], distance_km=row['distance_km'],
            duration_hours=Decimal(str(row['duration_seconds'])) / Decimal(3600) if row['duration_seconds'] is not None else None,
        ) for row in rows])
