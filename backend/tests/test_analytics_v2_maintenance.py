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
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_v2_maintenance import AnalyticsV2Maintenance, MaintenanceEvents, maintenance_statement
from app.services.analytics_v2_periods import equivalent_periods


def test_maintenance_query_uses_start_cohort_and_historical_scope():
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30', organization=uuid4(), vehicle_id=uuid4())
    period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    sql = str(maintenance_statement(filters, period).compile(dialect=postgresql.dialect()))
    assert 'maintenance_records.start_date >=' in sql and 'maintenance_records.start_date <' in sql
    assert 'maintenance_records.end_date >= maintenance_records.start_date' in sql
    assert 'responsible_organization_id' in sql and 'location_history' in sql
    assert 'maintenance_records.vehicle_id =' in sql
    assert 'service_description' not in sql


@pytest.mark.asyncio
async def test_maintenance_aggregates_valid_duration_open_repetition_and_measured_cost():
    measured, unmeasured, no_maintenance = uuid4(), uuid4(), uuid4()
    rows = [
        dict(vehicle_id=measured, plate='ABC1D23', records=2, known=2, cost=Decimal('100'),
            open_count=1, duration_count=1, duration_seconds=Decimal('7200')),
        dict(vehicle_id=unmeasured, plate='XYZ9A87', records=1, known=1, cost=Decimal('50'),
            open_count=0, duration_count=0, duration_seconds=None),
    ]
    result = SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: rows))
    db = SimpleNamespace(execute=AsyncMock(return_value=result))
    service = AnalyticsV2Maintenance(db)
    service.repository.mileage_rows = AsyncMock(return_value=[
        dict(period='current', vehicle_id=measured, valid_records=1, distance_km=Decimal('20')),
        dict(period='current', vehicle_id=no_maintenance, valid_records=1, distance_km=Decimal('30')),
    ])
    data = await service.get(AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30'))
    assert data.cost.value == 150 and data.interventions == 3
    assert data.open_interventions == 1 and data.repeated_vehicles == 1
    assert data.valid_duration_count == 1 and data.invalid_duration_count == 1
    assert data.average_duration_hours == 2
    assert data.measured_cost.value == 100 and data.measured_distance_km == 50
    assert data.measured_vehicles == 2 and data.cost_per_km == 2
    assert data.vehicles[0].cost_per_km == 5
    assert data.vehicles[1].cost_per_km is None


@pytest.mark.asyncio
async def test_maintenance_events_require_domain_permission_and_keep_scope(monkeypatch):
    org = uuid4()
    seen = []
    async def stub(self, filters, *, subset, offset):
        seen.append((filters.organization, subset, offset))
        return MaintenanceEvents(total_events=0, events=[], offset=offset)
    monkeypatch.setattr(AnalyticsV2Maintenance, 'events', stub)
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=org, permissions={})
    can_read = True

    async def permission_result(statement):
        module = next((value for value in statement.compile().params.values() if value in {'analytics', 'maintenance'}), None)
        permission = SimpleNamespace(can_view=(module != 'maintenance' or can_read),
            can_create=False, can_edit=False, can_delete=False)
        return SimpleNamespace(scalar_one_or_none=lambda: permission)
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: SimpleNamespace(execute=permission_result)
    path = '/api/analytics/v2/maintenance/events?date_from=2026-09-01&date_to=2026-09-30'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get(path + '&subset=repeated&offset=100')
        invalid = await client.get(path + '&subset=preventive')
        can_read = False
        denied = await client.get(path)
    assert response.status_code == 200 and response.headers['cache-control'] == 'private, no-store'
    assert seen == [(org, 'repeated', 100)]
    assert invalid.status_code == 422 and denied.status_code == 403
