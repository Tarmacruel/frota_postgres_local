from datetime import datetime, timedelta, timezone
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
from app.services.analytics_v2_fuel import AnalyticsV2Fuel, FuelEvents, build_analysis, detect_anomalies, fuel_statement, fuel_totals
from app.services.analytics_v2_periods import equivalent_periods


NOW = datetime(2026, 10, 8, tzinfo=timezone.utc)
FILTERS = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30')
PERIOD, PREVIOUS = equivalent_periods(FILTERS.date_from, FILTERS.date_to, now=NOW)


def supply(index, *, vehicle=None, when=None, odometer=None, liters=10, amount=50, capacity=50, fuel_type='DIESEL', station=None):
    return dict(id=uuid4(), vehicle_id=vehicle or uuid4(), plate='ABC1D23', vehicle_type='SEDAN',
        tank_capacity_liters=capacity, supplied_at=when or datetime(2026, 9, 2, 12, tzinfo=timezone.utc) + timedelta(days=index * 2),
        odometer_km=odometer if odometer is not None else 1000 + index * 100, liters=liters,
        total_amount=Decimal(str(amount)) if amount is not None else None, fuel_type=fuel_type,
        station_id=station or uuid4(), station_text=None, station_name='Posto teste', registered_flag=False)


def test_fuel_totals_do_not_impute_missing_amount_or_liters():
    rows = [supply(0, amount=50), supply(1, amount=None, liters=0)]
    totals = fuel_totals(rows)
    assert totals.records == 2
    assert totals.cost.value is None and totals.cost.known_value == 50
    assert totals.liters.value is None and totals.liters.known_value == 10
    assert totals.price_per_liter == 5 and totals.priced_records == 1


def test_capacity_regression_and_close_events_include_rule_and_previous_record():
    vehicle, station = uuid4(), uuid4()
    start = datetime(2026, 9, 2, 12, tzinfo=timezone.utc)
    first = supply(0, vehicle=vehicle, station=station, when=start, odometer=1000, liters=60)
    second = supply(1, vehicle=vehicle, station=station, when=start+timedelta(hours=1), odometer=900)
    third = supply(2, vehicle=vehicle, station=station, when=start+timedelta(hours=2), odometer=905)
    anomalies, _, _ = detect_anomalies([first, second, third], PERIOD)
    kinds = [item.kind for item in anomalies]
    assert 'capacity' in kinds and 'odometer' in kinds and 'close' in kinds
    assert next(item for item in anomalies if item.kind == 'odometer').previous_supply_id == first['id']
    assert next(item for item in anomalies if item.kind == 'close').sample_size == 2
    assert all(item.rule and item.limitation and item.rule_version for item in anomalies)


def test_consumption_and_price_need_five_prior_comparable_samples():
    vehicle, station = uuid4(), uuid4()
    rows = [supply(index, vehicle=vehicle, station=station) for index in range(6)]
    rows.append(supply(6, vehicle=vehicle, station=station, odometer=1510, amount=100))
    anomalies, insufficient_consumption, insufficient_price = detect_anomalies(rows, PERIOD)
    assert {item.kind for item in anomalies} == {'consumption', 'price'}
    assert all(item.supply_id == rows[-1]['id'] and item.sample_size >= 5 for item in anomalies)
    assert insufficient_consumption >= 5 and insufficient_price == 5
    without_station = [{**item, 'station_id': None, 'station_text': None} for item in rows]
    assert not any(item.kind == 'price' for item in detect_anomalies(without_station, PERIOD)[0])


def test_fuel_analysis_uses_same_measured_vehicle_set_and_hides_records_without_domain_permission():
    vehicle, other, station = uuid4(), uuid4(), uuid4()
    rows = [supply(0, vehicle=vehicle, station=station, liters=10, amount=50),
        supply(1, vehicle=other, station=station, liters=20, amount=200)]
    distance = [dict(period='current', vehicle_id=vehicle, valid_records=1, distance_km=Decimal('100')),
        dict(period='current', vehicle_id=uuid4(), valid_records=1, distance_km=Decimal('900'))]
    result = build_analysis(rows, distance, FILTERS, PERIOD, PREVIOUS, False)
    assert result.totals.cost.value == 250
    assert result.measured_distance_km == 100
    assert result.measured_vehicles == 1
    assert result.measured_km_per_liter_supplied == 10
    assert result.measured_liters_per_100km_supplied == 10
    assert result.anomalies == [] and not result.can_view_records
    assert len(result.vehicles) == 2 and len(result.stations) == 1


def test_fuel_sql_filters_historical_organization_period_and_station():
    filters = FILTERS.model_copy(update={'organization': uuid4(), 'vehicle_type': 'SEDAN', 'vehicle_id': uuid4()})
    sql = str(fuel_statement(filters, PERIOD.start_at, PERIOD.end_exclusive, station='unknown').compile(dialect=postgresql.dialect()))
    assert 'fuel_supplies.supplied_at >=' in sql and 'fuel_supplies.supplied_at <' in sql
    assert 'location_history' in sql and 'vehicles.vehicle_type =' in sql
    assert 'fuel_supplies.vehicle_id =' in sql and 'fuel_supplies.fuel_station_id IS NULL' in sql


@pytest.mark.asyncio
async def test_fuel_routes_preserve_scope_and_source_permission(monkeypatch):
    org = uuid4()
    captured = []
    async def aggregate(self, filters, *, can_view_records):
        captured.append((filters.organization, can_view_records))
        return build_analysis([], [], filters, PERIOD, PREVIOUS, can_view_records)
    async def events(self, filters, *, station, offset):
        captured.append((filters.organization, station, offset))
        return FuelEvents(total_events=0, events=[], offset=offset)
    monkeypatch.setattr(AnalyticsV2Fuel, 'get', aggregate)
    monkeypatch.setattr(AnalyticsV2Fuel, 'events', events)
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=org,
        permissions={'fuel_supplies': {'can_view': True}})
    permission = SimpleNamespace(can_view=True, can_create=False, can_edit=False, can_delete=False)
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: permission)))
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    path = '/api/analytics/v2/fuel?date_from=2026-09-01&date_to=2026-09-30'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.get(path)
        events_response = await client.get(path.replace('/fuel?', '/fuel/events?') + '&station=unknown&offset=100')
        invalid = await client.get(path.replace('/fuel?', '/fuel/events?') + '&station=id:invalid')
        user.permissions['fuel_supplies']['can_view'] = False
        restricted = await client.get(path)
        permission.can_view = False
        forbidden = await client.get(path)
    assert response.status_code == 200 and response.headers['cache-control'] == 'private, no-store'
    assert events_response.status_code == 200 and invalid.status_code == 422
    assert restricted.status_code == 200 and restricted.json()['anomalies'] == []
    assert forbidden.status_code == 403
    assert captured == [(org, True), (org, 'unknown', 100), (org, False)]
