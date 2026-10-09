from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.api.routes.analytics import analytics_organization_scope
from app.db.session import get_db_session
from app.models.user import User
from app.models.vehicle import VehicleType
from app.schemas.analytics_v2 import AnalyticsV2Filter, AnalyticsV2Summary
from app.services.analytics_v2_periods import equivalent_periods
from app.services.analytics_v2_service import AnalyticsV2Service
from app.services.analytics_v2_cockpit import AnalyticsV2Cockpit, FleetStatus, CockpitAttention
from app.services.analytics_v2_detail import AnalyticsV2DetailService, EntityDetail
from app.services.analytics_v2_costs import AnalyticsV2Costs, CostAnalysis, CostEvents, MileageEvents
from app.services.analytics_v2_fuel import AnalyticsV2Fuel, FuelAnalysis, FuelEvents

router = APIRouter(prefix="/api/analytics/v2", tags=["Análises V2"])


def common_filter(request: Request, date_from: date = Query(), date_to: date = Query(),
    organization: UUID | None = Query(default=None), vehicle_type: VehicleType | None = Query(default=None),
    vehicle_id: UUID | None = Query(default=None)) -> AnalyticsV2Filter:
    allowed = set(AnalyticsV2Filter.model_fields)
    if request.url.path.startswith('/api/analytics/v2/entities/'):
        allowed.add('offset')
    if request.url.path == '/api/analytics/v2/costs/events':
        allowed.update({'offset', 'source', 'organization_bucket', 'measured_only'})
    if request.url.path == '/api/analytics/v2/costs/mileage-events':
        allowed.add('offset')
    if request.url.path == '/api/analytics/v2/fuel/events':
        allowed.update({'offset', 'station'})
    unsupported = set(request.query_params) - allowed
    if unsupported:
        raise HTTPException(422, "Filtro não suportado: " + ", ".join(sorted(unsupported)))
    try:
        filters = AnalyticsV2Filter(date_from=date_from, date_to=date_to, organization=organization,
            vehicle_type=vehicle_type, vehicle_id=vehicle_id)
        equivalent_periods(date_from, date_to, now=datetime.now(timezone.utc))
        return filters
    except (ValueError, ValidationError) as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/summary", response_model=AnalyticsV2Summary)
async def summary(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Service(db).summary(scoped)


@router.get("/costs", response_model=CostAnalysis)
async def costs(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session), current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Costs(db).get(scoped)


@router.get("/fuel", response_model=FuelAnalysis)
async def fuel(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session), current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Fuel(db).get(scoped,
        can_view_records=bool(current_user.permissions.get("fuel_supplies", {}).get("can_view")))


@router.get("/fuel/events", response_model=FuelEvents, dependencies=[Depends(require_permission("fuel_supplies", "view"))])
async def fuel_events(response: Response, station: str | None = Query(default=None), offset: int = Query(default=0, ge=0),
    filters: AnalyticsV2Filter = Depends(common_filter), db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view"))):
    if station is not None:
        if station.startswith('id:'):
            try:
                station = f'id:{UUID(station[3:])}'
            except ValueError as exc:
                raise HTTPException(422, "Posto inválido") from exc
        elif station.startswith('name:') and 0 < len(station[5:]) <= 180 and station[5:] == station[5:].strip().lower():
            pass
        elif station != 'unknown':
            raise HTTPException(422, "Posto inválido")
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Fuel(db).events(scoped, station=station, offset=offset)


@router.get("/costs/events", response_model=CostEvents)
async def cost_events(response: Response, source: str | None = Query(default=None),
    organization_bucket: str | None = Query(default=None), offset: int = Query(default=0, ge=0),
    measured_only: bool = Query(default=False),
    filters: AnalyticsV2Filter = Depends(common_filter), db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view"))):
    if source is not None and source not in {'operational', 'fuel_supply', 'maintenance', 'fine', 'claim'}:
        raise HTTPException(422, "Fonte de custo não suportada")
    if organization_bucket is not None and organization_bucket != 'unattributed':
        try:
            organization_bucket = str(UUID(organization_bucket))
        except ValueError as exc:
            raise HTTPException(422, "Secretaria inválida") from exc
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    if scoped.organization is not None and organization_bucket is not None and organization_bucket != str(scoped.organization):
        raise HTTPException(422, "Secretaria fora do recorte")
    return await AnalyticsV2Costs(db).events(scoped, current_user.permissions, source=source,
        organization_bucket=organization_bucket, offset=offset, measured_only=measured_only)


@router.get("/costs/mileage-events", response_model=MileageEvents,
    dependencies=[Depends(require_permission("possession", "view"))])
async def cost_mileage_events(response: Response, offset: int = Query(default=0, ge=0),
    filters: AnalyticsV2Filter = Depends(common_filter), db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Costs(db).mileage_events(scoped, offset=offset)


@router.get("/fleet-status", response_model=FleetStatus)
async def fleet_status(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session), current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Cockpit(db).fleet(scoped)


@router.get("/attention", response_model=CockpitAttention)
async def attention(response: Response, filters: AnalyticsV2Filter = Depends(common_filter),
    db: AsyncSession = Depends(get_db_session), current_user: User = Depends(require_permission("analytics", "view"))):
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2Cockpit(db).attention(scoped)


@router.get("/entities/{entity_type}/{entity_id}", response_model=EntityDetail)
async def entity_detail(entity_type: str, entity_id: UUID, response: Response,
    offset: int = Query(default=0, ge=0), filters: AnalyticsV2Filter = Depends(common_filter), db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("analytics", "view"))):
    if entity_type not in {"vehicle", "driver"}:
        raise HTTPException(404, "Entidade analítica não disponível")
    if entity_type == "vehicle" and filters.vehicle_id is not None and filters.vehicle_id != entity_id:
        raise HTTPException(422, "vehicle_id diverge do veículo solicitado")
    response.headers["Cache-Control"] = "private, no-store"
    scoped = filters.model_copy(update={"organization": analytics_organization_scope(current_user, filters.organization)})
    return await AnalyticsV2DetailService(db).get(scoped, entity_type, entity_id, current_user.permissions, offset=offset)
