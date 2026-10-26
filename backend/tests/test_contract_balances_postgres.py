"""Real locking/transaction tests. Only a disposable database on the HML cluster is accepted."""
import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import os
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException
from fastapi import UploadFile
from starlette.datastructures import Headers
import pytest
import pytest_asyncio
from sqlalchemy import func, select, text, update
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.models import Organization, User, UserRole, Vehicle
from app.models.audit_log import AuditLog
from app.models.contract_balance import ContractControl, ContractFuelPrice, ContractMovement, ContractProvider, ContractReservation, MaintenanceOrder
from app.models.fuel_station import FuelStation
from app.models.fuel_supply_order import FuelSupplyOrder
from app.models.maintenance import MaintenanceRecord
from app.models.payment_process import PaymentContract, PaymentSupplier
from app.schemas.contract_balance import ContractOpening, MaintenanceOrderComplete, MaintenanceOrderCreate, MaintenanceOrderStart, PriceCreate, ProviderCreate
from app.schemas.contract_balance import FuelOrderFunding, PriceUpdate
from app.schemas.fuel_supply import FuelSupplyOrderBatchCreate, FuelSupplyOrderCreate, FuelSupplyOrderDeadlineUpdate
from app.schemas.fuel_supply import FuelSupplyOrderCancel, FuelSupplyOrderConfirm, FuelSupplyRectify
from app.services.contract_balance_service import ContractBalanceService
from app.services.fuel_supply_order_service import FuelSupplyOrderService
from app.services.maintenance_order_service import MaintenanceOrderService
from app.services.fuel_supply_service import FuelSupplyService

URL = os.getenv('CONTRACT_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='Requires an explicitly disposable contract test database')


@pytest_asyncio.fixture
async def pg(monkeypatch):
    parsed = make_url(URL)
    assert parsed.host == '127.0.0.1' and parsed.port == 5441
    assert parsed.database.startswith('frota_contract_tests_')
    monkeypatch.setattr(settings, 'CONTRACT_BALANCE_ENABLED', True)
    engine = create_async_engine(URL)
    async with engine.begin() as conn:
        await conn.execute(text('CREATE EXTENSION IF NOT EXISTS citext'))
        await conn.execute(text('CREATE SEQUENCE IF NOT EXISTS vehicle_possession_public_number_seq'))
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("""CREATE OR REPLACE FUNCTION contract_movements_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Contract ledger is append-only; record an adjustment or reversal'; END; $$"""))
        await conn.execute(text('DROP TRIGGER IF EXISTS contract_movements_immutable ON contract_movements'))
        await conn.execute(text('CREATE TRIGGER contract_movements_immutable BEFORE UPDATE OR DELETE ON contract_movements FOR EACH ROW EXECUTE FUNCTION contract_movements_immutable()'))
    async with AsyncSession(engine, expire_on_commit=False) as db:
        suffix = str(uuid4())[:8]
        now = datetime.now(timezone.utc)
        actor = User(id=uuid4(), name='Teste Contratos '+suffix, email=suffix+'@contract.test', password_hash='test-only', role=UserRole.ADMIN)
        vehicle = Vehicle(id=uuid4(), plate='TC'+suffix[:5].upper(), brand='TESTE', model='DADOS FICTICIOS')
        supplier = PaymentSupplier(id=uuid4(), name='Prestador teste '+suffix, active=True)
        station = FuelStation(id=uuid4(), name='Posto teste '+suffix, address='Ambiente isolado', active=True)
        db.add_all([actor, vehicle, supplier, station])
        await db.flush()
        contract = PaymentContract(id=uuid4(), number='TEST-'+suffix, supplier_id=supplier.id, kind='FUEL',
            valid_from=date.today()-timedelta(days=1), valid_until=date.today()+timedelta(days=365), value_updated=100, status='ACTIVE')
        db.add(contract)
        await db.flush()
        service = ContractBalanceService(db)
        provider = await service.add_provider(contract.id, ProviderCreate(supplier_id=supplier.id, fuel_station_id=station.id), actor)
        price = await service.add_price(contract.id, PriceCreate(provider_id=provider.id, fuel_type='DIESEL S10',
            unit_price=10, valid_from=now-timedelta(seconds=10)), actor)
        await service.open_control(contract.id, ContractOpening(balance=100, opening_date=date.today(),
            justification='Saldo fictício conferido no teste isolado'), actor)
        await db.commit()
        yield SimpleNamespace(db=db, engine=engine, actor=actor, vehicle=vehicle, supplier=supplier,
                              station=station, contract=contract, provider=provider, price=price, service=service)
    await engine.dispose()


def order_payload(c, *, request_key=None, liters=3):
    return FuelSupplyOrderCreate(vehicle_id=c.vehicle.id, fuel_station_id=c.station.id,
        expires_at=datetime.now(timezone.utc)+timedelta(hours=24), requested_liters=liters,
        contract_id=c.contract.id, contract_provider_id=c.provider.id,
        requested_fuel_type='DIESEL S10', expected_price_id=c.price.id, request_key=request_key or uuid4())


async def another_contract(c, prefix='REDE'):
    contract = PaymentContract(id=uuid4(), number=prefix+'-'+str(uuid4())[:8], supplier_id=c.supplier.id,
        kind='FUEL', status='ACTIVE', valid_from=date.today(), valid_until=date.today()+timedelta(days=365))
    c.db.add(contract)
    await c.db.commit()
    return contract


