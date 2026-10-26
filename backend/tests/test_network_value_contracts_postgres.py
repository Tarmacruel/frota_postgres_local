import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
import os
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from test_contract_balances_postgres import pg, order_payload
from app.core.config import settings
from app.models.contract_balance import ContractMovement, ContractOperation, ContractReservation
from app.models.payment_process import PaymentContract, PaymentProcess
from app.models.vehicle import Vehicle
from app.schemas.contract_balance import ReconcileProcess
from app.schemas.fuel_supply import FuelSupplyOrderBatchCreate, FuelSupplyOrderCancel, FuelSupplyOrderConfirm, FuelSupplyOrderDeadlineUpdate, FuelSupplyRectify
from app.services.contract_balance_service import ContractBalanceService
from app.services.fuel_supply_order_service import FuelSupplyOrderService
from app.services.fuel_supply_service import FuelSupplyService

pytestmark = pytest.mark.skipif(not os.getenv('CONTRACT_TEST_DATABASE_URL'), reason='Requires disposable PostgreSQL database')


def receipt():
    from PIL import Image
    stream = BytesIO()
    Image.new('RGB', (2, 2), color='white').save(stream, 'PNG')
    stream.seek(0)
    return UploadFile(filename='teste.png', file=stream, headers=Headers({'content-type': 'image/png'}))


async def network(c):
    await c.service.delete_price(c.contract.id, c.price.id, c.actor)
    c.contract.fuel_pricing_mode = 'NETWORK_VALUE'
    await c.db.commit()
    return order_payload(c).model_copy(update={'expected_price_id': None})


def confirmation(amount=25, odometer=100):
    return FuelSupplyOrderConfirm(odometer_km=odometer, liters=3, total_amount=amount, fuel_type='DIESEL S10')


@pytest.mark.asyncio
async def test_network_order_has_no_price_reservation_or_financial_effect_until_confirmation(pg, tmp_path, monkeypatch):
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    payload = await network(c)
    assert await c.service.errors(c.contract) == []
    eligible = await c.service.eligible(kind='FUEL', station_id=c.station.id)
    assert next(row for row in eligible if row['id'] == c.contract.id)['prices'] == []
    quote = await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', 3)
    assert quote['price_id'] is None and quote['unit_price'] is None and quote['reserve_amount'] == 0
    before = await c.service.balances(c.contract.id)
    service = FuelSupplyOrderService(c.db)
    order = await service.create_order(payload, c.actor)
    assert order['contract_funding_mode'] == 'NETWORK_VALUE' and order['contract_reservation_id'] is None
    assert order['contract_funding']['status'] == 'UNRESERVED' and order['max_amount'] is None
    assert await c.service.balances(c.contract.id) == before
    assert (await service.create_order(payload, c.actor))['id'] == order['id']
    assert await c.db.scalar(select(func.count()).select_from(ContractReservation).where(ContractReservation.contract_id == c.contract.id)) == 0
    done = await service.confirm_order(order['id'], confirmation(), receipt(), c.actor)
    assert done['status'].value == 'COMPLETED'
    after = await c.service.balances(c.contract.id)
    assert after['available_balance'] == 75 and after['reserved_amount'] == 0 and after['consumed_since_opening'] == 25
    with pytest.raises(HTTPException) as repeat:
        await service.confirm_order(order['id'], confirmation(), receipt(), c.actor)
    assert repeat.value.status_code == 409
    assert await c.db.scalar(select(func.count()).select_from(ContractOperation).where(ContractOperation.contract_id == c.contract.id)) == 1


@pytest.mark.asyncio
async def test_network_batch_cancel_expire_and_reopen_never_reserve_money(pg):
    c = pg
    payload = await network(c)
    second = Vehicle(id=uuid4(), plate='NV'+str(uuid4())[:5].upper(), brand='TESTE', model='FICTICIO')
    c.db.add(second)
    await c.db.commit()
    batch = FuelSupplyOrderBatchCreate(**payload.model_dump(exclude={'vehicle_id', 'requested_liters'}),
        items=[{'vehicle_id': c.vehicle.id, 'requested_liters': 3}, {'vehicle_id': second.id, 'requested_liters': 5}])
    service = FuelSupplyOrderService(c.db)
    result = await service.create_batch(batch, c.actor)
    assert result['created_count'] == 2
    assert (await service.create_batch(batch, c.actor))['created_count'] == 2
    first, other = result['orders']
    await service.cancel_order(first['id'], FuelSupplyOrderCancel(reason='Cancelamento de teste'), c.actor)
    from app.models.fuel_supply_order import FuelSupplyOrder
    row = await c.db.get(FuelSupplyOrder, other['id'])
    row.expires_at = datetime.now(timezone.utc)-timedelta(minutes=1)
    await c.db.commit()
    assert (await service.get_order(other['id'], current_user=c.actor))['status'].value == 'EXPIRED'
    reopened = await service.update_deadline(other['id'], FuelSupplyOrderDeadlineUpdate(
        expires_at=datetime.now(timezone.utc)+timedelta(hours=24), reason='Reabertura de teste sem reserva'), c.actor)
    assert reopened['contract_funding_mode'] == 'NETWORK_VALUE' and reopened['contract_reservation_id'] is None
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100
    assert await c.db.scalar(select(func.count()).select_from(ContractMovement).where(
        ContractMovement.contract_id == c.contract.id, ContractMovement.movement_type.in_(['RESERVE','RELEASE','CONSUMPTION']))) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize('original', ['FIXED_PRICE', 'NETWORK_VALUE'])
