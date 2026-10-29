from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import MetaData, func, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.db.base import Base
from app.models.contract_balance import (ContractControl, ContractFuelPrice, ContractMovement,
    ContractOperation, ContractProvider, ContractReconciliation, ContractReservation)
from app.models.fuel_station import FuelStation
from app.models.fuel_supply_order import FuelSupplyOrder
from app.models.payment_process import PaymentContract, PaymentProcess, PaymentSupplier
from app.models.user import UserRole
from app.schemas.contract_balance import BalanceCorrection, ContractOpening, PriceCreate, ProviderCreate, ReconcileProcess
from app.services.contract_balance_service import ContractBalanceService, money


@pytest_asyncio.fixture
async def context():
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    tables = [PaymentSupplier, PaymentContract, FuelStation, ContractControl, ContractProvider,
        ContractFuelPrice, ContractReservation, ContractOperation, ContractMovement,
        ContractReconciliation, PaymentProcess, FuelSupplyOrder]
    portable = MetaData()
    for table in Base.metadata.tables.values():
        clone = table.to_metadata(portable)
        for column in clone.columns:
            column.server_default = None
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync: portable.create_all(sync, tables=[portable.tables[t.__tablename__] for t in tables]))
    async with AsyncSession(engine, expire_on_commit=False) as db:
        now = datetime.now(timezone.utc)
        actor = SimpleNamespace(id=uuid4(), role=UserRole.SUPERUSER, organization_id=None)
        supplier = PaymentSupplier(id=uuid4(), name='Prestador Teste', active=True, created_at=now, updated_at=now)
        station = FuelStation(id=uuid4(), name='Posto Teste', address='Endereço de teste', active=True,
                              created_at=now, updated_at=now)
        contract = PaymentContract(id=uuid4(), supplier_id=supplier.id, number='CT-TEST', kind='FUEL',
            valid_from=date.today()-timedelta(days=30), valid_until=date.today()+timedelta(days=365),
            status='ACTIVE', value_updated=Decimal('10000'), created_at=now, updated_at=now)
        db.add_all([supplier, station, contract])
        await db.flush()
        service = ContractBalanceService(db)
        service.audit.record = AsyncMock()
        provider = await service.add_provider(contract.id, ProviderCreate(supplier_id=supplier.id, fuel_station_id=station.id), actor)
        price = await service.add_price(contract.id, PriceCreate(provider_id=provider.id, fuel_type='Diesel S10',
            unit_price=Decimal('6.123456'), valid_from=now-timedelta(seconds=5)), actor)
        await service.open_control(contract.id, ContractOpening(balance=Decimal('10000'), opening_date=date.today(),
            justification='Saldo inicial conferido para o teste'), actor)
        yield SimpleNamespace(db=db, service=service, actor=actor, contract=contract, provider=provider,
                              price=price, station=station, vehicle=uuid4(), organization=uuid4())
    await engine.dispose()


async def reserve(c, liters='100', source_id=None):
    return await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id,
        source_type='FUEL_ORDER', source_id=source_id or uuid4(), vehicle_id=c.vehicle,
        organization_id=c.organization, actor=c.actor, fuel_type='diesel s10', liters=Decimal(liters),
        station_id=c.station.id, expected_price_id=c.price.id)


@pytest.mark.asyncio
async def test_balance_correction_preserves_reservations_consumption_and_history(context):
    c = context
    await reserve(c, liters='100')
    before = await c.service.balances(c.contract.id)
    data = BalanceCorrection(target_available_balance='6835.50', expected_available_balance=before['available_balance'],
        request_key=uuid4(), justification='Correção de erro de digitação no saldo')
    movement = await c.service.correct_balance(c.contract.id, data, c.actor)
    after = await c.service.balances(c.contract.id)
    assert after['available_balance'] == Decimal('6835.50')
    assert after['reserved_amount'] == before['reserved_amount']
    assert after['consumed_since_opening'] == before['consumed_since_opening']
    assert after['opening_balance'] == before['opening_balance']
    assert movement.details['available_before'] == str(before['available_balance'])
    assert movement.details['available_after'] == '6835.50'
    assert (await c.service.correct_balance(c.contract.id, data, c.actor)).id == movement.id
    assert (await c.service.balances(c.contract.id)) == after
    with pytest.raises(HTTPException) as conflict:
        await c.service.correct_balance(c.contract.id, data.model_copy(update={'target_available_balance': Decimal('8000')}), c.actor)
    assert conflict.value.status_code == 409


