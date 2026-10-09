from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import postgresql

from app.api.deps import get_current_user_ready
from app.api.routes.analytics_v2 import router
from app.db.session import get_db_session
from app.models.user import UserRole
from app.repositories.analytics_v2_repository import mileage_event_statement, summary_statement
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_v2_costs import AnalyticsV2Costs, CostEvents, MileageEvents
from app.services.analytics_v2_detail import event_statement
from app.services.analytics_v2_periods import equivalent_periods


def test_cost_sql_attributes_historical_organization_and_record_drilldown_uses_same_scope():
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30')
    period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    grouped = str(summary_statement(filters, period, previous, include_organization=True).compile(dialect=postgresql.dialect()))
    details = str(event_statement(filters, period, 'all', None, {'fuel_supply', 'fine'},
        source_filter='fine', organization_bucket='unattributed').select().compile(dialect=postgresql.dialect()))
    assert 'organization_id' in grouped and 'location_history' in grouped
    assert 'fines.infraction_date >=' in details and ' IS NULL' in details
    assert 'fuel_supplies' not in details and 'claims' not in details


def test_mileage_source_records_use_the_grouped_km_eligibility_and_scope():
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30', organization=uuid4(), vehicle_id=uuid4())
    period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    sql = str(mileage_event_statement(filters, period).compile(dialect=postgresql.dialect()))
    assert 'vehicle_possession.end_date <= ' in sql
    assert 'vehicle_possession.end_odometer_km < ' in sql
    assert 'NOT (EXISTS' in sql
    assert 'responsible_organization_id' in sql and 'location_history' in sql
    assert 'vehicles.vehicle_type' not in sql and 'vehicle_possession.vehicle_id = ' in sql


@pytest.mark.asyncio
async def test_costs_separate_estimates_missing_values_and_measured_vehicle_numerator():
    vehicle, org = uuid4(), uuid4()
    rows = [
        dict(period='current', month='2026-09', source='fuel', vehicle_id=vehicle, organization_id=org,
            driver_id=None, status='', records=1, known_amounts=1, amount=Decimal('100'), known_liters=1, liters=Decimal('20'), anomalies=0),
        dict(period='current', month='2026-09', source='fines', vehicle_id=vehicle, organization_id=org,
            driver_id=None, status='PENDENTE', records=1, known_amounts=0, amount=None, known_liters=1, liters=0, anomalies=0),
        dict(period='current', month='2026-09', source='claim_estimate', vehicle_id=vehicle, organization_id=org,
            driver_id=None, status='', records=1, known_amounts=1, amount=Decimal('900'), known_liters=1, liters=0, anomalies=0),
    ]
    db = SimpleNamespace(execute=AsyncMock(side_effect=[SimpleNamespace(all=lambda: [(vehicle, 'ABC1D23')]),
        SimpleNamespace(all=lambda: [(org, 'Secretaria teste')])]))
    service = AnalyticsV2Costs(db)
    service.repository.cost_rows = AsyncMock(return_value=rows)
    service.repository.mileage_rows = AsyncMock(return_value=[dict(period='current', vehicle_id=vehicle, valid_records=1,
        records=1, distance_km=Decimal('50'), crossing_records=0, overlapping_records=0)])
    result = await service.get(AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30'))
    assert result.totals.operational_cost.value is None
    assert result.totals.operational_cost.known_value == 100
    assert result.totals.claim_estimate.value == 900
    assert result.cost_per_km is None
    assert result.measured_distance_km == 50
    assert result.organizations[0].name == 'Secretaria teste'
    assert result.vehicles[0].plate == 'ABC1D23'


@pytest.mark.asyncio
async def test_cost_events_route_preserves_permission_scope_and_rejects_other_bucket(monkeypatch):
    org = uuid4()
    captured = []
    async def stub(self, filters, permissions, *, source, organization_bucket, offset, measured_only):
        captured.append((filters.organization, source, organization_bucket, offset, measured_only, permissions))
        return CostEvents(total_events=0, events=[], offset=offset)
    monkeypatch.setattr(AnalyticsV2Costs, 'events', stub)
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=org,
        permissions={'fuel_supplies': {'can_view': True}})
    permission = SimpleNamespace(can_view=True, can_create=False, can_edit=False, can_delete=False)
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: permission)))
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    path = '/api/analytics/v2/costs/events?date_from=2026-09-01&date_to=2026-09-30&source=fuel_supply'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get(path + f'&organization_bucket={org}&offset=100')
        denied = await client.get(path + f'&organization_bucket={uuid4()}')
        invalid = await client.get(path + '&source=made_up')
        permission.can_view = False
        forbidden = await client.get(path)
    assert response.status_code == 200 and response.headers['cache-control'] == 'private, no-store'
    assert captured == [(org, 'fuel_supply', str(org), 100, False, user.permissions)]
    assert denied.status_code == 422 and invalid.status_code == 422 and forbidden.status_code == 403


@pytest.mark.asyncio
async def test_mileage_events_require_possession_read_and_preserve_organization(monkeypatch):
    org = uuid4()
    seen = []
    async def stub(self, filters, *, offset):
        seen.append((filters.organization, offset))
        return MileageEvents(total_events=0, total_distance_km=0, events=[], offset=offset)
    monkeypatch.setattr(AnalyticsV2Costs, 'mileage_events', stub)
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=org, permissions={})
    can_read_possession = True
    async def permission_result(statement):
        module = next((value for value in statement.compile().params.values() if value in {'analytics', 'possession'}), None)
        allowed = module != 'possession' or can_read_possession
        permission = SimpleNamespace(can_view=allowed, can_create=False, can_edit=False, can_delete=False)
        return SimpleNamespace(scalar_one_or_none=lambda: permission)
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: SimpleNamespace(execute=permission_result)
    path = '/api/analytics/v2/costs/mileage-events?date_from=2026-09-01&date_to=2026-09-30'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get(path + '&offset=100')
        can_read_possession = False
        denied = await client.get(path)
    assert response.status_code == 200 and response.headers['cache-control'] == 'private, no-store'
    assert response.json()['total_distance_km'] == '0'
    assert seen == [(org, 100)]
    assert denied.status_code == 403