@pytest.mark.asyncio
@pytest.mark.parametrize('kind,with_services', [('FUEL', False), ('FUEL', True), ('MAINTENANCE', True)])
async def test_payment_process_api_creates_collections_and_reconciles_without_double_consumption(pg, kind, with_services):
    """Exercise the real POST/ORM flush that frontend API mocks cannot cover."""
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    from app.models.contract_balance import ContractOperation
    from app.models.payment_process import PaymentProcess
    from app.services.payment_process_service import CHECKLIST_DEFAULTS
    from httpx import ASGITransport, AsyncClient
    c = pg
    if kind == 'MAINTENANCE':
        c.contract.kind = kind
        c.provider.fuel_station_id = None
        await c.db.flush()
    operation_ids, references = [], []
    if with_services:
        for index, amount in enumerate([25, 12, 30]):
            reservation = await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id,
                source_type='FUEL_ORDER' if kind == 'FUEL' else 'MAINTENANCE_ORDER', source_id=uuid4(),
                vehicle_id=c.vehicle.id, organization_id=None, actor=c.actor, amount=30,
                fuel_type='DIESEL S10', liters=3)
            source_id = uuid4()
            await c.service.settle(reservation.id, source_type='FUEL_SUPPLY' if kind == 'FUEL' else 'MAINTENANCE',
                source_id=source_id, amount=amount, occurred_at=datetime.now(timezone.utc), actor=c.actor)
            operation = await c.db.scalar(select(ContractOperation).where(ContractOperation.source_id == source_id))
            operation_ids.append(str(operation.id))
            references.append(dict(reference_type='FUEL_SUPPLY' if kind == 'FUEL' else 'MAINTENANCE',
                external_id=str(source_id), label=f'Serviço fictício {index+1}', description='Origem conferida no teste isolado'))
    await c.db.commit()
    balance_before = await c.service.balances(c.contract.id)
    movements_before = await c.db.scalar(select(func.count()).select_from(ContractMovement).where(ContractMovement.contract_id == c.contract.id))
    process_number = 'API-CREATE-'+uuid4().hex[:8].upper()
    payload = dict(process_number=process_number, kind=kind, stage='ASSEMBLY', contract_id=str(c.contract.id),
        supplier_id=str(c.supplier.id), amount='67.00', invoice_number='NF-TESTE', billing_number='FATURA-TESTE',
        issue_date=date.today().isoformat(), due_date=date.today().isoformat(),
        competence_month=date.today().replace(day=1).isoformat(), references=references)

    async def session():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            yield db
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: c.actor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            created = await client.post('/api/payment-processes', json=payload)
            assert created.status_code == 201, created.text
            record = created.json()
            assert record['process_number'] == process_number and record['stage'] == 'ASSEMBLY'
            assert record['invoice_number'] == 'NF-TESTE' and record['billing_number'] == 'FATURA-TESTE'
            assert Decimal(str(record['amount'])) == Decimal('67')
            assert {r['external_id'] for r in record['references']} == {r['external_id'] for r in references}
            assert len(record['checklist']) == sum(len(items) for items in CHECKLIST_DEFAULTS.values())
            assert all(item['status'] == 'PENDING' for item in record['checklist'])
            endpoint = '/api/payment-processes/'+record['id']
            assert (await client.get(endpoint)).status_code == 200
            updated = await client.put(endpoint, json={'notes': 'Cadastro real conferido no teste descartável'})
            assert updated.status_code == 200, updated.text
            assert len(updated.json()['references']) == len(references)
            assert len(updated.json()['checklist']) == len(record['checklist'])
            if with_services:
                reconcile = '/api/contract-control/processes/'+record['id']+'/reconciliation'
                for _ in range(2):
                    response = await client.post(reconcile, json={'operation_ids': operation_ids})
                    assert response.status_code == 200, response.text
                    assert set(response.json()['operation_ids']) == set(operation_ids)
                    assert Decimal(str(response.json()['difference'])) == 0
            deleted = await client.request('DELETE', endpoint, json={'reason': 'Cadastro fictício no banco descartável'})
            assert deleted.status_code == (409 if with_services else 200), deleted.text
    finally:
        app.dependency_overrides.clear()
    assert await c.db.scalar(select(func.count()).select_from(PaymentProcess).where(PaymentProcess.process_number == process_number)) == int(with_services)
    assert await c.service.balances(c.contract.id) == balance_before
    assert await c.db.scalar(select(func.count()).select_from(ContractMovement).where(ContractMovement.contract_id == c.contract.id)) == movements_before


@pytest.mark.asyncio
async def test_payment_process_import_initializes_checklist_after_real_flush(pg):
    from app.models.payment_process import PaymentProcess
    from app.services.payment_process_service import CHECKLIST_DEFAULTS, PaymentProcessService
    from openpyxl import Workbook
    c = pg
    number = 'IMPORT-API-'+uuid4().hex[:8].upper()
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(['Número do Processo', 'Status', 'Unidade', 'Emissão NF', 'Valor', 'Tipo Processo'])
    sheet.append([number, 'MONTAGEM', 'Unidade fictícia', date.today(), 25, 'Combustíveis'])
    output = BytesIO()
    workbook.save(output)
    service = PaymentProcessService(c.db)
    for expected_created, expected_updated in [(1, 0), (0, 1)]:
        result = await service.import_xlsx(UploadFile(filename='teste-isolado.xlsx', file=BytesIO(output.getvalue())), c.actor)
        assert (result['created'], result['updated'], result['errors']) == (expected_created, expected_updated, 0)
    process = await c.db.scalar(select(PaymentProcess).where(PaymentProcess.process_number == number))
    saved = await service.get(process.id, current_user=c.actor)
    assert len(saved['checklist']) == sum(len(items) for items in CHECKLIST_DEFAULTS.values())
    assert saved['references'] == []
    assert await c.db.scalar(select(func.count()).select_from(PaymentProcess).where(PaymentProcess.process_number == number)) == 1


@pytest.mark.asyncio
async def test_station_can_join_network_while_linked_to_an_individual_contract(pg):
    c = pg
    network = await another_contract(c)
    await c.service.add_provider(network.id, ProviderCreate(supplier_id=c.supplier.id, fuel_station_id=c.station.id), c.actor)
    assert await c.db.scalar(select(func.count()).select_from(ContractProvider).where(
        ContractProvider.fuel_station_id == c.station.id, ContractProvider.active.is_(True))) == 2
    await c.db.rollback()