async def test_existing_order_keeps_its_original_policy_when_contract_changes(pg, tmp_path, monkeypatch, original):
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    payload = await network(c) if original == 'NETWORK_VALUE' else order_payload(c)
    service = FuelSupplyOrderService(c.db)
    order = await service.create_order(payload, c.actor)
    assert order['contract_funding_mode'] == original
    c.contract.fuel_pricing_mode = 'FIXED_PRICE' if original == 'NETWORK_VALUE' else 'NETWORK_VALUE'
    await c.db.commit()
    await service.confirm_order(order['id'], confirmation(), receipt(), c.actor)
    balance = await c.service.balances(c.contract.id)
    assert balance['available_balance'] == 75 and balance['reserved_amount'] == 0


@pytest.mark.asyncio
async def test_network_rectification_and_invoice_reconciliation_do_not_duplicate_consumption(pg, tmp_path, monkeypatch):
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    payload = await network(c)
    service = FuelSupplyOrderService(c.db)
    order = await service.create_order(payload, c.actor)
    done = await service.confirm_order(order['id'], confirmation(), receipt(), c.actor)
    now = datetime.now(timezone.utc)
    data = FuelSupplyRectify(supplied_at=now, odometer_km=100, liters=3, total_amount=30, fuel_type='DIESEL S10', reason='Correção do comprovante conferido')
    await FuelSupplyService(c.db).rectify(done['supply_id'], data, c.actor)
    with pytest.raises(HTTPException) as unchanged:
        await FuelSupplyService(c.db).rectify(done['supply_id'], data, c.actor)
    assert unchanged.value.status_code == 400
    assert (await c.service.balances(c.contract.id))['available_balance'] == 70
    operation = await c.db.scalar(select(ContractOperation).where(ContractOperation.source_id == done['supply_id']))
    invoice = PaymentProcess(id=uuid4(), import_key=str(uuid4()), process_number='NV-'+str(uuid4())[:8],
        kind='FUEL', stage='ASSEMBLY', contract_id=c.contract.id, supplier_id=c.supplier.id, amount=30)
    c.db.add(invoice)
    await c.db.flush()
    await c.service.reconcile(invoice.id, ReconcileProcess(operation_ids=[operation.id]), c.actor)
    await c.service.reconcile(invoice.id, ReconcileProcess(operation_ids=[operation.id]), c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 70


@pytest.mark.asyncio
async def test_concurrent_network_confirmations_record_real_expenses_and_flag_overdraw(pg, tmp_path, monkeypatch):
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    payload = await network(c)
    service = FuelSupplyOrderService(c.db)
    orders = [await service.create_order(payload, c.actor), await service.create_order(payload.model_copy(update={'request_key': uuid4()}), c.actor)]
    async def confirm(order, odometer):
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            return await FuelSupplyOrderService(db).confirm_order(order['id'], confirmation(60, odometer), receipt(), c.actor)
    await asyncio.gather(confirm(orders[0], 100), confirm(orders[1], 200))
    balance = await c.service.balances(c.contract.id)
    assert balance['available_balance'] == -20 and balance['reserved_amount'] == 0 and balance['consumed_since_opening'] == 120
    assert balance['divergence_open'] is True
    with pytest.raises(HTTPException) as blocked:
        await service.create_order(payload.model_copy(update={'request_key': uuid4()}), c.actor)
    assert blocked.value.status_code == 409


@pytest.mark.asyncio
async def test_fixed_price_order_still_requires_price_preview_and_network_rejects_price_registration(pg):
    from app.schemas.contract_balance import PriceCreate
    c = pg
    contract_id, provider_id = c.contract.id, c.provider.id
    with pytest.raises(HTTPException) as missing:
        await FuelSupplyOrderService(c.db).create_order(order_payload(c).model_copy(update={'expected_price_id': None}), c.actor)
    assert missing.value.status_code == 422
    await c.db.rollback()
    # Reload fixture objects after rollback before using them again.
    contract = await c.db.get(PaymentContract, contract_id)
    contract.fuel_pricing_mode = 'NETWORK_VALUE'
    await c.db.commit()
    with pytest.raises(HTTPException) as rejected:
        await c.service.add_price(contract.id, PriceCreate(provider_id=provider_id, fuel_type='DIESEL S10', unit_price=10), c.actor)
    assert rejected.value.status_code == 409


@pytest.mark.asyncio
async def test_concurrent_confirmation_of_same_network_order_consumes_once(pg, tmp_path, monkeypatch):
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    payload = await network(c)
    order = await FuelSupplyOrderService(c.db).create_order(payload, c.actor)
    async def confirm():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            try:
                await FuelSupplyOrderService(db).confirm_order(order['id'], confirmation(), receipt(), c.actor)
                return 200
            except HTTPException as error:
                await db.rollback()
                return error.status_code
    assert sorted(await asyncio.gather(confirm(), confirm())) == [200, 409]
    balance = await c.service.balances(c.contract.id)
    assert balance['available_balance'] == 75 and balance['consumed_since_opening'] == 25


@pytest.mark.asyncio
async def test_direct_legacy_network_record_if_enabled_debits_only_actual_value(pg, tmp_path, monkeypatch):
    from app.schemas.fuel_supply import FuelSupplyCreate
    c = pg
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    monkeypatch.setattr(settings, 'ENABLE_LEGACY_FUEL_SUPPLY_CREATE', True)
    await network(c)
    data = FuelSupplyCreate(vehicle_id=c.vehicle.id, contract_id=c.contract.id, contract_provider_id=c.provider.id,
        fuel_station_id=c.station.id, request_key=uuid4(), odometer_km=100, liters=3, total_amount=27, fuel_type='DIESEL S10')
    service = FuelSupplyService(c.db)
    record = await service.create(data, receipt(), c.actor)
    assert (await service.create(data, receipt(), c.actor))['id'] == record['id']
    balance = await c.service.balances(c.contract.id)
    assert balance['available_balance'] == 73 and balance['reserved_amount'] == 0 and balance['consumed_since_opening'] == 27


@pytest.mark.asyncio
async def test_contract_mode_api_permissions_audit_and_readiness_without_price(pg):
    from types import SimpleNamespace
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    from app.models.user import UserRole
    from app.models.audit_log import AuditLog
    c = pg
    await c.service.delete_price(c.contract.id, c.price.id, c.actor)
    await c.db.commit()
    async def session():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            yield db
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: SimpleNamespace(id=c.actor.id, role=UserRole.POSTO, organization_id=None)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            endpoint = f'/api/payment-contracts/{c.contract.id}'
            assert (await client.put(endpoint, json={'fuel_pricing_mode': 'NETWORK_VALUE'})).status_code == 403
            app.dependency_overrides[get_current_user_ready] = lambda: c.actor
            assert (await client.put(endpoint, json={'fuel_pricing_mode': 'UNKNOWN'})).status_code == 422
            response = await client.put(endpoint, json={'fuel_pricing_mode': 'NETWORK_VALUE'})
            assert response.status_code == 200, response.text
            assert response.json()['fuel_pricing_mode'] == 'NETWORK_VALUE'
            overview = (await client.get('/api/contract-control/contracts', params={'search': c.contract.number})).json()
            assert overview['data'][0]['ready'] is True and overview['data'][0]['eligibility_errors'] == []
            audit = await c.db.scalar(select(AuditLog).where(AuditLog.entity_id == c.contract.id, AuditLog.action == 'UPDATE'))
            assert audit.details['fuel_pricing_mode_before'] == 'FIXED_PRICE'
            assert audit.details['fuel_pricing_mode_after'] == 'NETWORK_VALUE'
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_adopt_legacy_order_into_network_without_reserve_and_prevent_relink(pg):
    from app.models.fuel_supply_order import FuelSupplyOrder
    from app.schemas.contract_balance import FuelOrderFunding
    c = pg
    await network(c)
    row = FuelSupplyOrder(id=uuid4(), vehicle_id=c.vehicle.id, fuel_station_id=c.station.id,
        validation_code=str(uuid4()).replace('-', '')[:24], expires_at=datetime.now(timezone.utc)+timedelta(hours=24),
        created_by_user_id=c.actor.id)
    c.db.add(row)
    await c.db.commit()
    data = FuelOrderFunding(contract_id=c.contract.id, contract_provider_id=c.provider.id,
        requested_fuel_type='DIESEL S10', requested_liters=3)
    service = FuelSupplyOrderService(c.db)
    saved = await service.adopt_funding(row.id, data, c.actor)
    assert saved['contract_funding_mode'] == 'NETWORK_VALUE' and saved['contract_reservation_id'] is None
    assert (await service.adopt_funding(row.id, data, c.actor))['id'] == saved['id']
    with pytest.raises(HTTPException) as relink:
        await service.adopt_funding(row.id, data.model_copy(update={'contract_id': uuid4()}), c.actor)
    assert relink.value.status_code == 409
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100
