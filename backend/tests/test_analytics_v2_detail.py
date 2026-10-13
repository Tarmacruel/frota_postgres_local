from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import postgresql

from app.api.deps import get_current_user_ready
from app.api.routes.analytics_v2 import router
from app.db.session import get_db_session
from app.models.user import UserRole
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_v2_detail import AnalyticsV2DetailService, EntityDetail, event_statement
from app.services.analytics_v2_periods import equivalent_periods
from app.services.analytics_v2_service import totals


def test_detail_sql_uses_historical_scope_dates_entity_and_source_permissions():
    f = AnalyticsV2Filter(date_from="2026-09-01", date_to="2026-09-30", organization=uuid4(), vehicle_type="SEDAN", vehicle_id=uuid4())
    period, _ = equivalent_periods(f.date_from, f.date_to, now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    statement = event_statement(f, period, "driver", uuid4(), {"fuel_supply", "fine"})
    sql = str(statement.select().compile(dialect=postgresql.dialect()))
    assert "fuel_supplies" in sql and "fines" in sql
    assert "maintenance_records" not in sql and "claims" not in sql
    assert sql.count("location_history") >= 2
    assert "driver_id =" in sql and "vehicles.vehicle_type =" in sql
    assert "fuel_supplies.vehicle_id =" in sql and "fines.vehicle_id =" in sql
    assert "fines.infraction_date >=" in sql


@pytest.mark.asyncio
async def test_driver_without_current_events_opens_empty_context_but_fixed_scope_stays_closed():
    entity = uuid4()
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: "Condutor de teste")))
    service = AnalyticsV2DetailService(db)
    service.repository.summary_rows = AsyncMock(return_value=[])
    global_filters = AnalyticsV2Filter(date_from="2026-09-01", date_to="2026-09-30")
    result = await service.get(global_filters, "driver", entity, {})
    assert result.title == "Condutor de teste" and result.total_events == 0
    assert result.totals.operational_cost.value == 0
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: None)
    with pytest.raises(HTTPException) as denied:
        await service.get(global_filters.model_copy(update={"organization": uuid4()}), "driver", entity, {})
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_detail_route_keeps_analytics_permission_and_fixed_organization(monkeypatch):
    org, requested, entity = uuid4(), uuid4(), uuid4()
    captured = []
    async def stub(self, filters, entity_type, entity_id, permissions, *, offset=0):
        captured.append((filters.organization, entity_type, entity_id, permissions, offset))
        period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime(2026, 10, 8, tzinfo=timezone.utc))
        return EntityDetail(entity_type=entity_type, entity_id=entity_id, title="Teste", subtitle=None,
            period=period, totals=totals([]), total_events=0, events=[])
    monkeypatch.setattr(AnalyticsV2DetailService, "get", stub)
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=org,
        permissions={"fuel_supplies": {"can_view": True}})
    permission = SimpleNamespace(can_view=True, can_create=False, can_edit=False, can_delete=False)
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: permission)))
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    path = f"/api/analytics/v2/entities/vehicle/{entity}?date_from=2026-09-01&date_to=2026-09-30&organization={requested}"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(path)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    assert captured == [(org, "vehicle", entity, user.permissions, 0)]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get(path + "&offset=100")).status_code == 200
        assert (await client.get(path + f"&vehicle_id={uuid4()}")).status_code == 422
    assert captured[-1][-1] == 100
    permission.can_view = False
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        assert (await client.get(path)).status_code == 403
    assert len(captured) == 2