@pytest.mark.asyncio
async def test_balance_correction_rejects_stale_preview_and_no_change(context):
    c = context
    data = BalanceCorrection(target_available_balance=9000, expected_available_balance=10000,
        request_key=uuid4(), justification='Correção conferida pelo gestor')
    await reserve(c)
    with pytest.raises(HTTPException) as stale:
        await c.service.correct_balance(c.contract.id, data, c.actor)
    assert stale.value.status_code == 409
    balance = await c.service.balances(c.contract.id)
    with pytest.raises(HTTPException) as unchanged:
        await c.service.correct_balance(c.contract.id, data.model_copy(update={
            'target_available_balance': balance['available_balance'], 'expected_available_balance': balance['available_balance']}), c.actor)
    assert unchanged.value.status_code == 422


@pytest.mark.asyncio
async def test_reservation_reduces_available_but_not_consumed_and_real_cost_releases_surplus(context):
    c = context
    reservation = await reserve(c)
    balance = await c.service.balances(c.contract.id)
    assert balance['contractual_balance'] == Decimal('10000')
    assert balance['available_balance'] == Decimal('9387.65')
    assert balance['consumed_since_opening'] == 0
    await c.service.settle(reservation.id, source_type='FUEL_SUPPLY', source_id=uuid4(),
                           amount='470.00', occurred_at=datetime.now(timezone.utc), actor=c.actor)
    balance = await c.service.balances(c.contract.id)
    assert balance['available_balance'] == Decimal('9530')
    assert balance['reserved_amount'] == 0
    assert balance['consumed_since_opening'] == 470


@pytest.mark.asyncio
async def test_insufficient_balance_rejects_without_an_extra_ledger_entry(context):
    c = context
    with pytest.raises(HTTPException) as error:
        await reserve(c, liters='2000')
    assert error.value.status_code == 409
    assert await c.db.scalar(select(func.count()).select_from(ContractReservation)) == 0
    assert (await c.service.balances(c.contract.id))['available_balance'] == 10000


@pytest.mark.asyncio
async def test_release_and_settlement_are_idempotent(context):
    c = context
    source = uuid4()
    r = await reserve(c, source_id=source)
    repeated = await reserve(c, source_id=source)
    assert repeated.id == r.id
    assert await c.service.release(r.id, actor=c.actor, reason='Pedido cancelado')
    assert not await c.service.release(r.id, actor=c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 10000
    reopened = await reserve(c, source_id=source)
    assert reopened.generation == 2
    actual = uuid4()
    first = await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=actual, amount=500,
                                  occurred_at=datetime.now(timezone.utc), actor=c.actor)
    again = await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=actual, amount=500,
                                  occurred_at=datetime.now(timezone.utc), actor=c.actor)
    assert first.id == again.id
    assert (await c.service.balances(c.contract.id))['available_balance'] == 9500


@pytest.mark.asyncio
async def test_real_overspend_is_recorded_and_blocks_new_requests_until_regularization(context):
    c = context
    r = await reserve(c)
    await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=uuid4(), amount=11000,
                           occurred_at=datetime.now(timezone.utc), actor=c.actor)
    b = await c.service.balances(c.contract.id)
    assert b['available_balance'] == -1000 and b['divergence_open']
    with pytest.raises(HTTPException):
        await reserve(c)
    with pytest.raises(HTTPException):
        await c.service.resolve_divergence(c.contract.id, 'Conferência da divergência', c.actor)
    await c.service.adjust(c.contract.id, amount=2000, request_key=uuid4(), reason='Aditivo regularizado', actor=c.actor)
    with pytest.raises(HTTPException):
        await reserve(c)
    await c.service.resolve_divergence(c.contract.id, 'Saldo recomposto e conferido', c.actor)
    assert (await reserve(c, liters='1')).status == 'HELD'


