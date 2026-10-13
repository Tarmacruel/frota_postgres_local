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
from app.services.analytics_v2_periods import equivalent_periods
from app.services.analytics_v2_utilization import AnalyticsV2Utilization, UtilizationEvents, possession_statement


def test_possession_sql_keeps_valid_km_duration_and_historical_scope_separate():
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30', organization=uuid4())
    period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    sql = str(possession_statement(filters, period).compile(dialect=postgresql.dialect()))
    assert 'vehicle_possession.start_date <' in sql
    assert 'vehicle_possession.end_date <= ' in sql
    assert 'vehicle_possession.end_odometer_km < ' in sql
    assert 'NOT (EXISTS' in sql
    assert 'responsible_organization_id' in sql and 'location_history' in sql
    assert 'master_departments.organization_id' in sql


@pytest.mark.asyncio
async def test_utilization_aggregates_observable_events_without_inventing_a_rate():
    active, unseen, measured = uuid4(), uuid4(), uuid4()
    roster = [dict(id=active, plate='AAA1A11', status='ATIVO', organization_id=None),
        dict(id=unseen, plate='BBB2B22', status='MANUTENCAO', organization_id=None),
        dict(id=measured, plate='CCC3C33', status='INATIVO', organization_id=None)]
    observations = [dict(vehicle_id=active, started=1, ended=0, duration_count=0,
        duration_seconds=None, km_count=0, distance_km=None,
        last_event=datetime(2026, 9, 10, tzinfo=timezone.utc)),
        dict(vehicle_id=measured, started=1, ended=1, duration_count=1,
        duration_seconds=Decimal('7200'), km_count=1, distance_km=Decimal('100'),
        last_event=datetime(2026, 9, 12, tzinfo=timezone.utc))]
    results = [SimpleNamespace(mappings=lambda rows=rows: SimpleNamespace(all=lambda: rows))
        for rows in (roster, observations)]
    results.append(SimpleNamespace(all=lambda: [(unseen, 1)]))
    db = SimpleNamespace(execute=AsyncMock(side_effect=results))
    data = await AnalyticsV2Utilization(db).get(AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30'))
    assert data.roster_vehicles == 3 and data.started == 2 and data.ended == 1
    assert data.valid_duration_count == 1 and data.duration_hours == 2
    assert data.valid_km_count == 1 and data.distance_km == 100
    assert data.km_per_valid_closed_possession == 100
    assert data.without_possession_event == 1
    assert data.status_counts == {'ATIVO': 1, 'MANUTENCAO': 1, 'INATIVO': 1}
    assert data.vehicles_with_open_maintenance == 1 and data.open_maintenance_records == 1
    assert data.vehicles[1].days_since_last_event is None
    assert 'taxa de utilização' not in str(data.model_dump()).lower()


@pytest.mark.asyncio
async def test_utilization_event_route_requires_possession_read_and_scopes_history(monkeypatch):
    org = uuid4()
    vehicle = uuid4()
    seen = []
    async def stub(self, filters, *, mode, offset):
        seen.append((filters.organization, filters.vehicle_id, mode, offset))
        return UtilizationEvents(total_events=0, events=[], offset=offset)
    monkeypatch.setattr(AnalyticsV2Utilization, 'events', stub)
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=org, permissions={})
    can_read = True
    async def permission_result(statement):
        module = next((value for value in statement.compile().params.values() if value in {'analytics', 'possession'}), None)
        permission = SimpleNamespace(can_view=(module != 'possession' or can_read),
            can_create=False, can_edit=False, can_delete=False)
        return SimpleNamespace(scalar_one_or_none=lambda: permission)
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: SimpleNamespace(execute=permission_result)
    path = '/api/analytics/v2/utilization/events?date_from=2026-09-01&date_to=2026-09-30'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get(path + f'&vehicle_id={vehicle}&mode=history&offset=100')
        invalid = await client.get(path + '&mode=history')
        can_read = False
        denied = await client.get(path)
    assert response.status_code == 200 and response.headers['cache-control'] == 'private, no-store'
    assert seen == [(org, vehicle, 'history', 100)]
    assert invalid.status_code == 422 and denied.status_code == 403
