"""Read-only cost breakdown using the approved V2 event and mileage rules."""
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import func, select

from app.models.master_data import Organization
from app.models.vehicle import Vehicle
from app.repositories.analytics_v2_repository import AnalyticsV2Repository, mileage_event_statement, mileage_statement
from app.schemas.analytics_v2 import AnalyticsV2Amount, AnalyticsV2Filter, AnalyticsV2Period, AnalyticsV2Totals
from app.services.analytics_v2_periods import calendar_months, equivalent_periods
from app.services.analytics_v2_service import mileage_metrics, totals
from app.services.analytics_v2_detail import DetailEvent, SOURCE_MODULES, event_statement


class CostEvents(BaseModel):
    total_events: int
    events: list[DetailEvent]
    offset: int
    limit: int = 100


class MileageEvent(BaseModel):
    id: UUID
    public_number: int
    vehicle_id: UUID
    plate: str
    start_date: datetime
    end_date: datetime
    start_odometer_km: Decimal
    end_odometer_km: Decimal
    distance_km: Decimal


class MileageEvents(BaseModel):
    total_events: int
    total_distance_km: Decimal
    events: list[MileageEvent]
    offset: int
    limit: int = 100


class CostVehicle(BaseModel):
    vehicle_id: UUID
    plate: str
    totals: AnalyticsV2Totals
    distance_km: Decimal | None
    cost_per_km: Decimal | None


class CostOrganization(BaseModel):
    organization_id: UUID | None
    name: str
    totals: AnalyticsV2Totals
    vehicle_count: int


class CostMonth(BaseModel):
    month: str
    totals: AnalyticsV2Totals


class CostAnalysis(BaseModel):
    filters: AnalyticsV2Filter
    period: AnalyticsV2Period
    totals: AnalyticsV2Totals
    measured_cost: AnalyticsV2Amount
    measured_distance_km: Decimal | None
    cost_per_km: Decimal | None
    measured_vehicles: int
    monthly: list[CostMonth]
    vehicles: list[CostVehicle]
    organizations: list[CostOrganization]
    methodology: dict[str, str]


class AnalyticsV2Costs:
    def __init__(self, db):
        self.db = db
        self.repository = AnalyticsV2Repository(db)

    async def get(self, filters: AnalyticsV2Filter):
        period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        rows = [row for row in await self.repository.cost_rows(filters, period, previous) if row['period'] == 'current']
        distance_rows = [row for row in await self.repository.mileage_rows(filters, period, previous) if row['period'] == 'current']
        measured, metrics = mileage_metrics(rows, distance_rows)
        vehicle_ids = {row['vehicle_id'] for row in rows}
        organization_ids = {row['organization_id'] for row in rows if row['organization_id'] is not None}
        plates = dict((await self.db.execute(select(Vehicle.id, Vehicle.plate).where(Vehicle.id.in_(vehicle_ids)))).all()) if vehicle_ids else {}
        names = dict((await self.db.execute(select(Organization.id, Organization.name).where(Organization.id.in_(organization_ids)))).all()) if organization_ids else {}
        by_vehicle, by_organization = defaultdict(list), defaultdict(list)
        for row in rows:
            by_vehicle[row['vehicle_id']].append(row)
            by_organization[row['organization_id']].append(row)
        distances = {row['vehicle_id']: Decimal(str(row['distance_km'])) for row in distance_rows if row['valid_records'] > 0}
        vehicles = []
        for vehicle_id, items in by_vehicle.items():
            amount = totals(items)
            km = distances.get(vehicle_id)
            vehicles.append(CostVehicle(vehicle_id=vehicle_id, plate=plates.get(vehicle_id, str(vehicle_id)), totals=amount,
                distance_km=km, cost_per_km=amount.operational_cost.value / km if km and amount.operational_cost.value is not None else None))
        organizations = [CostOrganization(organization_id=organization_id,
            name=names.get(organization_id, 'Sem secretaria atribuída' if organization_id is None else str(organization_id)),
            totals=totals(items), vehicle_count=len({row['vehicle_id'] for row in items}))
            for organization_id, items in by_organization.items()]
        return CostAnalysis(filters=filters, period=period, totals=totals(rows),
            measured_cost=totals([row for row in rows if row['vehicle_id'] in distances]).operational_cost,
            measured_distance_km=measured.distance_km, cost_per_km=metrics['operational_cost_per_km'][0],
            measured_vehicles=measured.vehicles_with_valid_distance,
            monthly=[CostMonth(month=month, totals=totals([row for row in rows if row['month'] == month]))
                for month, _, _ in calendar_months(filters.date_from, filters.date_to)],
            vehicles=sorted(vehicles, key=lambda item: (-item.totals.operational_cost.known_value, item.plate)),
            organizations=sorted(organizations, key=lambda item: (-item.totals.operational_cost.known_value, item.name)),
            methodology={
                'cost': 'Combustível por abastecimento + manutenção pela data de início + multas pela data da infração, de todos os status. Valores registrados; não comprovam pagamento ou liquidação e não compõem TCO completo.',
                'claims': 'Estimativas de sinistros são exibidas separadamente e não integram custo operacional.',
                'missing': 'Valor ausente ou inválido torna o total completo indisponível; subtotal conhecido é mostrado sem imputação.',
                'organization': 'Responsabilidade explícita no evento ou lotação histórica não ambígua. Eventos sem atribuição aparecem em grupo próprio no escopo global.',
                'mileage': 'Custo/km usa somente veículos com posses encerradas válidas e inteiramente contidas no período; numerador e denominador usam os mesmos veículos.',
            })

    async def events(self, filters: AnalyticsV2Filter, permissions: dict, *, source: str | None,
        organization_bucket: str | None, offset: int, measured_only: bool = False):
        period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        allowed = {item for item, module in SOURCE_MODULES.items() if permissions.get(module, {}).get('can_view')}
        measured = None
        if measured_only:
            distance = mileage_statement(filters, period, previous).subquery('cost_measured_distance')
            measured = select(distance.c.vehicle_id).where(distance.c.period == 'current', distance.c.valid_records > 0)
        facts = event_statement(filters, period, 'all', None, allowed, source_filter=source,
            organization_bucket=organization_bucket, measured_vehicle_ids=measured)
        if facts is None:
            return CostEvents(total_events=0, events=[], offset=offset)
        count = (await self.db.execute(select(func.count()).select_from(facts))).scalar_one()
        rows = (await self.db.execute(select(facts).order_by(facts.c.date.desc(), facts.c.id).offset(offset).limit(100))).mappings().all()
        return CostEvents(total_events=count, offset=offset, events=[DetailEvent(
            id=row['id'], source=row['source'], date=row['date'].isoformat(), vehicle_id=row['vehicle_id'],
            plate=row['plate'], driver_id=row['driver_id'], driver_name=row['driver_name'],
            amount=str(row['amount']) if row['amount'] is not None else None,
            anomaly=bool(row['anomaly']), status=row['status']) for row in rows])

    async def mileage_events(self, filters: AnalyticsV2Filter, *, offset: int):
        period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        facts = mileage_event_statement(filters, period).subquery('cost_mileage_events')
        count, distance = (await self.db.execute(select(func.count(), func.sum(facts.c.distance_km)))).one()
        rows = (await self.db.execute(select(facts).order_by(facts.c.start_date.desc(), facts.c.id)
            .offset(offset).limit(100))).mappings().all()
        return MileageEvents(total_events=count, total_distance_km=distance or Decimal(0), offset=offset,
            events=[MileageEvent.model_validate(row) for row in rows])