@pytest.mark.asyncio
async def test_shared_station_keeps_contract_prices_reservations_and_balances_separate(pg):
    c = pg
    network = await another_contract(c)
    provider = await c.service.add_provider(network.id, ProviderCreate(supplier_id=c.supplier.id, fuel_station_id=c.station.id), c.actor)
    price = await c.service.add_price(network.id, PriceCreate(provider_id=provider.id, fuel_type='DIESEL S10',
        unit_price=7, valid_from=datetime.now(timezone.utc)-timedelta(seconds=5)), c.actor)
    await c.service.open_control(network.id, ContractOpening(balance=200, opening_date=date.today(),
        justification='Saldo conferido do segundo contrato'), c.actor)
    await c.db.commit()
    eligible = await c.service.eligible(kind='FUEL', station_id=c.station.id)
    assert {row['id'] for row in eligible} >= {c.contract.id, network.id}
    assert (await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 3))['reserve_amount'] == 30
    assert (await c.service.quote(network.id, provider.id, 'DIESEL S10', 3))['reserve_amount'] == 21
    payload = order_payload(c).model_copy(update={'contract_id': network.id,
        'contract_provider_id': provider.id, 'expected_price_id': price.id})
    order = await FuelSupplyOrderService(c.db).create_order(payload, c.actor)
    assert (await c.service.balances(network.id))['reserved_amount'] == 21
    assert (await c.service.balances(network.id))['available_balance'] == 179
    assert (await c.service.balances(c.contract.id))['reserved_amount'] == 0
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100
    reservation = await c.db.scalar(select(ContractReservation).where(ContractReservation.source_id == order['id']))
    assert reservation.contract_id == network.id and reservation.price_id == price.id
    with pytest.raises(HTTPException) as wrong_contract:
        await c.service.quote(c.contract.id, provider.id, 'DIESEL S10', 3)
    assert wrong_contract.value.status_code == 409
    with pytest.raises(HTTPException) as duplicate:
        await c.service.add_provider(network.id, ProviderCreate(supplier_id=c.supplier.id, fuel_station_id=c.station.id), c.actor)
    assert duplicate.value.status_code == 409


@pytest.mark.asyncio
async def test_station_transfer_keeps_history_and_old_order_can_complete(pg, tmp_path, monkeypatch):
    from PIL import Image
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    order = await FuelSupplyOrderService(c.db).create_order(order_payload(c), c.actor)
    network = await another_contract(c)
    await c.service.set_provider_active(c.contract.id, c.provider.id, False, c.actor)
    replacement = await c.service.add_provider(network.id, ProviderCreate(supplier_id=c.supplier.id, fuel_station_id=c.station.id), c.actor)
    await c.db.commit()
    assert replacement.id != c.provider.id
    assert (await c.service.providers(c.contract.id))[0]['active'] is False
    await c.service.set_provider_active(c.contract.id, c.provider.id, True, c.actor)
    assert (await c.service.balances(c.contract.id))['reserved_amount'] == 30
    receipt = BytesIO()
    Image.new('RGB', (2, 2), color='white').save(receipt, 'PNG')
    receipt.seek(0)
    done = await FuelSupplyOrderService(c.db).confirm_order(order['id'], FuelSupplyOrderConfirm(
        odometer_km=100, liters=3, total_amount=25, fuel_type='DIESEL S10'),
        UploadFile(filename='teste.png', file=receipt, headers=Headers({'content-type': 'image/png'})), c.actor)
    assert done['status'].value == 'COMPLETED'
    assert (await c.service.balances(c.contract.id))['available_balance'] == 75
    assert (await c.service.balances(c.contract.id))['reserved_amount'] == 0


@pytest.mark.asyncio
async def test_two_contracts_can_link_the_same_station_concurrently(pg):
    c = pg
    first, second = await another_contract(c), await another_contract(c)
    station = FuelStation(id=uuid4(), name='Concorrencia '+str(uuid4()), address='Teste isolado', active=True)
    c.db.add(station)
    await c.db.commit()
    go = asyncio.Event()
    async def link(contract_id):
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            await go.wait()
            try:
                provider = await ContractBalanceService(db).add_provider(contract_id,
                    ProviderCreate(supplier_id=c.supplier.id, fuel_station_id=station.id), c.actor)
                await db.commit()
                return provider.id
            except HTTPException as exc:
                await db.rollback()
                return exc.status_code
    tasks = [asyncio.create_task(link(first.id)), asyncio.create_task(link(second.id))]
    go.set()
    results = await asyncio.gather(*tasks)
    assert results.count(409) == 0
    assert await c.db.scalar(select(func.count()).select_from(ContractProvider).where(
        ContractProvider.fuel_station_id == station.id, ContractProvider.active.is_(True))) == 2


@pytest.mark.asyncio
async def test_unique_index_protects_station_within_contract_without_service_validation(pg):
    c = pg
    async with AsyncSession(c.engine) as db:
        db.add(ContractProvider(contract_id=c.contract.id, supplier_id=c.supplier.id, fuel_station_id=c.station.id))
        with pytest.raises(IntegrityError) as conflict:
            await db.flush()
        assert 'uq_contract_provider_station' in str(conflict.value)
        await db.rollback()


