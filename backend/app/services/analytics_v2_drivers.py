"""Read-only driver analysis over explicit record links and existing V2 rules."""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Numeric, and_, case, cast, func, literal, select

from app.core.official_identity import INSTITUTIONAL_TIMEZONE
from app.models.claim import Claim
from app.models.driver import Driver
from app.models.fine import Fine
from app.models.fuel_supply import FuelSupply
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle
from app.repositories.analytics_v2_repository import mileage_conditions
from app.repositories.vehicle_scope import fine_occurred_at, responsible_to
from app.schemas.analytics_v2 import AnalyticsV2Filter, AnalyticsV2Period
from app.services.analytics_v2_fuel import FuelAnomaly, detect_anomalies, fuel_statement
from app.services.analytics_v2_periods import equivalent_periods


def driver_possession_statement(filters: AnalyticsV2Filter, period: AnalyticsV2Period):
    possession = VehiclePossession
    valid, contained, overlap = mileage_conditions(possession, period)
    duration_valid = and_(contained, possession.end_date > possession.start_date, ~overlap)
    query = select(possession.id, possession.public_number, possession.driver_id, possession.vehicle_id,
        Vehicle.plate, possession.start_date, possession.end_date, possession.start_odometer_km,
        possession.end_odometer_km,
        case((valid, cast(possession.end_odometer_km, Numeric) - cast(possession.start_odometer_km, Numeric)),
            else_=None).label('distance_km'),
        case((duration_valid, func.extract('epoch', possession.end_date - possession.start_date) / 3600),
            else_=None).label('duration_hours'),
    ).select_from(possession).join(Vehicle, Vehicle.id == possession.vehicle_id).where(
        possession.start_date >= period.start_at, possession.start_date < period.end_exclusive)
    if filters.organization is not None:
        query = query.where(responsible_to(possession, possession.start_date, filters.organization))
    if filters.vehicle_type is not None:
        query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
    if filters.vehicle_id is not None:
        query = query.where(possession.vehicle_id == filters.vehicle_id)
    return query


def driver_record_statement(filters: AnalyticsV2Filter, period: AnalyticsV2Period,
    source: Literal['fine', 'claim']):
    model = Fine if source == 'fine' else Claim
    occurred_at = fine_occurred_at(Fine) if source == 'fine' else Claim.data_ocorrencia
    day = Fine.infraction_date if source == 'fine' else Claim.data_ocorrencia
    amount = Fine.amount if source == 'fine' else Claim.valor_estimado
    query = select(model.id, model.driver_id, model.vehicle_id, Vehicle.plate, day.label('date'),
        amount.label('amount'), model.status.label('status'),
    ).select_from(model).join(Vehicle, Vehicle.id == model.vehicle_id)
    if source == 'fine':
        query = query.where(day >= period.date_from, day <= period.date_to)
    else:
        query = query.where(day >= period.start_at, day < period.end_exclusive)
    if filters.organization is not None:
        query = query.where(responsible_to(model, occurred_at, filters.organization))
    if filters.vehicle_type is not None:
        query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
    if filters.vehicle_id is not None:
        query = query.where(model.vehicle_id == filters.vehicle_id)
    return query


class DriverMetric(BaseModel):
    driver_id: UUID
    name: str
    organization_id: UUID | None
    active: bool
    possessions: int
    valid_km_possessions: int
    distance_km: Decimal | None
    vehicles_with_possession: int
    fines: int
    claims: int
    fuel_supplies: int
    anomaly_rules: int
    anomalous_supplies: int
    license_expires_at: date | None = None
    license_status: Literal['expired', 'expiring', 'valid', 'missing'] | None = None


class LicenseSummary(BaseModel):
    as_of: date
    horizon_days: int = 30
    active_drivers: int
    expired: int
    expiring: int
    missing: int


class DriverAnalysis(BaseModel):
    filters: AnalyticsV2Filter
    period: AnalyticsV2Period
    drivers: list[DriverMetric]
    drivers_with_records: int
    totals: dict[str, int | Decimal | None]
    unlinked_records: dict[str, int]
    license: LicenseSummary | None
    readable_sources: list[str] = Field(default_factory=list)
    methodology: dict[str, str]


class DriverEvent(BaseModel):
    id: UUID
    source: Literal['possession', 'fine', 'claim', 'fuel_supply']
    date: str
    vehicle_id: UUID
    plate: str
    public_number: int | None = None
    end_date: datetime | None = None
    start_odometer_km: float | None = None
    end_odometer_km: float | None = None
    distance_km: Decimal | None = None
    duration_hours: Decimal | None = None
    amount: Decimal | None = None
    status: str | None = None
    anomaly: FuelAnomaly | None = None


class DriverEvents(BaseModel):
    driver_id: UUID
    source: str
    total_events: int
    events: list[DriverEvent]
    offset: int
    limit: int = 100


