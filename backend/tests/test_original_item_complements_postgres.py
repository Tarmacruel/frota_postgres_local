"""Original omitted items: real transaction/locking tests, disposable HML database only."""
import asyncio
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import os
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from test_contract_balances_postgres import pg
from test_contract_items_postgres import quant

from app.core.config import settings
from app.models.contract_balance import ContractFuelPrice
from app.models.contract_item import ContractItem, ContractItemMovement, ContractItemPrice, ContractQuantityControl
from app.models.payment_process import PaymentContractAmendment
from app.models.user import UserRole
from app.schemas.contract_item import (ContractItemCreate, OriginalItemComplement, ItemPriceCreate, QuantityOpening,
    OpeningItem, ItemAmendmentCreate, AmendmentLine)
from app.services.contract_item_service import ContractItemService
from app.services.contract_amendment_service import ContractAmendmentService

pytestmark = pytest.mark.skipif(not os.getenv('CONTRACT_TEST_DATABASE_URL'), reason='Disposable PostgreSQL required')


def payload(c, **patch):
    values = dict(code='OMITIDO-04', original_number='04', description='Etanol previsto originalmente', category='FUEL',
        product_key='ETANOL', unit='L', original_quantity='200', original_unit_price='5.123456', remaining_quantity='75',
        historical_added_quantity='0', document_reference='CONTRATO-ORIGINAL, ITEM-04',
        justification='Complemento de item previsto e omitido do cadastro', original_contract_confirmed=True,
        request_key=uuid4(), prices=[dict(provider_id=c.provider.id, unit_price='5.123456')])
    values.update(patch)
    return OriginalItemComplement(**values)


async def financial_snapshot(c):
    # A database-side snapshot also detects edits hidden by the ORM identity map.
    result = {}
    for table in ['contract_controls', 'contract_quantity_controls', 'contract_movements', 'contract_reservations',
                  'contract_operations', 'payment_contract_amendments']:
        result[table] = (await c.db.execute(text(f"SELECT count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) FROM {table} t WHERE contract_id=:id"),
            dict(id=c.contract.id))).one()
    return result


@pytest_asyncio.fixture
async def maintenance(pg, monkeypatch):
    c = pg
    monkeypatch.setattr(settings, 'CONTRACT_QUANTITY_ENABLED', True)
    c.contract.kind = 'MAINTENANCE'; c.provider.fuel_station_id = None
    await c.db.flush()
    c.items = ContractItemService(c.db)
    c.item = await c.items.create(c.contract.id, ContractItemCreate(code='BASE', original_number='01',
        description='Serviço já cadastrado', category='SERVICE', unit='UN', original_quantity=100,
        original_unit_price=25, reference_unit_price=25), c.actor)
    c.item_price = await c.items.set_price(c.contract.id, ItemPriceCreate(item_id=c.item.id,
        provider_id=c.provider.id, unit_price=25), c.actor)
    await c.items.open(c.contract.id, QuantityOpening(adjudication='GLOBAL', document_reference='ORIGINAL-CONFERIDO',
        justification='Abertura inicial do contrato de teste', history_confirmed=True, request_key=uuid4(),
        items=[OpeningItem(item_id=c.item.id, remaining_quantity=70, historical_added_quantity=0)]), c.actor)
    await c.db.commit()
    return c


@asynccontextmanager
async def api_client(c):
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    async def session():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            yield db
    c.api_actor = c.actor
    app.dependency_overrides[get_db_session] = session
    app.dependency_overrides[get_current_user_ready] = lambda: c.api_actor
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            yield client
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_omitted_maintenance_item_preserves_money_reservations_and_old_prices(maintenance):
    c = maintenance
    reservation = await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id,
        source_type='MAINTENANCE_ORDER', source_id=uuid4(), amount=50, vehicle_id=c.vehicle.id,
        organization_id=None, actor=c.actor, item_lines=[dict(item_id=c.item.id, quantity=2)])
    await c.db.commit()
    before = await financial_snapshot(c)
    old_quantities = (await c.items.balances(c.contract.id))[c.item.id].copy()
    data = payload(c, code='PECA-02', original_number='02', category='PART', product_key=None,
        description='Peça prevista no contrato original', unit='UN', original_quantity='50', remaining_quantity='20')
    row = await c.items.complement_original(c.contract.id, data, c.actor)
    await c.db.commit()
    assert await financial_snapshot(c) == before
    assert (await c.items.balances(c.contract.id))[c.item.id] == old_quantities
    assert c.item_price.unit_price == 25 and c.item_price.valid_until is None
    assert row.reference_unit_price == data.original_unit_price
    totals = (await c.items.balances(c.contract.id))[row.id]
    assert totals == dict(remaining=20, reserved=0, available=20)
    assert reservation.amount == 50
    movement = await c.db.scalar(select(ContractItemMovement).where(ContractItemMovement.item_id == row.id))
    assert movement.movement_type == 'ORIGINAL_ITEM_COMPLEMENT'
    assert movement.actor_id == c.actor.id and movement.details['financial_effect'] == 'NONE'
    assert movement.details['document_reference'] == data.document_reference
    assert await c.items.added_since_opening(row.id) == 0