@pytest.mark.asyncio
async def test_provider_activation_api_permissions_and_multi_contract_catalog(pg):
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    from httpx import ASGITransport, AsyncClient
    c = pg
    network = await another_contract(c)
    async def session():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            yield db
    actor = SimpleNamespace(id=c.actor.id, role=UserRole.POSTO, organization_id=None)
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: actor
    endpoint = f'/api/contract-control/contracts/{c.contract.id}/providers/{c.provider.id}'
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.patch(endpoint, params={'active': False})).status_code == 403
            app.dependency_overrides[get_current_user_ready] = lambda: c.actor
            station = next(s for s in (await client.get('/api/contract-control/catalog')).json()['stations'] if s['id'] == str(c.station.id))
            assert station['active_contract_id'] == str(c.contract.id)
            assert station['active_contract_number'] == c.contract.number
            assert (await client.patch(endpoint, params={'active': False})).status_code == 200
            linked = await client.post(f'/api/contract-control/contracts/{network.id}/providers',
                json={'supplier_id': str(c.supplier.id), 'fuel_station_id': str(c.station.id)})
            assert linked.status_code == 201, linked.text
            reactivated = await client.patch(endpoint, params={'active': True})
            assert reactivated.status_code == 200
            stations = (await client.get('/api/contract-control/catalog')).json()['stations']
            matches = [s for s in stations if s['id'] == str(c.station.id)]
            assert len(matches) == 1
            assert {row['id'] for row in matches[0]['active_contracts']} == {str(c.contract.id), str(network.id)}
            assert matches[0]['active_contract_id'] is None
            foreign = endpoint.replace(str(c.contract.id), str(network.id))
            assert (await client.patch(foreign, params={'active': False})).status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_price_edit_preserves_reservations_and_rejects_stale_preview(pg):
    c = pg
    order = await FuelSupplyOrderService(c.db).create_order(order_payload(c), c.actor)
    replacement = await c.service.update_price(c.contract.id, c.price.id, PriceUpdate(unit_price='12.123456'), c.actor)
    await c.db.commit()
    reservation = await c.db.scalar(select(ContractReservation).where(ContractReservation.source_id == order['id']))
    assert reservation.price_id == c.price.id and reservation.unit_price == 10 and reservation.amount == 30
    assert (await c.service.balances(c.contract.id))['available_balance'] == 70
    assert c.price.unit_price == 10 and replacement.id != c.price.id
    quote = await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 3)
    assert quote['price_id'] == replacement.id and quote['reserve_amount'] == Decimal('36.37')
    with pytest.raises(HTTPException) as stale:
        await FuelSupplyOrderService(c.db).create_order(order_payload(c), c.actor)
    assert stale.value.status_code == 409 and 'preço mudou' in stale.value.detail
    assert (await c.service.balances(c.contract.id))['available_balance'] == 70


@pytest.mark.asyncio
async def test_price_delete_blocks_new_orders_but_existing_order_can_be_completed(pg, tmp_path, monkeypatch):
    from PIL import Image
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    order = await FuelSupplyOrderService(c.db).create_order(order_payload(c), c.actor)
    await c.service.delete_price(c.contract.id, c.price.id, c.actor)
    await c.service.delete_price(c.contract.id, c.price.id, c.actor)
    await c.db.commit()
    assert await c.db.get(ContractFuelPrice, c.price.id) is not None
    assert (await c.service.prices(c.contract.id)) == []
    assert (await c.service.prices(c.contract.id, include_deleted=True))[0]['status'] == 'DELETED'
    assert (await c.service.eligible(kind='FUEL', station_id=c.station.id)) == []
    with pytest.raises(HTTPException):
        await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 3)
    assert await c.db.scalar(select(func.count()).select_from(AuditLog).where(
        AuditLog.entity_id == c.contract.id, AuditLog.action == 'DELETE_FUEL_PRICE')) == 1
    image = BytesIO()
    Image.new('RGB', (2, 2), color='white').save(image, 'PNG')
    image.seek(0)
    done = await FuelSupplyOrderService(c.db).confirm_order(order['id'], FuelSupplyOrderConfirm(
        odometer_km=100, liters=3, total_amount=25, fuel_type='DIESEL S10'),
        UploadFile(filename='teste.png', file=image, headers=Headers({'content-type': 'image/png'})), c.actor)
    assert done['status'].value == 'COMPLETED'
    assert (await c.service.balances(c.contract.id))['available_balance'] == 75
    assert (await c.service.balances(c.contract.id))['reserved_amount'] == 0


@pytest.mark.asyncio
async def test_scheduled_price_edit_and_delete_preserve_the_surrounding_timeline(pg, monkeypatch):
    from app.services import contract_balance_service as module
    c = pg
    instant = datetime.now(timezone.utc)
    first_date, next_date, new_date = (instant+timedelta(days=n) for n in [7, 14, 10])
    scheduled = await c.service.add_price(c.contract.id, PriceCreate(provider_id=c.provider.id,
        fuel_type='DIESEL S10', unit_price=20, valid_from=first_date), c.actor)
    following = await c.service.add_price(c.contract.id, PriceCreate(provider_id=c.provider.id,
        fuel_type='DIESEL S10', unit_price=30, valid_from=next_date), c.actor)
    edited = await c.service.update_price(c.contract.id, scheduled.id,
        PriceUpdate(unit_price=22, valid_from=new_date), c.actor)
    assert edited.id != scheduled.id and edited.valid_until == next_date
    assert scheduled.valid_until == scheduled.valid_from and scheduled.unit_price == 20
    assert c.price.valid_until == new_date and c.price.unit_price == 10
    monkeypatch.setattr(module, 'utcnow', lambda: instant+timedelta(days=8))
    assert (await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 1))['unit_price'] == 10
    monkeypatch.setattr(module, 'utcnow', lambda: instant+timedelta(days=11))
    assert (await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 1))['unit_price'] == 22
    monkeypatch.setattr(module, 'utcnow', lambda: instant)
    await c.service.delete_price(c.contract.id, edited.id, c.actor)
    assert c.price.valid_until == next_date
    monkeypatch.setattr(module, 'utcnow', lambda: instant+timedelta(days=11))
    assert (await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 1))['unit_price'] == 10
    monkeypatch.setattr(module, 'utcnow', lambda: instant+timedelta(days=15))
    assert (await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 1))['price_id'] == following.id
    history = await c.service.prices(c.contract.id, include_deleted=True)
    assert next(p for p in history if p['id'] == scheduled.id)['status'] == 'REPLACED'
    assert all(p['id'] not in {scheduled.id, edited.id} for p in await c.service.prices(c.contract.id))


