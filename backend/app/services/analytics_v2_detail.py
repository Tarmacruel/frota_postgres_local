"""Scoped, read-only entity drilldown over the same V2 event sources."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import Date, Numeric, String, case, cast, func, literal, select, union_all
from sqlalchemy.dialects.postgresql import UUID as PGUUID

from app.models.claim import Claim
from app.models.driver import Driver
from app.models.fine import Fine
from app.models.fuel_supply import FuelSupply
from app.models.maintenance import MaintenanceRecord
from app.models.vehicle import Vehicle
from app.repositories.analytics_v2_repository import AnalyticsV2Repository
from app.repositories.vehicle_scope import current_operator, fine_occurred_at, historical_organization, responsible_to
from app.schemas.analytics_v2 import AnalyticsV2Filter, AnalyticsV2Period, AnalyticsV2Totals
from app.services.analytics_v2_periods import equivalent_periods
from app.services.analytics_v2_service import driver_risk, totals

SOURCE_MODULES = {
    "fuel_supply": "fuel_supplies", "maintenance": "maintenance",
    "fine": "fines", "claim": "claims",
}
SOURCE_MODELS = (
    ("fuel_supply", FuelSupply, FuelSupply.supplied_at, FuelSupply.total_amount),
    ("maintenance", MaintenanceRecord, MaintenanceRecord.start_date, MaintenanceRecord.total_cost),
    ("fine", Fine, fine_occurred_at(Fine), Fine.amount),
    ("claim", Claim, Claim.data_ocorrencia, Claim.valor_estimado),
)


class DetailEvent(BaseModel):
    id: UUID
    source: str
    date: str
    vehicle_id: UUID
    plate: str
    driver_id: UUID | None
    driver_name: str | None
    amount: str | None
    anomaly: bool
    status: str | None


class EntityDetail(BaseModel):
    entity_type: str
    entity_id: UUID
    title: str
    subtitle: str | None
    period: AnalyticsV2Period
    totals: AnalyticsV2Totals
    risk_score: str | None = None
    total_events: int
    events: list[DetailEvent]
    event_offset: int = 0
    timeline_limit: int = 100
    methodology: str = "Valores registrados no recorte; combustível + manutenção por início + multas de todos os status. Sinistros estimados ficam separados. Dados ausentes não são imputados."


def event_statement(filters: AnalyticsV2Filter, period: AnalyticsV2Period, entity_type: str, entity_id: UUID | None,
    allowed_sources: set[str], *, source_filter: str | None = None, organization_bucket: str | None = None,
    measured_vehicle_ids=None):
    queries = []
    for source, model, instant, amount in SOURCE_MODELS:
        if source not in allowed_sources or (source_filter == 'operational' and source == 'claim') or (source_filter not in (None, 'operational') and source != source_filter):
            continue
        driver_id = model.driver_id if hasattr(model, "driver_id") else literal(None)
        day = model.infraction_date if model is Fine else cast(func.timezone("America/Bahia", instant), Date)
        query = select(model.id.label("id"), literal(source).label("source"), day.label("date"),
            model.vehicle_id.label("vehicle_id"), Vehicle.plate.label("plate"),
            driver_id.label("driver_id"),
            (Driver.nome_completo if hasattr(model, "driver_id") else literal(None)).label("driver_name"),
            cast(amount, Numeric).label("amount"),
            (FuelSupply.is_consumption_anomaly if model is FuelSupply else literal(False)).label("anomaly"),
            (cast(Fine.status, String) if model is Fine else literal(None)).label("status"),
        ).select_from(model).join(Vehicle, Vehicle.id == model.vehicle_id)
        if hasattr(model, "driver_id"):
            query = query.outerjoin(Driver, Driver.id == model.driver_id)
        if model is Fine:
            query = query.where(day >= period.date_from, day <= period.date_to)
        else:
            query = query.where(instant >= period.start_at, instant < period.end_exclusive)
        if filters.organization is not None:
            query = query.where(responsible_to(model, instant, filters.organization))
        if filters.vehicle_type is not None:
            query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
        if filters.vehicle_id is not None:
            query = query.where(model.vehicle_id == filters.vehicle_id)
        if measured_vehicle_ids is not None:
            query = query.where(model.vehicle_id.in_(measured_vehicle_ids))
        if organization_bucket is not None:
            field = getattr(model, 'responsible_organization_id', None)
            if field is None:
                field = model.organization_id
            period_end = None
            if model is Fine:
                from sqlalchemy import text
                period_end = case((model.infraction_time.is_(None), instant + text("INTERVAL '1 day' - INTERVAL '1 microsecond'")), else_=instant)
            attributed = func.coalesce(field, cast(historical_organization(model.vehicle_id, instant, period_end), PGUUID(as_uuid=True)))
            query = query.where(attributed.is_(None) if organization_bucket == 'unattributed' else attributed == UUID(organization_bucket))
        if entity_type == 'vehicle':
            query = query.where(model.vehicle_id == entity_id)
        elif entity_type == 'driver':
            query = query.where(driver_id == entity_id)
        queries.append(query)
    return union_all(*queries).subquery("detail_events") if queries else None


class AnalyticsV2DetailService:
    def __init__(self, db):
        self.db = db
        self.repository = AnalyticsV2Repository(db)

    async def get(self, filters: AnalyticsV2Filter, entity_type: str, entity_id: UUID, permissions: dict, *, offset: int = 0):
        current, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        scoped = filters.model_copy(update={"vehicle_id": entity_id}) if entity_type == "vehicle" else filters
        rows = await self.repository.summary_rows(scoped, current, previous)
        if entity_type == "driver":
            rows = [row for row in rows if row["driver_id"] == entity_id]
        current_rows = [row for row in rows if row["period"] == "current"]
        if not rows and filters.organization is not None:
            identity_scope = (select(Vehicle.id).where(Vehicle.id == entity_id,
                current_operator(Vehicle.id, filters.organization)) if entity_type == "vehicle"
                else select(Driver.id).where(Driver.id == entity_id, Driver.organization_id == filters.organization))
            if (await self.db.execute(identity_scope)).scalar_one_or_none() is None:
                raise HTTPException(404, "Entidade fora do recorte autorizado")
        allowed = {source for source, module in SOURCE_MODULES.items() if permissions.get(module, {}).get("can_view")}
        events = event_statement(filters, current, entity_type, entity_id, allowed)
        # Analytics may be visible while individual source modules are not.
        total_events = (await self.db.execute(select(func.count()).select_from(events))).scalar_one() if events is not None else 0
        records = (await self.db.execute(select(events).order_by(events.c.date.desc(), events.c.id).offset(offset).limit(100))).mappings().all() if total_events else []
        if entity_type == "vehicle":
            identity = (await self.db.execute(select(Vehicle.plate, Vehicle.brand, Vehicle.model).where(Vehicle.id == entity_id))).one_or_none()
            if identity is None:
                raise HTTPException(404, "Veículo não encontrado")
            title = identity.plate if identity else "Veículo"
            subtitle = f"{identity.brand} {identity.model}" if identity else None
            risk_score = None
        else:
            identity = (await self.db.execute(select(Driver.nome_completo).where(Driver.id == entity_id))).scalar_one_or_none()
            if identity is None:
                raise HTTPException(404, "Condutor não encontrado")
            title, subtitle = identity or "Condutor", None
            risk = driver_risk(current_rows)
            risk_score = str(risk[0].score) if risk else None
        return EntityDetail(entity_type=entity_type, entity_id=entity_id, title=title, subtitle=subtitle,
            period=current, totals=totals(current_rows), risk_score=risk_score, total_events=total_events, event_offset=offset,
            events=[DetailEvent(id=row["id"], source=row["source"], date=row["date"].isoformat(),
                vehicle_id=row["vehicle_id"], plate=row["plate"], driver_id=row["driver_id"],
                driver_name=row["driver_name"], amount=str(row["amount"]) if row["amount"] is not None else None,
                anomaly=bool(row["anomaly"]), status=row["status"]) for row in records])
