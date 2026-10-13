"""Read-only executive context, reusing the V2 event aggregation and scope."""
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy import func, select

from app.models.vehicle import Vehicle, VehicleStatus
from app.repositories.analytics_v2_repository import AnalyticsV2Repository
from app.repositories.vehicle_scope import current_operator
from app.schemas.analytics_v2 import AnalyticsV2Comparison, AnalyticsV2Filter
from app.services.analytics_v2_periods import compare, equivalent_periods
from app.services.analytics_v2_service import totals


class FleetStatus(BaseModel):
    observed_at: datetime
    counts: dict[str, int]
    total: int
    basis: str = "Status cadastral atual; secretaria pela lotação operadora atual. Não representa disponibilidade histórica."


class AttentionVehicle(BaseModel):
    vehicle_id: UUID
    plate: str
    vehicle_type: str
    current_cost: Decimal | None
    comparison: AnalyticsV2Comparison
    anomalies: int


class CockpitAttention(BaseModel):
    items: list[AttentionVehicle]
    total_attention_vehicles: int
    anomaly_records: int
    anomaly_vehicles: int
    basis: str = "Anomalias registradas primeiro; depois maior aumento absoluto de custo. Até 8 veículos. Variação não comprova causa."
    alert_basis: str = "Flags de anomalia de consumo já registradas nos abastecimentos. Não são alertas com atendimento ou resolução."


class AnalyticsV2Cockpit:
    def __init__(self, db):
        self.db = db
        self.repository = AnalyticsV2Repository(db)

    async def fleet(self, filters: AnalyticsV2Filter):
        query = select(Vehicle.status, func.count()).group_by(Vehicle.status)
        if filters.organization is not None:
            query = query.where(current_operator(Vehicle.id, filters.organization))
        if filters.vehicle_type is not None:
            query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
        if filters.vehicle_id is not None:
            query = query.where(Vehicle.id == filters.vehicle_id)
        rows = (await self.db.execute(query)).all()
        counts = {status.value: 0 for status in VehicleStatus}
        counts.update({str(getattr(status, 'value', status)): count for status, count in rows})
        return FleetStatus(observed_at=datetime.now(timezone.utc), counts=counts, total=sum(counts.values()))

    async def attention(self, filters: AnalyticsV2Filter):
        current, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        rows = await self.repository.summary_rows(filters, current, previous)
        by_vehicle = {}
        for row in rows:
            by_vehicle.setdefault(row['vehicle_id'], []).append(row)
        candidates = []
        anomaly_records = anomaly_vehicles = 0
        for vehicle, records in by_vehicle.items():
            current_rows = [row for row in records if row['period'] == 'current']
            previous_rows = [row for row in records if row['period'] == 'previous']
            now_cost = totals(current_rows).operational_cost.value
            prior_cost = totals(previous_rows).operational_cost.value
            comparison = compare(now_cost, prior_cost)
            anomalies = sum(row['anomalies'] for row in current_rows if row['source'] == 'fuel')
            anomaly_records += anomalies
            anomaly_vehicles += int(anomalies > 0)
            if anomalies or (comparison.delta is not None and comparison.delta > 0):
                candidates.append(dict(vehicle_id=vehicle, current_cost=now_cost, comparison=comparison, anomalies=anomalies))
        candidates.sort(key=lambda item: (-item['anomalies'], -(item['comparison'].delta or 0), str(item['vehicle_id'])))
        selected = candidates[:8]
        identities = {}
        if selected:
            identities = {row.id: row for row in (await self.db.execute(select(Vehicle.id, Vehicle.plate, Vehicle.vehicle_type)
                .where(Vehicle.id.in_([item['vehicle_id'] for item in selected])))).all()}
        items = [AttentionVehicle(**item, plate=identities[item['vehicle_id']].plate,
            vehicle_type=identities[item['vehicle_id']].vehicle_type.value) for item in selected if item['vehicle_id'] in identities]
        return CockpitAttention(items=items, total_attention_vehicles=len(candidates),
            anomaly_records=anomaly_records, anomaly_vehicles=anomaly_vehicles)
