"""Anonymous read-only fixtures; browser intercepts every API, no real auth or writes."""
import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, NAMESPACE_URL, uuid5
from dotenv import dotenv_values
from sqlalchemy import select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

ROOT = Path(__file__).resolve().parents[4]
assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes')
sys.path.insert(0, str(ROOT / 'backend'))
from app.models.fuel_supply import FuelSupply
from app.models.user import UserRole
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_alerts import AnalyticsAlerts
from app.services.analytics_v2_detail import AnalyticsV2DetailService


async def main():
    url = make_url(dotenv_values(ROOT / 'backend/.env')['DATABASE_URL'])
    assert (url.host, url.port, url.database) == ('127.0.0.1', 5441, 'frota_emprestimos_testes')
    engine = create_async_engine(url, connect_args={'server_settings': {'default_transaction_read_only': 'on'}})
    modules = ['analytics','master_data','vehicles','drivers','fuel_supplies','possession','maintenance','fines','claims']
    permissions = {name: {'can_view': True,'can_edit': name == 'analytics','can_create': False,'can_delete': False} for name in modules}
    user = SimpleNamespace(role=UserRole.ADMIN, organization_id=None, permissions=permissions)
    filters = AnalyticsV2Filter(date_from='2026-09-13', date_to='2026-10-12')
    fixtures = {'details': {}, 'histories': {}}
    try:
        async with engine.connect() as conn:
            assert (await conn.execute(text('SHOW transaction_read_only'))).scalar_one() == 'on'
            async with AsyncSession(bind=conn) as db:
                service = AnalyticsAlerts(db)
                fixtures['listing'] = await service.list(user, filters=filters)
                assert fixtures['listing']['items']
                for item in fixtures['listing']['items']:
                    key = item['id']
                    fixtures['details'][key] = await service.detail(user, UUID(key))
                    fixtures['histories'][key] = await service.events(user, UUID(key))
                first = fixtures['listing']['items'][0]
                fixtures['entity'] = (await AnalyticsV2DetailService(db).get(filters, 'vehicle', UUID(first['vehicle_id']), permissions)).model_dump(mode='json')
                row = (await db.execute(select(FuelSupply.supplied_at, FuelSupply.odometer_km, FuelSupply.liters,
                    FuelSupply.total_amount, FuelSupply.fuel_type).where(FuelSupply.id == UUID(first['source_id'])))).one()
                fixtures['record'] = dict(supplied_at=row.supplied_at.isoformat(), odometer_km=row.odometer_km,
                    liters=row.liters, total_amount=str(row.total_amount), fuel_type=row.fuel_type, fuel_station_name='Posto de teste')
    finally:
        await engine.dispose()
    plates = {}
    def anon(value, key=''):
        if isinstance(value, dict):
            return {anon(name): anon(item, name) for name, item in value.items()}
        if isinstance(value, list):
            return [anon(item, key) for item in value]
        if isinstance(value, str):
            if key == 'plate' or (key == 'title' and len(value) <= 10):
                return plates.setdefault(value, f'TST{len(plates)+1:04}')
            if key in ('actor_label','driver_name','name','subtitle'):
                return 'Operador/entidade de teste'
            if key == 'brand': return 'Marca de teste'
            if key == 'model': return 'Modelo de teste'
            try: return str(uuid5(NAMESPACE_URL, 'analytics-phase10/' + str(UUID(value))))
            except ValueError: return value
        return value
    fixtures = anon(fixtures)
    fixtures['auth'] = {'id': str(uuid5(NAMESPACE_URL,'phase10-qa-user')), 'name': 'Usuário de teste', 'role': 'ADMIN',
        'permissions': permissions, 'must_register_cpf': False, 'must_change_password': False}
    target = ROOT / 'output/playwright/analytics-phase-10'
    target.mkdir(parents=True, exist_ok=True)
    (target / 'fixtures.json').write_text(json.dumps(fixtures, ensure_ascii=False), encoding='utf-8')
    print('Anonymous read-only fixtures generated. No user/session or workflow mutation created.')


asyncio.run(main())