def license_state(expires: date | None, today: date):
    if expires is None:
        return 'missing'
    if expires < today:
        return 'expired'
    if expires <= today + timedelta(days=30):
        return 'expiring'
    return 'valid'


def build_analysis(filters, period, roster, possessions, fines, claims, supplies, anomalies,
    *, can_view_drivers: bool, today: date, readable_sources: list[str] | None = None):
    sources = {'possession': possessions, 'fine': fines, 'claim': claims,
        'fuel_supply': [row for row in supplies if row['supplied_at'] >= period.start_at]}
    unlinked = {key: sum(row['driver_id'] is None for row in rows) for key, rows in sources.items()}
    supply_driver = {row['id']: row['driver_id'] for row in sources['fuel_supply']}
    unlinked['anomaly_rule'] = sum(supply_driver.get(item.supply_id) is None for item in anomalies)
    activity = defaultdict(lambda: {'possession': [], 'fine': [], 'claim': [], 'fuel_supply': [], 'anomaly': []})
    for key, rows in sources.items():
        for row in rows:
            if row['driver_id'] is not None:
                activity[row['driver_id']][key].append(row)
    for item in anomalies:
        driver_id = supply_driver.get(item.supply_id)
        if driver_id is not None:
            activity[driver_id]['anomaly'].append(item)
    current_roster = [row for row in roster if filters.organization is None or row['organization_id'] == filters.organization]
    if can_view_drivers and filters.vehicle_type is None and filters.vehicle_id is None:
        included = {row['id'] for row in current_roster} | set(activity)
    else:
        included = set(activity)
    result = []
    for row in roster:
        if row['id'] not in included:
            continue
        facts = activity[row['id']]
        measured = [item['distance_km'] for item in facts['possession'] if item['distance_km'] is not None]
        active = bool(row['ativo'])
        license_visible = can_view_drivers and active and (
            filters.organization is None or row['organization_id'] == filters.organization)
        result.append(DriverMetric(driver_id=row['id'], name=row['nome_completo'],
            organization_id=row['organization_id'], active=active,
            possessions=len(facts['possession']), valid_km_possessions=len(measured),
            distance_km=sum(measured, Decimal(0)) if measured else None,
            vehicles_with_possession=len({item['vehicle_id'] for item in facts['possession']}),
            fines=len(facts['fine']), claims=len(facts['claim']), fuel_supplies=len(facts['fuel_supply']),
            anomaly_rules=len(facts['anomaly']), anomalous_supplies=len({item.supply_id for item in facts['anomaly']}),
            license_expires_at=row['cnh_validade'] if license_visible else None,
            license_status=license_state(row['cnh_validade'], today) if license_visible else None))
    result.sort(key=lambda item: item.name.casefold())
    active_roster = [row for row in current_roster if row['ativo']]
    states = [license_state(row['cnh_validade'], today) for row in active_roster] if can_view_drivers else []
    license_summary = LicenseSummary(as_of=today, active_drivers=len(active_roster),
        expired=states.count('expired'), expiring=states.count('expiring'),
        missing=states.count('missing')) if can_view_drivers else None
    measured_drivers = [item for item in result if item.distance_km is not None]
    totals = {'drivers': len(result), 'possessions': sum(item.possessions for item in result),
        'valid_km_possessions': sum(item.valid_km_possessions for item in result),
        'distance_km': sum((item.distance_km for item in measured_drivers), Decimal(0)) if measured_drivers else None,
        'fines': sum(item.fines for item in result), 'claims': sum(item.claims for item in result),
        'fuel_supplies': sum(item.fuel_supplies for item in result),
        'anomaly_rules': sum(item.anomaly_rules for item in result)}
    return DriverAnalysis(filters=filters, period=period, drivers=result,
        drivers_with_records=sum(any((item.possessions, item.fines, item.claims, item.fuel_supplies)) for item in result),
        totals=totals, unlinked_records=unlinked, license=license_summary,
        readable_sources=readable_sources or [],
        methodology={
            'scope': 'Somente vínculos explícitos por driver_id. Secretaria filtra a responsabilidade histórica de cada registro; o cadastro atual da secretaria também entra no universo quando há permissão de leitura de condutores. Tipo e veículo filtram os registros e, quando aplicados, o universo de condutores.',
            'possession': 'Posses iniciadas nos dias civis encerrados do recorte. Veículos distintos são contados somente nessas posses. Posse não comprova condução contínua.',
            'distance': 'Soma de hodômetro final menos inicial das posses encerradas integralmente no recorte, com leituras finitas não regressivas, duração positiva e sem sobreposição. Sem rateio de posses cruzando o limite.',
            'incidents': 'Multas pela data da infração, independentemente do status; sinistros pela data da ocorrência. Associação ao condutor registrada, sem atribuição de culpa.',
            'fuel': 'Abastecimentos pela data registrada. Anomalias são acionamentos da regra analítica fuel-v2.1; mais de uma regra pode ocorrer no mesmo abastecimento. Comparações usam apenas o recorte organizacional e o período anterior equivalente. Não representam fraude, consumo real ou responsabilidade pessoal.',
            'license': 'Indicador administrativo do cadastro atual dos condutores ativos da secretaria selecionada: vencida antes de hoje; a vencer de hoje até 30 dias inclusive; sem data em grupo próprio. Exige permissão de leitura de condutores. Não acompanha filtro de tipo/veículo nem o recorte histórico.',
            'coverage': 'Registros sem driver_id não são atribuídos por nome. A cobertura por fonte mostra quantos registros do recorte ficaram sem vínculo; anomalias contam acionamentos de regra sem vínculo.',
            'ranking': 'Ordenação por contagem absoluta ou km válido da coluna selecionada. Não existe score composto nem inferência de risco individual.',
        })