@pytest.mark.asyncio
async def test_price_delete_never_reactivates_a_removed_predecessor(pg, monkeypatch):
    from app.services import contract_balance_service as module
    c = pg
    future = datetime.now(timezone.utc)+timedelta(days=7)
    scheduled = await c.service.add_price(c.contract.id, PriceCreate(provider_id=c.provider.id,
        fuel_type='DIESEL S10', unit_price=20, valid_from=future), c.actor)
    await c.service.delete_price(c.contract.id, c.price.id, c.actor)
    await c.service.delete_price(c.contract.id, scheduled.id, c.actor)
    monkeypatch.setattr(module, 'utcnow', lambda: future+timedelta(days=1))
    with pytest.raises(HTTPException):
        await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 1)
    assert not await c.service.prices(c.contract.id)


@pytest.mark.asyncio
async def test_current_price_edit_keeps_the_next_scheduled_price_and_rejects_backdating(pg):
    c = pg
    future = datetime.now(timezone.utc)+timedelta(days=7)
    await c.service.add_price(c.contract.id, PriceCreate(provider_id=c.provider.id,
        fuel_type='DIESEL S10', unit_price=20, valid_from=future), c.actor)
    with pytest.raises(HTTPException):
        await c.service.update_price(c.contract.id, c.price.id,
            PriceUpdate(unit_price=12, valid_from=datetime.now(timezone.utc)-timedelta(days=1)), c.actor)
    with pytest.raises(HTTPException):
        await c.service.update_price(c.contract.id, c.price.id, PriceUpdate(unit_price=12, valid_from=future), c.actor)
    replacement = await c.service.update_price(c.contract.id, c.price.id, PriceUpdate(unit_price=12), c.actor)
    assert replacement.valid_until == future and replacement.unit_price == 12
    assert c.price.unit_price == 10
    with pytest.raises(HTTPException):
        await c.service.update_price(c.contract.id, c.price.id, PriceUpdate(unit_price=13), c.actor)


@pytest.mark.asyncio
async def test_two_edits_of_the_same_price_create_only_one_version(pg):
    c = pg
    async def edit(value):
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            try:
                row = await ContractBalanceService(db).update_price(c.contract.id, c.price.id,
                    PriceUpdate(unit_price=value), c.actor)
                await db.commit()
                return row.id
            except HTTPException as error:
                await db.rollback()
                return error
    outcomes = await asyncio.gather(edit(11), edit(12))
    assert sum(not isinstance(outcome, HTTPException) for outcome in outcomes) == 1
    assert next(outcome for outcome in outcomes if isinstance(outcome, HTTPException)).status_code == 409
    prices = await c.service.prices(c.contract.id)
    assert len(prices) == 2 and sum(p['status'] == 'CURRENT' for p in prices) == 1
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100


@pytest.mark.asyncio
async def test_price_mutation_api_enforces_permissions_contract_and_precision(pg):
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    from httpx import ASGITransport, AsyncClient
    c = pg
    actor = SimpleNamespace(id=c.actor.id, role=UserRole.POSTO, organization_id=None)
    async def session():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            yield db
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: actor
    endpoint = f'/api/contract-control/contracts/{c.contract.id}/prices/{c.price.id}'
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.patch(endpoint, json={'unit_price': '11'})).status_code == 403
            assert (await client.delete(endpoint)).status_code == 403
            app.dependency_overrides[get_current_user_ready] = lambda: c.actor
            assert (await client.patch(endpoint, json={'unit_price': '0'})).status_code == 422
            assert (await client.patch(endpoint, json={'unit_price': '11.1234567'})).status_code == 422
            foreign = endpoint.replace(str(c.contract.id), str(uuid4()))
            assert (await client.patch(foreign, json={'unit_price': '11'})).status_code == 404
            assert (await client.delete(foreign)).status_code == 404
            updated = await client.patch(endpoint, json={'unit_price': '11.123456'})
            assert updated.status_code == 200, updated.text
            replacement_id = updated.json()['id']
            assert replacement_id != str(c.price.id)
            assert (await client.delete(endpoint.rsplit('/', 1)[0]+'/'+replacement_id)).status_code == 200
            detail = (await client.get(f'/api/contract-control/contracts/{c.contract.id}')).json()
            assert any(p['id'] == replacement_id and p['status'] == 'DELETED' for p in detail['prices'])
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_concurrent_requests_cannot_spend_the_same_last_balance(pg):
    c = pg
    go = asyncio.Event()
    async def request():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            await go.wait()
            try:
                r = await ContractBalanceService(db).reserve(contract_id=c.contract.id, provider_id=c.provider.id,
                    source_type='FUEL_ORDER', source_id=uuid4(), vehicle_id=c.vehicle.id,
                    organization_id=None, actor=c.actor, fuel_type='DIESEL S10', liters=Decimal('8.5'))
                await asyncio.sleep(.04)
                await db.commit()
                return str(r.id)
            except HTTPException as exc:
                await db.rollback()
                return exc.status_code
    tasks = [asyncio.create_task(request()), asyncio.create_task(request())]
    go.set()
    results = await asyncio.gather(*tasks)
    assert results.count(409) == 1
    b = await c.service.balances(c.contract.id)
    assert b['available_balance'] == 15 and b['reserved_amount'] == 85