@pytest.mark.asyncio
async def test_missing_fuel_price_initialized_without_changing_other_versions_and_usable(quant):
    c = quant
    before = await financial_snapshot(c)
    old = c.price.unit_price, c.price.valid_from, c.price.valid_until
    row = await c.items.complement_original(c.contract.id, payload(c), c.actor)
    await c.db.commit()
    assert await financial_snapshot(c) == before
    assert (c.price.unit_price, c.price.valid_from, c.price.valid_until) == old
    quote = await c.service.quote(c.contract.id, c.provider.id, 'ETANOL', 2)
    assert quote['reserve_amount'] == Decimal('10.25')
    assert (await c.items.balances(c.contract.id))[row.id]['available'] == 75
    assert len([p for p in await c.items.prices(c.contract.id) if p['item_id'] == row.id]) == 1


@pytest.mark.asyncio
async def test_explicit_existing_fuel_price_link_preserves_the_version(quant):
    c = quant
    legacy = ContractFuelPrice(provider_id=c.provider.id, fuel_type='ETANOL', unit_price=Decimal('5.123456'),
        valid_from=datetime.now(timezone.utc)-timedelta(days=1), created_by=c.actor.id)
    c.db.add(legacy); await c.db.commit()
    data = payload(c)
    with pytest.raises(HTTPException) as error:
        await c.items.complement_original(c.contract.id, data, c.actor)
    assert error.value.status_code == 409
    data.prices[0].fuel_price_id = legacy.id
    row = await c.items.complement_original(c.contract.id, data, c.actor)
    await c.db.commit()
    assert legacy.valid_until is None
    assert await c.db.scalar(select(func.count()).select_from(ContractFuelPrice).where(
        ContractFuelPrice.provider_id == c.provider.id, ContractFuelPrice.fuel_type == 'ETANOL')) == 1
    assert next(p for p in await c.items.prices(c.contract.id) if p['item_id'] == row.id)['fuel_price_id'] == legacy.id


@pytest.mark.asyncio
@pytest.mark.parametrize('state', ['future', 'expired', 'deleted', 'wrong_price'])
async def test_unusable_existing_fuel_versions_leave_no_item(quant, state):
    c = quant; now = datetime.now(timezone.utc)
    legacy = ContractFuelPrice(provider_id=c.provider.id, fuel_type='ETANOL', unit_price=Decimal('5.123456'),
        valid_from=now+timedelta(days=1) if state == 'future' else now-timedelta(days=2),
        valid_until=now-timedelta(days=1) if state == 'expired' else None, created_by=c.actor.id)
    if state == 'deleted': legacy.deleted_at = now
    c.db.add(legacy); await c.db.commit()
    data = payload(c, prices=[dict(provider_id=c.provider.id, fuel_price_id=legacy.id,
        unit_price='6' if state == 'wrong_price' else '5.123456')])
    with pytest.raises(HTTPException) as error:
        await c.items.complement_original(c.contract.id, data, c.actor)
    assert error.value.status_code == 409
    assert not await c.db.scalar(select(ContractItem.id).where(ContractItem.contract_id == c.contract.id, ContractItem.code == data.code))


@pytest.mark.asyncio
async def test_replay_is_idempotent_and_changed_key_payload_is_rejected(quant):
    c = quant; data = payload(c)
    first = await c.items.complement_original(c.contract.id, data, c.actor); await c.db.commit()
    second = await c.items.complement_original(c.contract.id, data, c.actor); await c.db.commit()
    assert first.id == second.id
    assert await c.db.scalar(select(func.count()).select_from(ContractItemMovement).where(ContractItemMovement.item_id == first.id)) == 1
    assert await c.db.scalar(select(func.count()).select_from(ContractItemPrice).where(ContractItemPrice.item_id == first.id)) == 1
    data.justification = 'Justificativa diferente com a mesma identificação'
    with pytest.raises(HTTPException) as error:
        await c.items.complement_original(c.contract.id, data, c.actor)
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_concurrent_repeated_submission_creates_one_item(quant):
    c = quant; data = payload(c)
    async def submit():
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            row = await ContractItemService(db).complement_original(c.contract.id, data, c.actor)
            await db.commit()
            return row.id
    ids = await asyncio.gather(submit(), submit())
    assert ids[0] == ids[1]
    assert await c.db.scalar(select(func.count()).select_from(ContractItem).where(
        ContractItem.contract_id == c.contract.id, ContractItem.code == data.code)) == 1


