"""Prepare anonymized read-only HML fixtures for a browser with every API request intercepted.

This does not create a user/session or change database data. Fixture JSON stays in ignored output/.
"""
import asyncio
import json
import sys
from datetime import date
from pathlib import Path
from uuid import UUID, NAMESPACE_URL, uuid5

from dotenv import dotenv_values
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

ROOT = Path(__file__).resolve().parents[4]
assert ROOT == Path(r"D:\FROTAS\frota_emprestimos_testes")
sys.path.insert(0, str(ROOT / 'backend'))
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_v2_service import AnalyticsV2Service
from app.services.analytics_v2_cockpit import AnalyticsV2Cockpit
from app.services.analytics_v2_costs import AnalyticsV2Costs
from app.services.analytics_v2_fuel import AnalyticsV2Fuel
from app.services.analytics_v2_maintenance import AnalyticsV2Maintenance
from app.services.analytics_v2_utilization import AnalyticsV2Utilization
from app.services.analytics_v2_drivers import AnalyticsV2Drivers
from app.services.analytics_v2_detail import AnalyticsV2DetailService


async def main():
    url = make_url(dotenv_values(ROOT / 'backend/.env')['DATABASE_URL'])
    assert (url.host, url.port, url.database) == ('127.0.0.1', 5441, 'frota_emprestimos_testes')
    engine = create_async_engine(url, connect_args={'server_settings': {
        'default_transaction_read_only': 'on', 'statement_timeout': '15000'}})
    filters = AnalyticsV2Filter(date_from=date(2026, 9, 11), date_to=date(2026, 10, 10))
    modules = ['analytics', 'master_data', 'vehicles', 'drivers', 'possession', 'fuel_supplies', 'maintenance', 'fines', 'claims']
    permissions = {name: {'can_view': True, 'can_create': False, 'can_edit': False, 'can_delete': False} for name in modules}
    fixtures = {}
    try:
        async with engine.connect() as conn:
            assert (await conn.execute(text('SHOW transaction_read_only'))).scalar_one() == 'on'
            async with AsyncSession(bind=conn) as session:
                services = {
                    'summary': lambda: AnalyticsV2Service(session).summary(filters),
                    'fleet-status': lambda: AnalyticsV2Cockpit(session).fleet(filters),
                    'attention': lambda: AnalyticsV2Cockpit(session).attention(filters),
                    'costs': lambda: AnalyticsV2Costs(session).get(filters),
                    'fuel': lambda: AnalyticsV2Fuel(session).get(filters, can_view_records=True),
                    'maintenance': lambda: AnalyticsV2Maintenance(session).get(filters),
                    'utilization': lambda: AnalyticsV2Utilization(session).get(filters),
                    'drivers': lambda: AnalyticsV2Drivers(session).get(filters, can_view_drivers=True,
                        readable_sources=['possession', 'fine', 'claim', 'fuel_supply', 'anomaly']),
                }
                for name, load in services.items():
                    fixtures[f'/analytics/v2/{name}'] = (await load()).model_dump(mode='json')
                fixture_events = {
                    'costs/events': lambda: AnalyticsV2Costs(session).events(filters, permissions,
                        source='operational', organization_bucket=None, offset=0),
                    'costs/mileage-events': lambda: AnalyticsV2Costs(session).mileage_events(filters, offset=0),
                    'fuel/events': lambda: AnalyticsV2Fuel(session).events(filters, station=None, offset=0),
                    'maintenance/events': lambda: AnalyticsV2Maintenance(session).events(filters, offset=0),
                    'utilization/events': lambda: AnalyticsV2Utilization(session).events(filters, mode='period', offset=0),
                }
                for name, load in fixture_events.items():
                    data = (await load()).model_dump(mode='json')
                    fixtures[f'/analytics/v2/{name}'] = data
                vehicle = fixtures['/analytics/v2/costs']['vehicles'][0]['vehicle_id']
                fixtures['entity'] = (await AnalyticsV2DetailService(session).get(
                    filters, 'vehicle', UUID(vehicle), permissions)).model_dump(mode='json')
                driver = max(fixtures['/analytics/v2/drivers']['drivers'], key=lambda row: row['possessions'])['driver_id']
                for source in ('possession', 'fine', 'claim', 'fuel_supply', 'anomaly'):
                    data = (await AnalyticsV2Drivers(session).events(filters, UUID(driver), source=source,
                        offset=0, can_view_drivers=True)).model_dump(mode='json')
                    fixtures[f'driver/{source}'] = data
            await conn.rollback()
    finally:
        await engine.dispose()

    plates, names = {}, {}
    def anonymize(value, key=''):
        if isinstance(value, dict):
            return {name: anonymize(item, name) for name, item in value.items()}
        if isinstance(value, list):
            return [anonymize(item, key) for item in value]
        if isinstance(value, str):
            if key == 'plate' or (key == 'title' and len(value) <= 10):
                return plates.setdefault(value, f'TST{len(plates) + 1:04}')
            if key in {'name', 'driver_name', 'subtitle'}:
                return names.setdefault(value, f'Entidade de teste {len(names) + 1}')
            try:
                return str(uuid5(NAMESPACE_URL, 'analytics-review/' + str(UUID(value))))
            except ValueError:
                return value
        return value
    fixtures = anonymize(fixtures)
    vehicle = fixtures['/analytics/v2/costs']['vehicles'][0]
    fixtures['/analytics/efficiency'] = [dict(vehicle_id=vehicle['vehicle_id'], vehicle_type='SEDAN',
        total_km=100, total_liters=10, consumption_l_100km=10, category_average=12, variance_percentage=-16.67)]
    fixtures['/analytics/costs/tco'] = [dict(vehicle_id=vehicle['vehicle_id'], vehicle_type='SEDAN',
        total_km=100, tco_cost_per_km=1, category_average=1.2, market_benchmark=1.35, variance_percentage=-25.93)]
    fixtures['/analytics/insights'] = [dict(vehicle_id=vehicle['vehicle_id'], vehicle_type='SEDAN',
        metric='consumption_l_100km', current_value=20, category_average=10, variance_percentage=100,
        severity='HIGH', message=f"Veículo {vehicle['plate']} · Marca Modelo: litros abastecidos por 100 km superiores à média da categoria.",
        recommended_action='Conferir os registros de origem.', generated_at='2026-10-13T12:00:00Z')]
    fixtures['/analytics/costs/trend'] = []
    fixtures['/auth/me'] = dict(id=str(uuid5(NAMESPACE_URL, 'analytics-review/user')), name='Usuário de teste',
        role='PADRAO', email='qa@example.invalid', permissions=permissions,
        must_change_password=False, must_register_cpf=False)
    fixtures['/master-data/catalog'] = {'organizations': []}
    target = ROOT / 'output/playwright/analytics-review-20261013'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'fixtures.json').write_text(json.dumps(fixtures, ensure_ascii=False), encoding='utf-8')
    print('Read-only HML fixtures anonymized; no real API auth/session or database mutation.')


asyncio.run(main())
