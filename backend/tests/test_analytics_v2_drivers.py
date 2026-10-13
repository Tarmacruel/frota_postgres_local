from datetime import date, datetime, timezone
from decimal import Decimal
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
from app.services.analytics_v2_drivers import (AnalyticsV2Drivers, DriverEvents, build_analysis,
    driver_possession_statement, driver_record_statement)
from app.services.analytics_v2_fuel import FuelAnomaly
from app.services.analytics_v2_periods import equivalent_periods


def test_driver_sql_uses_explicit_link_valid_mileage_and_historical_scope():
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30', organization=uuid4())
    period, _ = equivalent_periods(filters.date_from, filters.date_to,
        now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    possession = str(driver_possession_statement(filters, period).compile(dialect=postgresql.dialect()))
    fine = str(driver_record_statement(filters, period, 'fine').compile(dialect=postgresql.dialect()))
    assert 'vehicle_possession.driver_id' in possession and 'NOT (EXISTS' in possession
    assert 'vehicle_possession.end_odometer_km < ' in possession
    assert 'responsible_organization_id' in possession and 'location_history' in possession
    assert 'fines.driver_id' in fine and 'fines.infraction_date >=' in fine


def test_driver_counts_do_not_infer_identity_and_keep_license_separate():
    driver, other, vehicle = uuid4(), uuid4(), uuid4()
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30')
    period, _ = equivalent_periods(filters.date_from, filters.date_to,
        now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    roster = [dict(id=driver, nome_completo='Ana', organization_id=None, ativo=True,
        cnh_validade=date(2026, 10, 20)),
        dict(id=other, nome_completo='Bia', organization_id=None, ativo=True, cnh_validade=None)]
    possessions = [dict(driver_id=driver, vehicle_id=vehicle, distance_km=Decimal('120')),
        dict(driver_id=None, vehicle_id=vehicle, distance_km=Decimal('30'))]
    fines = [dict(driver_id=driver), dict(driver_id=None)]
    claims = [dict(driver_id=driver)]
    supplies = [dict(id=uuid4(), driver_id=driver, supplied_at=period.start_at)]
    anomaly = FuelAnomaly(kind='capacity', label='Capacidade', supply_id=supplies[0]['id'],
        vehicle_id=vehicle, plate='ABC1D23', supplied_at=period.start_at,
        observed='60 L', reference='50 L', sample_size=1, rule='litros > capacidade', limitation='Triagem')
    data = build_analysis(filters, period, roster, possessions, fines, claims, supplies, [anomaly],
        can_view_drivers=True, today=date(2026, 10, 11), readable_sources=['possession'])
    ana = next(row for row in data.drivers if row.driver_id == driver)
    assert (ana.possessions, ana.valid_km_possessions, ana.vehicles_with_possession) == (1, 1, 1)
    assert ana.distance_km == 120 and (ana.fines, ana.claims, ana.fuel_supplies, ana.anomaly_rules) == (1, 1, 1, 1)
    assert data.unlinked_records['possession'] == 1 and data.unlinked_records['fine'] == 1
    assert data.license.expiring == 1 and data.license.missing == 1
    assert data.totals['distance_km'] == 120 and all('score' not in type(row).model_fields for row in data.drivers)
    hidden = build_analysis(filters, period, roster, possessions, fines, claims, supplies, [anomaly],
        can_view_drivers=False, today=date(2026, 10, 11))
    assert hidden.license is None and {row.driver_id for row in hidden.drivers} == {driver}
    assert all(row.license_expires_at is None for row in hidden.drivers)


def test_license_scope_stays_with_current_organization_when_history_differs():
    org, elsewhere, driver, own = uuid4(), uuid4(), uuid4(), uuid4()
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30', organization=org)
    period, _ = equivalent_periods(filters.date_from, filters.date_to,
        now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    roster = [dict(id=driver, nome_completo='Histórico', organization_id=elsewhere, ativo=True,
        cnh_validade=date(2026, 9, 1)),
        dict(id=own, nome_completo='Atual', organization_id=org, ativo=True,
        cnh_validade=date(2026, 10, 20))]
    possessions = [dict(driver_id=driver, vehicle_id=uuid4(), distance_km=None)]
    data = build_analysis(filters, period, roster, possessions, [], [], [], [],
        can_view_drivers=True, today=date(2026, 10, 11))
    assert {item.driver_id for item in data.drivers} == {driver, own}
    assert next(item for item in data.drivers if item.driver_id == driver).license_status is None
    assert data.license.active_drivers == 1 and data.license.expiring == 1 and data.license.expired == 0


@pytest.mark.asyncio
async def test_driver_events_open_source_records_and_anomaly_evidence():
    driver, outsider, vehicle = uuid4(), uuid4(), uuid4()
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30')
    period, _ = equivalent_periods(filters.date_from, filters.date_to,
        now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    when = datetime(2026, 9, 10, tzinfo=timezone.utc)
    possession = dict(id=uuid4(), public_number=44, driver_id=driver, vehicle_id=vehicle,
        plate='ABC1D23', start_date=when, end_date=when, start_odometer_km=100,
        end_odometer_km=150, distance_km=Decimal('50'), duration_hours=Decimal('2'))
    fine = dict(id=uuid4(), driver_id=driver, vehicle_id=vehicle, plate='ABC1D23',
        date=date(2026, 9, 12), amount=Decimal('100'), status='PENDENTE')
    supply = dict(id=uuid4(), driver_id=driver, vehicle_id=vehicle, plate='ABC1D23',
        supplied_at=when, total_amount=Decimal('80'))
    anomaly = FuelAnomaly(kind='capacity', label='Volume acima', supply_id=supply['id'],
        vehicle_id=vehicle, plate='ABC1D23', supplied_at=when, observed='60 L',
        reference='50 L', sample_size=1, rule='litros > capacidade', limitation='Triagem')
    roster = [dict(id=driver, nome_completo='Ana', organization_id=None, ativo=True, cnh_validade=None)]
    service = AnalyticsV2Drivers(None)
    service._load = AsyncMock(return_value=(period, roster, [possession], [fine], [], [supply], [anomaly]))
    possessions = await service.events(filters, driver, source='possession', offset=0)
    fines = await service.events(filters, driver, source='fine', offset=0)
    anomalies = await service.events(filters, driver, source='anomaly', offset=0)
    assert possessions.events[0].public_number == 44 and possessions.events[0].distance_km == 50
    assert fines.events[0].id == fine['id'] and fines.events[0].amount == 100
    assert anomalies.events[0].id == supply['id'] and anomalies.events[0].anomaly.sample_size == 1
    with pytest.raises(HTTPException) as denied:
        await service.events(filters, outsider, source='fine', offset=0)
    assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_driver_without_events_opens_empty_only_with_authorized_roster_read():
    driver, org, elsewhere = uuid4(), uuid4(), uuid4()
    filters = AnalyticsV2Filter(date_from='2026-09-01', date_to='2026-09-30', organization=org)
    period, _ = equivalent_periods(filters.date_from, filters.date_to,
        now=datetime(2026, 10, 8, tzinfo=timezone.utc))
    roster = [dict(id=driver, nome_completo='Ana', organization_id=org, ativo=True, cnh_validade=None)]
    service = AnalyticsV2Drivers(None)
    service._load = AsyncMock(return_value=(period, roster, [], [], [], [], []))
    result = await service.events(filters, driver, source='possession', offset=0, can_view_drivers=True)
    assert result.total_events == 0 and result.events == []
    for recorte, allowed in [(filters, False), (filters.model_copy(update={'organization': elsewhere}), True),
                            (filters.model_copy(update={'vehicle_type': 'SEDAN'}), True)]:
        with pytest.raises(HTTPException) as denied:
            await service.events(recorte, driver, source='possession', offset=0, can_view_drivers=allowed)
        assert denied.value.status_code == 404


@pytest.mark.asyncio
async def test_driver_event_route_enforces_source_permission_and_organization(monkeypatch):
    org, driver = uuid4(), uuid4()
    seen = []
    async def stub(self, filters, driver_id, *, source, offset, can_view_drivers):
        seen.append((filters.organization, driver_id, source, offset, can_view_drivers))
        return DriverEvents(driver_id=driver_id, source=source, total_events=0, events=[], offset=offset)
    monkeypatch.setattr(AnalyticsV2Drivers, 'events', stub)
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=org,
        permissions={'possession': {'can_view': True}, 'fines': {'can_view': False}})
    async def permission_result(statement):
        return SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(can_view=True,
            can_create=False, can_edit=False, can_delete=False))
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: SimpleNamespace(execute=permission_result)
    path = f'/api/analytics/v2/drivers/{driver}/events?date_from=2026-09-01&date_to=2026-09-30'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        allowed = await client.get(path + '&source=possession&offset=100')
        denied = await client.get(path + '&source=fine')
        invalid = await client.get(path + '&source=unknown')
    assert allowed.status_code == 200 and allowed.headers['cache-control'] == 'private, no-store'
    assert seen == [(org, driver, 'possession', 100, False)]
    assert denied.status_code == 403 and invalid.status_code == 422