@pytest.mark.asyncio
async def test_same_emission_retried_concurrently_creates_one_order_and_reservation(pg):
    c = pg
    data = order_payload(c)
    async def request():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            return await FuelSupplyOrderService(db).create_order(data, c.actor)
    first, second = await asyncio.gather(request(), request())
    assert first['id'] == second['id']
    assert await c.db.scalar(select(func.count()).select_from(ContractReservation).where(ContractReservation.contract_id == c.contract.id)) == 1
    assert (await c.service.balances(c.contract.id))['available_balance'] == 70


@pytest.mark.asyncio
async def test_batch_insufficiency_rolls_back_every_order_and_reservation(pg):
    c = pg
    second = Vehicle(id=uuid4(), plate='TB'+str(uuid4())[:5].upper(), brand='TESTE', model='TESTE')
    c.db.add(second)
    await c.db.commit()
    data = FuelSupplyOrderBatchCreate(items=[{'vehicle_id':c.vehicle.id,'requested_liters':6},
        {'vehicle_id':second.id,'requested_liters':6}], contract_id=c.contract.id,
        contract_provider_id=c.provider.id, fuel_station_id=c.station.id,
        requested_fuel_type='DIESEL S10', expected_price_id=c.price.id, request_key=uuid4(),
        expires_at=datetime.now(timezone.utc)+timedelta(hours=24))
    contract_id = c.contract.id
    with pytest.raises(HTTPException):
        await FuelSupplyOrderService(c.db).create_batch(data, c.actor)
    assert await c.db.scalar(select(func.count()).select_from(FuelSupplyOrder).where(FuelSupplyOrder.contract_id == contract_id)) == 0
    assert await c.db.scalar(select(func.count()).select_from(ContractReservation).where(ContractReservation.contract_id == contract_id)) == 0
    assert (await c.service.balances(contract_id))['available_balance'] == 100