@pytest.mark.asyncio
async def test_rectification_only_posts_the_difference_and_legacy_is_untouched(context):
    c = context
    r = await reserve(c)
    actual = uuid4()
    await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=actual, amount=500,
                           occurred_at=datetime.now(timezone.utc), actor=c.actor)
    await c.service.rectify_operation('FUEL_SUPPLY', actual, amount=450, actor=c.actor, reason='Comprovante corrigido')
    await c.service.rectify_operation('FUEL_SUPPLY', actual, amount=450, actor=c.actor, reason='Repetição sem diferença')
    assert (await c.service.balances(c.contract.id))['available_balance'] == 9550
    assert await c.service.rectify_operation('FUEL_SUPPLY', uuid4(), amount=1000, actor=c.actor, reason='Histórico') is None
    assert (await c.service.balances(c.contract.id))['available_balance'] == 9550


@pytest.mark.asyncio
async def test_price_version_does_not_change_existing_reservation_and_stale_preview_is_rejected(context):
    c = context
    r = await reserve(c)
    new = await c.service.add_price(c.contract.id, PriceCreate(provider_id=c.provider.id,
        fuel_type='DIESEL S10', unit_price=Decimal('7.5')), c.actor)
    assert r.unit_price == Decimal('6.123456')
    with pytest.raises(HTTPException) as error:
        await reserve(c)
    assert 'preço mudou' in error.value.detail
    quote = await c.service.quote(c.contract.id, c.provider.id, 'DIESEL S10', Decimal('100'))
    assert quote['price_id'] == new.id and quote['reserve_amount'] == 750


@pytest.mark.asyncio
async def test_invoice_reconciliation_never_debits_an_operation_twice(context):
    c = context
    r = await reserve(c)
    op = await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=uuid4(), amount=500,
                               occurred_at=datetime.now(timezone.utc), actor=c.actor)
    now = datetime.now(timezone.utc)
    invoice = PaymentProcess(id=uuid4(), import_key=str(uuid4()), process_number='NF-TEST',
        kind='FUEL', stage='ASSEMBLY', contract_id=c.contract.id, supplier_id=c.contract.supplier_id,
        organization_id=c.organization, amount=Decimal('500'), created_at=now, updated_at=now)
    c.db.add(invoice)
    await c.db.flush()
    data = ReconcileProcess(operation_ids=[op.id])
    await c.service.reconcile(invoice.id, data, c.actor)
    await c.service.reconcile(invoice.id, data, c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 9500
    invoice.amount = Decimal('520')
    with pytest.raises(HTTPException):
        await c.service.reconcile(invoice.id, data, c.actor)
    await c.service.reconcile(invoice.id, ReconcileProcess(operation_ids=[op.id], justification='Diferença de taxa documentada'), c.actor)
    assert (await c.service.balances(c.contract.id))['available_balance'] == 9480
    invoice.stage = 'CANCELLED'
    await c.db.flush()
    assert (await c.service.balances(c.contract.id))['available_balance'] == 9480


@pytest.mark.asyncio
async def test_opening_cannot_be_overwritten_and_request_cannot_use_another_station(context):
    c = context
    with pytest.raises(HTTPException):
        await c.service.open_control(c.contract.id, ContractOpening(balance=20000, opening_date=date.today(),
            justification='Não pode sobrescrever abertura'), c.actor)
    with pytest.raises(HTTPException):
        await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id,
            source_type='FUEL_ORDER', source_id=uuid4(), vehicle_id=c.vehicle,
            organization_id=c.organization, actor=c.actor, fuel_type='DIESEL S10', liters=10, station_id=uuid4())


def test_money_rounds_half_up_with_decimal_precision():
    assert money(Decimal('0.105')) == Decimal('0.11')


@pytest.mark.asyncio
async def test_batch_preview_sums_each_orders_rounded_commitment(context):
    c = context
    quote = await c.service.quote(c.contract.id, c.provider.id, 'Diesel S10', Decimal('0.002'),
        item_liters=[Decimal('0.001'), Decimal('0.001')])
    assert quote['reserve_amount'] == Decimal('0.02')
    with pytest.raises(HTTPException):
        await c.service.quote(c.contract.id, c.provider.id, 'Diesel S10', Decimal('0.2'), item_liters=[Decimal('0.1')])
