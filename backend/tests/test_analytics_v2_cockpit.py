from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.dialects import postgresql

from app.models.user import UserRole
from app.models.vehicle import VehicleStatus, VehicleType
from app.services.analytics_v2_cockpit import AnalyticsV2Cockpit, FleetStatus, CockpitAttention
from test_analytics_v2 import filters, row, route_app


@pytest.mark.asyncio
async def test_attention_orders_observed_anomalies_then_increase_and_excludes_unknown_delta():
    ids = [uuid4() for _ in range(4)]
    records = [row(vehicle_id=ids[0], amount=Decimal(300)), row(vehicle_id=ids[0], period='previous', amount=Decimal(100)),
        row(vehicle_id=ids[1], anomalies=2), row(vehicle_id=ids[2], amount=None, known_amounts=0),
        row(vehicle_id=ids[3], amount=Decimal(5)), row(vehicle_id=ids[3], period='previous', amount=Decimal(10))]
    identities = [SimpleNamespace(id=id_, plate=f'QA{i}', vehicle_type=VehicleType.HATCH) for i, id_ in enumerate(ids)]
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: identities)))
    service = AnalyticsV2Cockpit(db)
    service.repository.summary_rows = AsyncMock(return_value=records)
    result = await service.attention(filters())
    assert [item.vehicle_id for item in result.items] == [ids[1], ids[0]]
    assert result.items[1].comparison.delta == 200
    assert result.anomaly_records == 2 and result.anomaly_vehicles == 1
    assert result.total_attention_vehicles == 2
    assert db.execute.await_count == 1


@pytest.mark.asyncio
async def test_attention_limit_and_empty_no_identity_query():
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [])))
    service = AnalyticsV2Cockpit(db)
    service.repository.summary_rows = AsyncMock(return_value=[])
    assert (await service.attention(filters())).items == []
    db.execute.assert_not_called()
    service.repository.summary_rows.return_value = [row(vehicle_id=uuid4()) for _ in range(12)]
    result = await service.attention(filters())
    assert result.total_attention_vehicles == 12
    # IDs are selected in one bounded query, never fetched one by one.
    statement = db.execute.call_args.args[0]
    assert len(statement.compile().params['id_1']) == 8


@pytest.mark.asyncio
async def test_fleet_uses_current_operator_and_validated_type():
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(all=lambda: [(VehicleStatus.ATIVO, 4), (VehicleStatus.MANUTENCAO, 1)])))
    result = await AnalyticsV2Cockpit(db).fleet(filters(organization=uuid4(), vehicle_type='SEDAN'))
    assert result.total == 5 and result.counts['INATIVO'] == 0
    sql = str(db.execute.call_args.args[0].compile(dialect=postgresql.dialect()))
    assert 'end_date IS NULL' in sql and 'organization_id =' in sql
    assert 'vehicles.vehicle_type =' in sql and 'GROUP BY' in sql


@pytest.mark.asyncio
@pytest.mark.parametrize('endpoint', ['attention', 'fleet-status'])
async def test_cockpit_routes_permissions_and_fixed_organization(monkeypatch, endpoint):
    org = uuid4()
    captured = []
    async def stub(self, f):
        captured.append(f.organization)
        if endpoint == 'attention':
            return CockpitAttention(items=[], total_attention_vehicles=0, anomaly_records=0, anomaly_vehicles=0)
        from datetime import datetime, timezone
        return FleetStatus(observed_at=datetime.now(timezone.utc), counts={}, total=0)
    monkeypatch.setattr(AnalyticsV2Cockpit, 'attention' if endpoint == 'attention' else 'fleet', stub)
    path = f'/api/analytics/v2/{endpoint}?date_from=2026-09-01&date_to=2026-09-30&organization={uuid4()}'
    async with AsyncClient(transport=ASGITransport(app=route_app(UserRole.PRODUCAO, org)), base_url='http://test') as client:
        response = await client.get(path)
        assert response.status_code == 200
        assert response.headers['cache-control'] == 'private, no-store'
    assert captured == [org]
    async with AsyncClient(transport=ASGITransport(app=route_app(allowed=False)), base_url='http://test') as client:
        assert (await client.get(path)).status_code == 403