@pytest.mark.asyncio
async def test_expiration_releases_once_and_reopening_reserves_again(pg):
    c = pg
    order = await FuelSupplyOrderService(c.db).create_order(order_payload(c), c.actor)
    await c.db.execute(update(FuelSupplyOrder).where(FuelSupplyOrder.id == order['id']).values(expires_at=datetime.now(timezone.utc)-timedelta(seconds=5)))
    await c.db.commit()
    await FuelSupplyOrderService(c.db)._expire_overdue_orders()
    await FuelSupplyOrderService(c.db)._expire_overdue_orders()
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100
    await FuelSupplyOrderService(c.db).update_deadline(order['id'], FuelSupplyOrderDeadlineUpdate(
        expires_at=datetime.now(timezone.utc)+timedelta(hours=24), reason='Reabertura conferida para teste'), c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 70


@pytest.mark.asyncio
async def test_ledger_is_immutable_in_postgresql(pg):
    c = pg
    async with AsyncSession(c.engine) as db:
        with pytest.raises(DBAPIError):
            await db.execute(update(ContractMovement).where(ContractMovement.contract_id == c.contract.id).values(balance_delta=9999))
        await db.rollback()
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100


@pytest.mark.asyncio
async def test_direct_maintenance_authorizes_without_starting_and_settles_actual_cost(pg):
    c = pg
    contract = PaymentContract(id=uuid4(), number='MT-'+str(uuid4())[:8], supplier_id=c.supplier.id,
        kind='MAINTENANCE', status='ACTIVE', valid_from=date.today()-timedelta(days=1), valid_until=date.today()+timedelta(days=365))
    c.db.add(contract)
    await c.db.flush()
    provider = await c.service.add_provider(contract.id, ProviderCreate(supplier_id=c.supplier.id), c.actor)
    await c.service.open_control(contract.id, ContractOpening(balance=1000, opening_date=date.today(),
        justification='Saldo fictício de manutenção conferido'), c.actor)
    service = MaintenanceOrderService(c.db)
    order = await service.create(MaintenanceOrderCreate(vehicle_id=c.vehicle.id, contract_id=contract.id,
        provider_id=provider.id, service_description='Troca de óleo e filtros de teste', estimated_cost=500, request_key=uuid4()), c.actor)
    assert order['status'] == 'AUTHORIZED' and order['maintenance_record_id'] is None
    assert (await c.service.balances(contract.id))['available_balance'] == 500
    started = await service.start(order['id'], MaintenanceOrderStart(), c.actor)
    assert started['status'] == 'IN_PROGRESS' and started['maintenance_record_id']
    completed = await service.complete(order['id'], MaintenanceOrderComplete(total_cost=470), c.actor)
    await c.db.commit()
    assert completed['status'] == 'COMPLETED' and completed['total_cost'] == 470
    assert (await c.service.balances(contract.id))['available_balance'] == 530
    assert (await c.service.balances(contract.id))['reserved_amount'] == 0


@pytest.mark.asyncio
async def test_confirmation_and_rectification_adjust_only_the_real_amount(pg, tmp_path, monkeypatch):
    from PIL import Image
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    image = BytesIO()
    Image.new('RGB', (2, 2), color='white').save(image, 'PNG')
    image.seek(0)
    receipt = UploadFile(filename='teste.png', file=image, headers=Headers({'content-type': 'image/png'}))
    order = await FuelSupplyOrderService(c.db).create_order(order_payload(c), c.actor)
    done = await FuelSupplyOrderService(c.db).confirm_order(order['id'], FuelSupplyOrderConfirm(
        supplied_at=datetime.now(timezone.utc), odometer_km=100, liters=3, total_amount=25, fuel_type='DIESEL S10'), receipt, c.actor)
    assert done['status'].value == 'COMPLETED'
    assert (await c.service.balances(c.contract.id))['available_balance'] == 75
    await FuelSupplyService(c.db).rectify(done['supply_id'], FuelSupplyRectify(
        supplied_at=done['supply_supplied_at'], odometer_km=100, liters=3, total_amount=26,
        fuel_type='DIESEL S10', reason='Valor corrigido conforme comprovante do teste'), c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 74
    assert (await c.service.balances(c.contract.id))['reserved_amount'] == 0


@pytest.mark.asyncio
@pytest.mark.parametrize('actual_fuel,actual_liters,actual_amount,changed', [
    ('Etanol', 9, '45.00', True),
    ('Gasolina aditivada', 11, '75.90', True),
    ('Etanol', 18, '124.20', True),
    ('gasolina  comum', 10, '61.00', False),
])
async def test_confirmation_records_actual_fuel_without_repricing_or_double_debit(
        pg, tmp_path, monkeypatch, actual_fuel, actual_liters, actual_amount, changed):
    from PIL import Image
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    price = await c.service.add_price(c.contract.id, PriceCreate(provider_id=c.provider.id,
        fuel_type='GASOLINA COMUM', unit_price=Decimal('6.10'),
        valid_from=datetime.now(timezone.utc)-timedelta(seconds=10)), c.actor)
    data = order_payload(c, liters=10).model_copy(update={
        'requested_fuel_type': 'GASOLINA COMUM', 'expected_price_id': price.id})
    service = FuelSupplyOrderService(c.db)
    order = await service.create_order(data, c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == Decimal('39')
    image = BytesIO()
    Image.new('RGB', (2, 2), color='white').save(image, 'PNG')
    actuals = dict(odometer_km=100, liters=actual_liters, total_amount=actual_amount,
                  fuel_type=actual_fuel, supplied_at=datetime.now(timezone.utc).isoformat())
    async def session():
        yield c.db
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: c.actor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            endpoint = f"/api/fuel-supply-orders/{order['id']}/confirm"
            response = await client.post(endpoint, data=actuals, files={'receipt': ('teste.png', image.getvalue(), 'image/png')})
            assert response.status_code == 200, response.text
            done = response.json()
            repeated = await client.post(endpoint, data=actuals, files={'receipt': ('teste.png', image.getvalue(), 'image/png')})
            assert repeated.status_code == 409
    finally:
        app.dependency_overrides.clear()
    assert done['requested_fuel_type'] == 'GASOLINA COMUM'
    assert done['requested_liters'] == 10
    assert done['supply_fuel_type'] == actual_fuel
    assert done['supply_liters'] == actual_liters
    assert Decimal(str(done['supply_total_amount'])) == Decimal(actual_amount)
    balance = await c.service.balances(c.contract.id)
    assert balance['available_balance'] == Decimal('100')-Decimal(actual_amount)
    assert balance['reserved_amount'] == 0
    assert balance['consumed_since_opening'] == Decimal(actual_amount)
    assert balance['divergence_open'] == (Decimal(actual_amount) > 100)
    reservation = await c.db.scalar(select(ContractReservation).where(ContractReservation.source_id == order['id']))
    assert reservation.fuel_type == 'GASOLINA COMUM'
    assert reservation.price_id == price.id and reservation.unit_price == Decimal('6.10')
    counts = dict((await c.db.execute(select(ContractMovement.movement_type, func.count())
        .where(ContractMovement.contract_id == c.contract.id).group_by(ContractMovement.movement_type))).all())
    assert counts['RESERVE'] == counts['CONSUMPTION'] == 1
    audit = await c.db.scalar(select(AuditLog).where(AuditLog.entity_id == order['id'], AuditLog.action == 'ORDER_CONFIRMED'))
    assert audit.details['fuel_type_changed'] == changed
    assert audit.details['requested_fuel_type'] == 'GASOLINA COMUM'
    assert audit.details['fuel_type'] == actual_fuel
    assert audit.details['requested_liters'] == 10 and audit.details['liters'] == actual_liters
    assert Decimal(str(audit.details['total_amount'])) == Decimal(actual_amount)
    if balance['divergence_open']:
        with pytest.raises(HTTPException) as exc:
            await service.create_order(order_payload(c), c.actor)
        assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_cancellation_releases_budget_without_deleting_financial_history(pg):
    c = pg
    service = FuelSupplyOrderService(c.db)
    order = await service.create_order(order_payload(c), c.actor)
    await service.cancel_order(order['id'], FuelSupplyOrderCancel(reason='Pedido cancelado para teste'), c.actor)
    with pytest.raises(HTTPException):
        await service.cancel_order(order['id'], FuelSupplyOrderCancel(reason='Repetição do cancelamento'), c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100
    counts = dict((await c.db.execute(select(ContractMovement.movement_type, func.count())
        .where(ContractMovement.contract_id == c.contract.id).group_by(ContractMovement.movement_type))).all())
    assert counts['RESERVE'] == counts['RELEASE'] == 1


@pytest.mark.asyncio
async def test_funded_projection_uses_strictly_linked_consumption_not_name_matching(pg):
    from app.services.payment_process_service import PaymentProcessService
    from unittest.mock import AsyncMock
    c = pg
    r = await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id,
        source_type='FUEL_ORDER', source_id=uuid4(), vehicle_id=c.vehicle.id, organization_id=None,
        actor=c.actor, fuel_type='DIESEL S10', liters=3)
    await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=uuid4(), amount=25,
        occurred_at=datetime.now(timezone.utc), actor=c.actor)
    service = PaymentProcessService(c.db)
    service.repository.list_fuel_operations_for_supplier = AsyncMock(side_effect=AssertionError('Inferred operations must not affect funded contracts'))
    detail = await service.contract_management(c.contract.id, current_user=c.actor)
    assert detail['contract']['consumed_amount'] == 25
    assert detail['average_monthly_consumption'] == 25
    assert len(detail['related_operations']) == 1


@pytest.mark.asyncio
async def test_api_permissions_and_empty_operator_scope_do_not_leak_finances(pg):
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    from httpx import ASGITransport, AsyncClient
    c = pg
    actor = SimpleNamespace(id=c.actor.id, role=UserRole.POSTO, organization_id=None)
    async def session():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            yield db
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: actor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.get('/api/contract-control/contracts')).status_code == 403
            assert (await client.get('/api/contract-control/eligible?kind=FUEL')).status_code == 403
            actor.role = UserRole.PRODUCAO
            response = await client.get('/api/contract-control/contracts')
            assert response.status_code == 200 and response.json()['data'] == []
            assert (await client.get('/api/contract-control/eligible?kind=FUEL')).json() == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_api_contract_balances_quotes_and_secretaria_drilldown(pg):
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    from httpx import ASGITransport, AsyncClient
    c = pg
    organizations = [Organization(id=uuid4(), name='Secretaria teste '+str(uuid4())[:8]) for _ in range(2)]
    c.db.add_all(organizations)
    await c.db.flush()
    for org, amount in zip(organizations, [25, 30]):
        reservation = await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id,
            source_type='FUEL_ORDER', source_id=uuid4(), vehicle_id=c.vehicle.id, organization_id=org.id,
            actor=c.actor, fuel_type='DIESEL S10', liters=3)
        await c.service.settle(reservation.id, source_type='FUEL_SUPPLY', source_id=uuid4(), amount=amount,
            occurred_at=datetime.now(timezone.utc), actor=c.actor)
    await c.db.commit()
    actor = SimpleNamespace(id=c.actor.id, role=UserRole.ADMIN, organization_id=None)
    async def session():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            yield db
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: actor
    root = f'/api/contract-control/contracts/{c.contract.id}'
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            overview = await client.get('/api/contract-control/contracts', params={'search': c.contract.number})
            assert overview.status_code == 200
            assert overview.json()['totals']['available_balance'] == 45
            assert overview.json()['indicators']['consumed'] == 1
            detail = await client.get(root)
            assert detail.status_code == 200 and detail.json()['contract']['consumed_since_opening'] == 55
            quote = await client.post(root+'/quote', json={'provider_id': str(c.provider.id), 'fuel_type': 'DIESEL S10', 'liters': '2'})
            assert quote.status_code == 200 and quote.json()['reserve_amount'] == 20
            actor.role, actor.organization_id = UserRole.PRODUCAO, organizations[0].id
            operations = await client.get(root+'/operations', params={'organization_id': str(organizations[1].id)})
            assert operations.status_code == 200 and operations.json()['total'] == 1
            assert operations.json()['data'][0]['amount'] == 25
            ledger = await client.get(root+'/movements')
            assert ledger.status_code == 200 and ledger.json()['total'] == 2
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_amendment_applies_once_and_funded_limits_cannot_be_overwritten(pg):
    from app.schemas.payment_process import PaymentContractAmendmentCreate, PaymentContractUpdate
    from app.services.payment_process_service import PaymentProcessService
    c = pg
    service = PaymentProcessService(c.db)
    amendment = PaymentContractAmendmentCreate(number='TEST-001', value_delta=50,
        notes='Acréscimo fictício conferido no teste')
    await service.create_contract_amendment(c.contract.id, amendment, c.actor)
    await service.create_contract_amendment(c.contract.id, amendment, c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 150
    with pytest.raises(HTTPException):
        await service.update_contract(c.contract.id, PaymentContractUpdate(value_updated=99999), c.actor)


@pytest.mark.asyncio
async def test_legacy_order_requires_explicit_funding_and_adoption_reserves_once(pg):
    c = pg
    legacy = FuelSupplyOrder(id=uuid4(), vehicle_id=c.vehicle.id, fuel_station_id=c.station.id,
        created_by_user_id=c.actor.id, validation_code=uuid4().hex[:24],
        expires_at=datetime.now(timezone.utc)+timedelta(hours=12))
    c.db.add(legacy)
    await c.db.commit()
    service = FuelSupplyOrderService(c.db)
    with pytest.raises(HTTPException) as error:
        await service.confirm_order(legacy.id, FuelSupplyOrderConfirm(odometer_km=100, liters=3,
            total_amount=30, fuel_type='DIESEL S10'), None, c.actor)
    assert error.value.status_code == 409 and 'legado' in error.value.detail
    funding = FuelOrderFunding(contract_id=c.contract.id, contract_provider_id=c.provider.id,
        requested_fuel_type='DIESEL S10', requested_liters=3, expected_price_id=c.price.id,
        justification='Vínculo explícito conferido no teste')
    first = await service.adopt_funding(legacy.id, funding, c.actor)
    second = await service.adopt_funding(legacy.id, funding, c.actor)
    assert first['contract_reservation_id'] == second['contract_reservation_id']
    assert (await c.service.balances(c.contract.id))['reserved_amount'] == 30


@pytest.mark.asyncio
async def test_expired_contract_and_unconfirmed_opening_block_emission(pg):
    c = pg
    contract_id, supplier_id, vehicle_id, provider_id, actor_id = c.contract.id, c.supplier.id, c.vehicle.id, c.provider.id, c.actor.id
    c.contract.valid_until = date.today()-timedelta(days=1)
    await c.db.commit()
    with pytest.raises(HTTPException) as error:
        await FuelSupplyOrderService(c.db).create_order(order_payload(c), c.actor)
    assert error.value.status_code == 409
    assert (await c.service.balances(contract_id))['reserved_amount'] == 0
    await c.db.rollback()
    actor = await c.db.get(User, actor_id)
    new_contract = PaymentContract(id=uuid4(), number='PENDING-'+str(uuid4())[:8], supplier_id=supplier_id,
        kind='FUEL', status='ACTIVE', valid_from=date.today(), valid_until=date.today()+timedelta(days=60))
    c.db.add(new_contract)
    await c.db.flush()
    with pytest.raises(HTTPException) as error:
        await c.service.reserve(contract_id=new_contract.id, provider_id=provider_id, source_type='FUEL_ORDER',
            source_id=uuid4(), vehicle_id=vehicle_id, organization_id=None, actor=actor, fuel_type='DIESEL S10', liters=3)
    assert 'Saldo inicial' in error.value.detail