class AnalyticsV2Drivers:
    def __init__(self, db):
        self.db = db

    async def _load(self, filters, *, can_view_drivers):
        period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        roster_query = select(Driver.id, Driver.nome_completo, Driver.organization_id, Driver.ativo,
            (Driver.cnh_validade if can_view_drivers else literal(None)).label('cnh_validade'))
        roster = (await self.db.execute(roster_query)).mappings().all()
        possessions = (await self.db.execute(driver_possession_statement(filters, period))).mappings().all()
        fines = (await self.db.execute(driver_record_statement(filters, period, 'fine'))).mappings().all()
        claims = (await self.db.execute(driver_record_statement(filters, period, 'claim'))).mappings().all()
        supplies = (await self.db.execute(fuel_statement(filters, previous.start_at, period.end_exclusive).order_by(
            FuelSupply.vehicle_id, FuelSupply.supplied_at, FuelSupply.id))).mappings().all()
        anomalies, _, _ = detect_anomalies(supplies, period)
        return period, roster, possessions, fines, claims, supplies, anomalies

    async def get(self, filters, *, can_view_drivers, readable_sources=None):
        period, roster, possessions, fines, claims, supplies, anomalies = await self._load(
            filters, can_view_drivers=can_view_drivers)
        today = datetime.now(INSTITUTIONAL_TIMEZONE).date()
        return build_analysis(filters, period, roster, possessions, fines, claims, supplies, anomalies,
            can_view_drivers=can_view_drivers, today=today, readable_sources=readable_sources)

    async def events(self, filters, driver_id: UUID, *, source: str, offset: int, can_view_drivers: bool = False):
        period, roster, possessions, fines, claims, supplies, anomalies = await self._load(
            filters, can_view_drivers=False)
        analysis = build_analysis(filters, period, roster, possessions, fines, claims, supplies, anomalies,
            can_view_drivers=False, today=datetime.now(INSTITUTIONAL_TIMEZONE).date())
        if driver_id not in {item.driver_id for item in analysis.drivers}:
            roster_visible = can_view_drivers and filters.vehicle_type is None and filters.vehicle_id is None and any(
                row['id'] == driver_id and (filters.organization is None or row['organization_id'] == filters.organization)
                for row in roster)
            if not roster_visible:
                raise HTTPException(404, 'Condutor fora do recorte autorizado')
        current_supplies = [row for row in supplies if row['supplied_at'] >= period.start_at]
        supply_by_id = {row['id']: row for row in current_supplies}
        if source == 'anomaly':
            selected = [(item.supplied_at, item.supply_id, supply_by_id[item.supply_id], item)
                for item in anomalies if item.supply_id in supply_by_id and supply_by_id[item.supply_id]['driver_id'] == driver_id]
        else:
            groups = {'possession': possessions, 'fine': fines, 'claim': claims, 'fuel_supply': current_supplies}
            selected = [(row['start_date'] if source == 'possession' else row['date'] if source in ('fine', 'claim') else row['supplied_at'],
                row['id'], row, None) for row in groups[source] if row['driver_id'] == driver_id]
        selected.sort(key=lambda item: (item[0], str(item[1])), reverse=True)
        events = []
        for when, _id, row, anomaly in selected[offset:offset + 100]:
            status = row['status'] if source in ('fine', 'claim') else None
            events.append(DriverEvent(id=row['id'], source='fuel_supply' if source == 'anomaly' else source,
                date=when.isoformat(), vehicle_id=row['vehicle_id'], plate=row['plate'],
                public_number=row['public_number'] if source == 'possession' else None,
                end_date=row['end_date'] if source == 'possession' else None,
                start_odometer_km=row['start_odometer_km'] if source == 'possession' else None,
                end_odometer_km=row['end_odometer_km'] if source == 'possession' else None,
                distance_km=row['distance_km'] if source == 'possession' else None,
                duration_hours=row['duration_hours'] if source == 'possession' else None,
                amount=row['amount'] if source in ('fine', 'claim') else row['total_amount'] if source in ('fuel_supply', 'anomaly') else None,
                status=getattr(status, 'value', status), anomaly=anomaly))
        return DriverEvents(driver_id=driver_id, source=source, total_events=len(selected), events=events, offset=offset)
