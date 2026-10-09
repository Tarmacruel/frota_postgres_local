"""Read-only fuel analysis. Rules here never modify operational anomaly flags."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from statistics import median
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.models.fuel_station import FuelStation
from app.models.fuel_supply import FuelSupply
from app.models.vehicle import Vehicle
from app.repositories.analytics_v2_repository import AnalyticsV2Repository
from app.repositories.vehicle_scope import responsible_to
from app.schemas.analytics_v2 import AnalyticsV2Amount, AnalyticsV2Filter, AnalyticsV2Period
from app.services.analytics_v2_detail import DetailEvent
from app.services.analytics_v2_periods import calendar_months, equivalent_periods

ZERO = Decimal('0')
BAHIA = ZoneInfo('America/Bahia')
RULE_VERSION = 'fuel-v2.1'
MIN_HISTORY = 5
CAPACITY_TOLERANCE = Decimal('1.02')
CLOSE_HOURS = 24
CLOSE_KM = Decimal('10')
PRICE_DAYS = 90


class FuelTotals(BaseModel):
    liters: AnalyticsV2Amount
    cost: AnalyticsV2Amount
    price_per_liter: Decimal | None
    priced_records: int
    records: int


class FuelVehicle(BaseModel):
    vehicle_id: UUID
    plate: str
    vehicle_type: str
    totals: FuelTotals
    distance_km: Decimal | None
    km_per_liter_supplied: Decimal | None
    liters_per_100km_supplied: Decimal | None
    fuel_cost_per_km: Decimal | None
    category_liters_per_100km: Decimal | None
    category_sample_vehicles: int
    anomaly_count: int


class FuelStationGroup(BaseModel):
    key: str
    name: str
    totals: FuelTotals
    anomaly_count: int


class FuelMonth(BaseModel):
    month: str
    totals: FuelTotals


class FuelAnomaly(BaseModel):
    kind: str
    label: str
    supply_id: UUID
    vehicle_id: UUID
    plate: str
    supplied_at: datetime
    observed: str
    reference: str
    sample_size: int
    rule: str
    limitation: str
    previous_supply_id: UUID | None = None
    rule_version: str = RULE_VERSION


class FuelAnalysis(BaseModel):
    filters: AnalyticsV2Filter
    period: AnalyticsV2Period
    previous_period: AnalyticsV2Period
    totals: FuelTotals
    previous_totals: FuelTotals
    measured_distance_km: Decimal | None
    measured_vehicles: int
    measured_km_per_liter_supplied: Decimal | None
    measured_liters_per_100km_supplied: Decimal | None
    monthly: list[FuelMonth]
    vehicles: list[FuelVehicle]
    stations: list[FuelStationGroup]
    anomaly_counts: dict[str, int]
    anomalies: list[FuelAnomaly] = Field(default_factory=list)
    can_view_records: bool
    quality: dict[str, int]
    methodology: dict[str, str]


class FuelEvents(BaseModel):
    total_events: int
    events: list[DetailEvent]
    offset: int
    limit: int = 100


def finite_decimal(value, *, positive=False):
    if value is None:
        return None
    try:
        number = Decimal(str(value))
    except (ValueError, ArithmeticError):
        return None
    if not number.is_finite() or (number <= 0 if positive else number < 0):
        return None
    return number


def station_key(row):
    if row['station_id'] is not None:
        return f"id:{row['station_id']}"
    name = (row['station_text'] or '').strip().lower()
    return f'name:{name}' if name else 'unknown'


def fuel_statement(filters, start_at, end_exclusive, *, station=None):
    query = select(FuelSupply.id, FuelSupply.vehicle_id, Vehicle.plate, Vehicle.vehicle_type,
        Vehicle.tank_capacity_liters, FuelSupply.supplied_at, FuelSupply.odometer_km,
        FuelSupply.liters, FuelSupply.total_amount, FuelSupply.fuel_type,
        FuelSupply.fuel_station_id.label('station_id'), FuelSupply.fuel_station.label('station_text'),
        FuelStation.name.label('station_name'), FuelSupply.is_consumption_anomaly.label('registered_flag'),
    ).select_from(FuelSupply).join(Vehicle, Vehicle.id == FuelSupply.vehicle_id).outerjoin(
        FuelStation, FuelStation.id == FuelSupply.fuel_station_id).where(
        FuelSupply.supplied_at >= start_at, FuelSupply.supplied_at < end_exclusive)
    if filters.organization is not None:
        query = query.where(responsible_to(FuelSupply, FuelSupply.supplied_at, filters.organization))
    if filters.vehicle_type is not None:
        query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
    if filters.vehicle_id is not None:
        query = query.where(FuelSupply.vehicle_id == filters.vehicle_id)
    if station is not None:
        if station == 'unknown':
            query = query.where(FuelSupply.fuel_station_id.is_(None),
                func.nullif(func.trim(FuelSupply.fuel_station), '').is_(None))
        elif station.startswith('id:'):
            query = query.where(FuelSupply.fuel_station_id == UUID(station[3:]))
        else:
            query = query.where(FuelSupply.fuel_station_id.is_(None),
                func.lower(func.trim(FuelSupply.fuel_station)) == station[5:])
    return query


def fuel_totals(rows):
    count = len(rows)
    liters = [finite_decimal(row['liters'], positive=True) for row in rows]
    costs = [finite_decimal(row['total_amount']) for row in rows]
    liter_known = sum(item is not None for item in liters)
    cost_known = sum(item is not None for item in costs)
    liter_sum = sum((item for item in liters if item is not None), ZERO)
    cost_sum = sum((item for item in costs if item is not None), ZERO)
    priced = [(cost, liter) for cost, liter in zip(costs, liters) if cost is not None and liter is not None]
    priced_liters = sum((liter for _, liter in priced), ZERO)
    return FuelTotals(liters=AnalyticsV2Amount(value=liter_sum if liter_known == count else None,
        known_value=liter_sum, records=count, missing_or_invalid=count-liter_known),
        cost=AnalyticsV2Amount(value=cost_sum if cost_known == count else None,
            known_value=cost_sum, records=count, missing_or_invalid=count-cost_known),
        price_per_liter=sum((cost for cost, _ in priced), ZERO) / priced_liters if priced_liters > 0 else None,
        priced_records=len(priced), records=count)


def detect_anomalies(rows, period):
    """Chronological comparisons use only scoped rows and preceding samples."""
    previous_by_vehicle = {}
    consumption_history = defaultdict(list)
    price_history = defaultdict(list)
    anomalies = []
    insufficient_consumption = insufficient_price = 0
    for row in rows:
        current = row['supplied_at'] >= period.start_at
        liters = finite_decimal(row['liters'], positive=True)
        odometer = finite_decimal(row['odometer_km'])
        capacity = finite_decimal(row['tank_capacity_liters'], positive=True)
        cost = finite_decimal(row['total_amount'])
        fuel_type = (row['fuel_type'] or '').strip().casefold()
        previous = previous_by_vehicle.get(row['vehicle_id'])
        key = (row['vehicle_id'], fuel_type)
        price_key = (station_key(row), fuel_type)

        def add(kind, label, observed, reference, sample, rule, limitation, previous_id=None):
            if current:
                anomalies.append(FuelAnomaly(kind=kind, label=label, supply_id=row['id'],
                    vehicle_id=row['vehicle_id'], plate=row['plate'], supplied_at=row['supplied_at'],
                    observed=str(observed), reference=str(reference), sample_size=sample,
                    rule=rule, limitation=limitation, previous_supply_id=previous_id))

        if liters is not None and capacity is not None and liters > capacity * CAPACITY_TOLERANCE:
            add('capacity', 'Volume acima da capacidade cadastrada', f'{liters} L', f'{capacity} L', 1,
                'litros > capacidade cadastrada × 1,02',
                'A capacidade é o cadastro atual, sem histórico; a regra é triagem e não comprova irregularidade.')

        interval_ratio = None
        if previous is not None:
            prior_odometer = finite_decimal(previous['odometer_km'])
            elapsed = row['supplied_at'] - previous['supplied_at']
            if odometer is not None and prior_odometer is not None:
                delta = odometer - prior_odometer
                if delta < 0:
                    add('odometer', 'Hodômetro regressivo', f'{odometer} km', f'{prior_odometer} km', 2,
                        'hodômetro atual < hodômetro do abastecimento anterior do veículo',
                        'Pode refletir erro de lançamento ou troca de instrumento; verificar os dois registros.', previous['id'])
                elif timedelta(0) <= elapsed <= timedelta(hours=CLOSE_HOURS) and delta <= CLOSE_KM:
                    add('close', 'Abastecimentos próximos', f'{delta} km em {elapsed}',
                        f'até {CLOSE_KM} km em {CLOSE_HOURS} h', 2,
                        'intervalo ≤ 24 h e diferença de hodômetro entre 0 e 10 km',
                        'Proximidade exige conferência; não determina duplicidade nem causa.', previous['id'])
                if delta > 0 and liters is not None and fuel_type and fuel_type == (previous['fuel_type'] or '').strip().casefold():
                    interval_ratio = delta / liters
                    history = consumption_history[key]
                    if current and len(history) < MIN_HISTORY:
                        insufficient_consumption += 1
                    if len(history) >= MIN_HISTORY:
                        reference = median(history)
                        if interval_ratio < reference * Decimal('0.7') or interval_ratio > reference * Decimal('1.4'):
                            add('consumption', 'Razão de intervalo fora do histórico', f'{interval_ratio:.2f} km/L',
                                f'{reference:.2f} km/L', len(history),
                                'Δhodômetro / litros atuais fora de 70–140% da mediana dos intervalos anteriores do mesmo veículo e combustível; mínimo 5',
                                'Sem indicação de tanque cheio, esta razão não comprova consumo efetivo. Amostra limitada ao período anterior equivalente e ao recorte aplicado.', previous['id'])

        if cost is not None and liters is not None and fuel_type and price_key[0] != 'unknown':
            price = cost / liters
            history = [item for when, item in price_history[price_key]
                if row['supplied_at'] - when <= timedelta(days=PRICE_DAYS)]
            if current and len(history) < MIN_HISTORY:
                insufficient_price += 1
            if len(history) >= MIN_HISTORY:
                reference = median(history)
                if reference > 0 and (price < reference * Decimal('0.7') or price > reference * Decimal('1.3')):
                    add('price', 'Preço por litro fora do histórico do posto', f'R$ {price:.2f}/L',
                        f'R$ {reference:.2f}/L', len(history),
                        'valor / litros fora de 70–130% da mediana dos registros anteriores do mesmo posto e combustível nos últimos 90 dias; mínimo 5',
                        'Variação de preço exige conferência; não representa preço de mercado nem comprova erro.')
            price_history[price_key].append((row['supplied_at'], price))

        if interval_ratio is not None:
            consumption_history[key].append(interval_ratio)
        previous_by_vehicle[row['vehicle_id']] = row
    return anomalies, insufficient_consumption, insufficient_price


def build_analysis(rows, distance_rows, filters, period, previous, can_view_records):
    rows = sorted(rows, key=lambda item: (item['supplied_at'], str(item['id'])))
    current_rows = [row for row in rows if row['supplied_at'] >= period.start_at]
    previous_rows = [row for row in rows if row['supplied_at'] < period.start_at]
    anomalies, insufficient_consumption, insufficient_price = detect_anomalies(rows, period)
    counts = Counter(item.kind for item in anomalies)
    supplied_vehicles = {row['vehicle_id'] for row in current_rows}
    distances = {row['vehicle_id']: Decimal(str(row['distance_km'])) for row in distance_rows
        if row['period'] == 'current' and row['valid_records'] > 0 and row['vehicle_id'] in supplied_vehicles}
    distance_km = sum(distances.values(), ZERO) if distances else None
    measured = [row for row in current_rows if row['vehicle_id'] in distances]
    measured_liters = fuel_totals(measured).liters
    measured_km_per_liter = (distance_km / measured_liters.value if distance_km is not None
        and measured_liters.records and measured_liters.value is not None and measured_liters.value > 0 else None)
    measured_liters_per_100km = (measured_liters.value / distance_km * 100 if distance_km is not None
        and distance_km > 0 and measured_liters.records and measured_liters.value is not None else None)
    by_vehicle, by_station = defaultdict(list), defaultdict(list)
    for row in current_rows:
        by_vehicle[row['vehicle_id']].append(row)
        by_station[station_key(row)].append(row)
    anomaly_vehicle = Counter(item.vehicle_id for item in anomalies)
    anomaly_station = Counter()
    station_by_supply = {row['id']: station_key(row) for row in current_rows}
    for item in anomalies:
        anomaly_station[station_by_supply[item.supply_id]] += 1
    vehicles = []
    for vehicle_id, items in by_vehicle.items():
        total = fuel_totals(items)
        km = distances.get(vehicle_id)
        ratio = km / total.liters.value if km is not None and total.liters.records and total.liters.value and total.liters.value > 0 else None
        vehicles.append(FuelVehicle(vehicle_id=vehicle_id, plate=items[0]['plate'],
            vehicle_type=getattr(items[0]['vehicle_type'], 'value', items[0]['vehicle_type']), totals=total,
            distance_km=km, km_per_liter_supplied=ratio,
            liters_per_100km_supplied=100 / ratio if ratio and ratio > 0 else None,
            fuel_cost_per_km=total.cost.value / km if km and total.cost.value is not None else None,
            category_liters_per_100km=None, category_sample_vehicles=0,
            anomaly_count=anomaly_vehicle[vehicle_id]))
    for item in vehicles:
        peers = [other for other in vehicles if other.vehicle_id != item.vehicle_id
            and other.vehicle_type == item.vehicle_type and other.distance_km and other.distance_km > 0
            and other.totals.liters.value is not None and other.totals.liters.records]
        if len(peers) >= 3:
            peer_km = sum((other.distance_km for other in peers), ZERO)
            peer_liters = sum((other.totals.liters.value for other in peers), ZERO)
            item.category_liters_per_100km = peer_liters / peer_km * 100 if peer_km > 0 else None
            item.category_sample_vehicles = len(peers)
    stations = [FuelStationGroup(key=key, name=(items[0]['station_name'] or items[0]['station_text'] or '').strip() or 'Não informado',
        totals=fuel_totals(items), anomaly_count=anomaly_station[key]) for key, items in by_station.items()]
    return FuelAnalysis(filters=filters, period=period, previous_period=previous,
        totals=fuel_totals(current_rows), previous_totals=fuel_totals(previous_rows),
        measured_distance_km=distance_km, measured_vehicles=len(distances),
        measured_km_per_liter_supplied=measured_km_per_liter,
        measured_liters_per_100km_supplied=measured_liters_per_100km,
        monthly=[FuelMonth(month=month, totals=fuel_totals([row for row in current_rows
            if row['supplied_at'].astimezone(BAHIA).strftime('%Y-%m') == month]))
            for month, _, _ in calendar_months(filters.date_from, filters.date_to)],
        vehicles=sorted(vehicles, key=lambda item: (-item.totals.cost.known_value, item.plate)),
        stations=sorted(stations, key=lambda item: (-item.totals.cost.known_value, item.name)),
        anomaly_counts={kind: counts[kind] for kind in ('capacity', 'odometer', 'close', 'consumption', 'price')},
        anomalies=sorted(anomalies, key=lambda item: (item.supplied_at, str(item.supply_id)), reverse=True) if can_view_records else [],
        can_view_records=can_view_records,
        quality={'missing_value': sum(finite_decimal(row['total_amount']) is None for row in current_rows),
            'invalid_liters': sum(finite_decimal(row['liters'], positive=True) is None for row in current_rows),
            'missing_tank_capacity': sum(finite_decimal(row['tank_capacity_liters'], positive=True) is None for row in current_rows),
            'missing_station': sum(station_key(row) == 'unknown' for row in current_rows),
            'registered_operational_flags': sum(bool(row['registered_flag']) for row in current_rows),
            'insufficient_consumption_reference': insufficient_consumption,
            'insufficient_price_reference': insufficient_price},
        methodology={
            'period': 'Dias civis encerrados em America/Bahia; início inclusivo e fim exclusivo. Comparação com período anterior de mesma duração.',
            'liters': 'Soma de litros abastecidos registrados; não representa combustível consumido.',
            'cost': 'Soma de valores registrados nos abastecimentos; ausência ou invalidade torna o total completo indisponível.',
            'price': 'Soma dos valores / soma dos litros somente nos abastecimentos com ambos válidos; não é média simples de preços.',
            'mileage': 'Km apenas de posses encerradas válidas e inteiramente no período. Razões usam litros/custos dos mesmos veículos medidos; abastecimento não indica tanque cheio.',
            'category': 'Referência de categoria: litros por 100 km abastecidos dos outros veículos do mesmo tipo atual, com ao menos três outros veículos medidos; não é benchmark externo.',
            'anomalies': 'Regras de triagem fuel-v2.1 somente leitura, no recorte organizacional aplicado. Histórico usa também o período anterior equivalente. Flags operacionais persistidas não são alteradas nem fundidas com estas regras.',
        })


class AnalyticsV2Fuel:
    def __init__(self, db):
        self.db = db
        self.repository = AnalyticsV2Repository(db)

    async def get(self, filters, *, can_view_records):
        period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        result = await self.db.execute(fuel_statement(filters, previous.start_at, period.end_exclusive).order_by(
            FuelSupply.vehicle_id, FuelSupply.supplied_at, FuelSupply.id))
        rows = result.mappings().all()
        distance = await self.repository.mileage_rows(filters, period, previous)
        return build_analysis(rows, distance, filters, period, previous, can_view_records)

    async def events(self, filters, *, station, offset):
        period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        facts = fuel_statement(filters, period.start_at, period.end_exclusive, station=station).subquery('fuel_events')
        count = (await self.db.execute(select(func.count()).select_from(facts))).scalar_one()
        rows = (await self.db.execute(select(facts).order_by(facts.c.supplied_at.desc(), facts.c.id).offset(offset).limit(100))).mappings().all()
        return FuelEvents(total_events=count, offset=offset, events=[DetailEvent(id=row['id'], source='fuel_supply',
            date=row['supplied_at'].astimezone(BAHIA).date().isoformat(),
            vehicle_id=row['vehicle_id'], plate=row['plate'], driver_id=None, driver_name=None,
            amount=str(row['total_amount']) if row['total_amount'] is not None else None,
            anomaly=bool(row['registered_flag']), status=None) for row in rows])