@pytest.mark.asyncio
async def test_concurrent_distinct_requests_cannot_duplicate_original_number(quant):
    c = quant
    async def submit(data):
        async with AsyncSession(c.engine, expire_on_commit=False) as db:
            try:
                row = await ContractItemService(db).complement_original(c.contract.id, data, c.actor)
                await db.commit()
                return str(row.id)
            except HTTPException as error:
                await db.rollback()
                return error.status_code
    result = await asyncio.gather(submit(payload(c, code='INTENTO-A')), submit(payload(c, code='INTENTO-B')))
    assert result.count(409) == 1
    assert await c.db.scalar(select(func.count()).select_from(ContractItem).where(
        ContractItem.contract_id == c.contract.id, ContractItem.original_number == '04')) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize('patch', [{'original_number':'03'}, {'code':'DIESEL-TEST'}, {'product_key':'DIESEL S10'}])
async def test_existing_item_cannot_be_duplicated_to_add_quantities(quant, patch):
    c = quant
    before = await financial_snapshot(c)
    with pytest.raises(HTTPException) as error:
        await c.items.complement_original(c.contract.id, payload(c, **patch), c.actor)
    assert error.value.status_code == 409
    assert await financial_snapshot(c) == before
    assert await c.db.scalar(select(func.count()).select_from(ContractItem).where(ContractItem.contract_id == c.contract.id)) == 1


@pytest.mark.asyncio
async def test_group_is_required_and_inclusion_does_not_reopen_control(quant):
    c = quant
    control = await c.db.get(ContractQuantityControl, c.contract.id)
    control.adjudication = 'GROUP'; c.item.group_key = 'A'; await c.db.commit()
    before = await financial_snapshot(c)
    with pytest.raises(HTTPException) as error:
        await c.items.complement_original(c.contract.id, payload(c), c.actor)
    assert error.value.status_code == 422
    row = await c.items.complement_original(c.contract.id, payload(c, group_key='B'), c.actor)
    await c.db.commit()
    assert row.group_key == 'B' and await financial_snapshot(c) == before


@pytest.mark.asyncio
async def test_network_complement_tracks_quantity_without_fixed_prices(quant):
    c = quant; c.contract.fuel_pricing_mode = 'NETWORK_VALUE'; await c.db.commit()
    before = await financial_snapshot(c)
    count_before = await c.db.scalar(select(func.count()).select_from(ContractFuelPrice))
    row = await c.items.complement_original(c.contract.id, payload(c, prices=[]), c.actor); await c.db.commit()
    assert await financial_snapshot(c) == before
    assert (await c.items.balances(c.contract.id))[row.id]['available'] == 75
    assert await c.db.scalar(select(func.count()).select_from(ContractFuelPrice)) == count_before
    assert not await c.db.scalar(select(ContractItemPrice.id).where(ContractItemPrice.item_id == row.id))


@pytest.mark.asyncio
async def test_arla_complement_can_be_reserved_and_released_once(quant):
    c = quant
    row = await c.items.complement_original(c.contract.id, payload(c, category='ADDITIVE', product_key='ARLA 32',
        description='ARLA originalmente contratado', original_unit_price='2', remaining_quantity='10',
        prices=[dict(provider_id=c.provider.id, unit_price='2')]), c.actor)
    reservation = await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id,
        source_type='FUEL_ORDER', source_id=uuid4(), vehicle_id=c.vehicle.id, organization_id=None, actor=c.actor,
        fuel_type='DIESEL S10', liters=3, expected_price_id=c.price.id,
        item_lines=[dict(item_id=c.item.id, quantity=3), dict(item_id=row.id, quantity=2)])
    assert reservation.amount == 34
    assert (await c.items.balances(c.contract.id))[row.id]['available'] == 8
    await c.service.release(reservation.id, actor=c.actor); await c.service.release(reservation.id, actor=c.actor)
    assert (await c.items.balances(c.contract.id))[row.id]['available'] == 10
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100


@pytest.mark.asyncio
async def test_new_catalog_invalidates_old_preview_but_preserves_original_opening_replay(quant):
    c = quant; amendments = ContractAmendmentService(c.db)
    data = ItemAmendmentCreate(number='PREVIA-TESTE', signed_at=date.today(), effective_date=date.today(),
        change_types=['QUANTITY'], declared_quantity_amount=10, document_reference='PREVIA-ISOLADA',
        notes='Aditivo fictício não confirmado', request_key=uuid4(), lines=[AmendmentLine(item_id=c.item.id, added_quantity=1)])
    data.preview_token = (await amendments.preview(c.contract.id, data, c.actor))['preview_token']
    control = await c.db.get(ContractQuantityControl, c.contract.id)
    row = await c.items.complement_original(c.contract.id, payload(c), c.actor); await c.db.commit()
    with pytest.raises(HTTPException) as error:
        await amendments.confirm(c.contract.id, data, c.actor)
    assert error.value.status_code == 409
    assert not await c.db.scalar(select(PaymentContractAmendment.id).where(PaymentContractAmendment.contract_id == c.contract.id))
    original = QuantityOpening(adjudication='ITEM', justification='Conferência fictícia isolada',
        document_reference='TESTE-ABERTURA', history_confirmed=True, request_key=control.request_key,
        items=[OpeningItem(item_id=c.item.id, remaining_quantity=10, historical_added_quantity=0)])
    catalog = await c.items.open(c.contract.id, original, c.actor)
    assert {i['id'] for i in catalog['items']} == {c.item.id, row.id}


@pytest.mark.asyncio
async def test_api_failure_after_item_and_price_insert_rolls_back_everything(quant, monkeypatch):
    c = quant
    before = await financial_snapshot(c)
    prices_before = await c.db.scalar(select(func.count()).select_from(ContractFuelPrice))
    async def fail_after_insert(*args, **kwargs):
        raise HTTPException(409, 'Falha fictícia depois da inclusão para conferir rollback')
    monkeypatch.setattr(ContractItemService, 'set_price', fail_after_insert)
    async with api_client(c) as client:
        result = await client.post(f'/api/contract-control/contracts/{c.contract.id}/items/original-complements', json=payload(c).model_dump(mode='json'))
    assert result.status_code == 409
    assert not await c.db.scalar(select(ContractItem.id).where(ContractItem.contract_id == c.contract.id, ContractItem.code == 'OMITIDO-04'))
    assert await c.db.scalar(select(func.count()).select_from(ContractFuelPrice)) == prices_before
    assert await financial_snapshot(c) == before


@pytest.mark.asyncio
async def test_api_permissions_scope_success_and_retry(quant):
    c = quant; data = payload(c).model_dump(mode='json')
    url = f'/api/contract-control/contracts/{c.contract.id}/items/original-complements'
    async with api_client(c) as client:
        c.api_actor = SimpleNamespace(id=c.actor.id, role=UserRole.POSTO, organization_id=None)
        assert (await client.post(url, json=data)).status_code == 403
        c.api_actor = SimpleNamespace(id=c.actor.id, role=UserRole.PRODUCAO, organization_id=None)
        assert (await client.post(url, json=data)).status_code == 403
        c.api_actor = c.actor
        bad = await client.post(url, json={**data, 'original_contract_confirmed':False})
        assert bad.status_code == 422
        first = await client.post(url, json=data)
        repeated = await client.post(url, json=data)
        assert first.status_code == repeated.status_code == 201, first.text
        assert first.json()['id'] == repeated.json()['id']
        catalog = (await client.get(f'/api/contract-control/contracts/{c.contract.id}/items')).json()
        assert catalog['original_complements_supported'] and len(catalog['items']) == 2
        ledger = (await client.get(f'/api/contract-control/contracts/{c.contract.id}/item-movements', params={'item_id':first.json()['id']})).json()
        assert ledger['data'][0]['movement_type'] == 'ORIGINAL_ITEM_COMPLEMENT'
        c.api_actor = SimpleNamespace(id=c.actor.id, role=UserRole.PRODUCAO, organization_id=uuid4())
        scoped = await client.get(f'/api/contract-control/contracts/{c.contract.id}/item-movements', params={'item_id':first.json()['id']})
        assert scoped.status_code == 200 and scoped.json()['data'][0]['movement_type'] == 'ORIGINAL_ITEM_COMPLEMENT'
        c.api_actor = c.actor
        old_item = ContractItemCreate(code='OLD', original_number='99', description='Teste de proteção antiga', category='FUEL',
            product_key='GNV', unit='L', original_quantity=1, original_unit_price=1, reference_unit_price=1).model_dump(mode='json')
        assert (await client.post(f'/api/contract-control/contracts/{c.contract.id}/items', json=old_item)).status_code == 409
        assert (await client.put(f'/api/contract-control/contracts/{c.contract.id}/items/{c.item.id}', json=old_item)).status_code == 409


@pytest.mark.asyncio
async def test_complement_requires_open_control_and_enabled_quantity_feature(pg, monkeypatch):
    c = pg; service = ContractItemService(c.db)
    monkeypatch.setattr(settings, 'CONTRACT_QUANTITY_ENABLED', True)
    with pytest.raises(HTTPException) as error:
        await service.complement_original(c.contract.id, payload(c), c.actor)
    assert error.value.status_code == 409
    monkeypatch.setattr(settings, 'CONTRACT_QUANTITY_ENABLED', False)
    with pytest.raises(HTTPException) as error:
        await service.complement_original(c.contract.id, payload(c), c.actor)
    assert error.value.status_code == 409
