from datetime import date, datetime, timezone
from decimal import Decimal
from uuid import uuid4
import os
import pytest
import pytest_asyncio
from sqlalchemy import func, select
from fastapi import HTTPException
from test_contract_balances_postgres import pg
from app.core.config import settings
from app.models.contract_item import ContractItemMovement
from app.models.contract_balance import ContractReservation
from app.schemas.contract_item import (ContractItemCreate, ItemPriceCreate, QuantityOpening, OpeningItem,
    ItemAmendmentCreate, AmendmentLine, AmendmentPrice)
from app.services.contract_item_service import ContractItemService
from app.services.contract_amendment_service import ContractAmendmentService

pytestmark = pytest.mark.skipif(not os.getenv('CONTRACT_TEST_DATABASE_URL'), reason='Disposable PostgreSQL required')


@pytest_asyncio.fixture
async def quant(pg, monkeypatch):
    c = pg
    monkeypatch.setattr(settings, 'CONTRACT_QUANTITY_ENABLED', True)
    c.items = ContractItemService(c.db)
    c.item = await c.items.create(c.contract.id, ContractItemCreate(code='DIESEL-TEST', original_number='03',
        description='Diesel S10 fictício', category='FUEL', unit='L', product_key='Diesel S10', original_quantity=100,
        original_unit_price=10, reference_unit_price=10), c.actor)
    c.item_price = await c.items.set_price(c.contract.id, ItemPriceCreate(item_id=c.item.id, provider_id=c.provider.id,
        unit_price=10, fuel_price_id=c.price.id), c.actor)
    await c.items.open(c.contract.id, QuantityOpening(adjudication='ITEM', justification='Conferência fictícia isolada',
        document_reference='TESTE-ABERTURA', history_confirmed=True, request_key=uuid4(),
        items=[OpeningItem(item_id=c.item.id, remaining_quantity=10, historical_added_quantity=0)]), c.actor)
    await c.db.commit()
    return c


async def reserve(c, liters=3, source=None):
    return await c.service.reserve(contract_id=c.contract.id, provider_id=c.provider.id, source_type='FUEL_ORDER',
        source_id=source or uuid4(), vehicle_id=c.vehicle.id, organization_id=None, actor=c.actor,
        fuel_type='DIESEL S10', liters=liters, expected_price_id=c.price.id)


@pytest.mark.asyncio
async def test_quantities_reserve_release_once(quant):
    c=quant
    r=await reserve(c)
    assert (await c.items.balances(c.contract.id))[c.item.id]['available'] == 7
    await c.service.release(r.id, actor=c.actor)
    await c.service.release(r.id, actor=c.actor)
    assert (await c.items.balances(c.contract.id))[c.item.id]['available'] == 10
    assert (await c.service.balances(c.contract.id))['available_balance'] == 100


@pytest.mark.asyncio
async def test_execution_lower_actual_and_quantitative_rectification(quant):
    c=quant
    r=await reserve(c)
    from app.models.fuel_supply import FuelSupply
    supply=FuelSupply(id=uuid4(),vehicle_id=c.vehicle.id,fuel_station_id=c.station.id,
        supplied_at=datetime.now(timezone.utc),odometer_km=100,liters=2,total_amount=20,fuel_type='DIESEL S10',
        receipt_path='test-only.png',receipt_mime_type='image/png',receipt_size_bytes=1,receipt_uploaded_at=datetime.now(timezone.utc))
    c.db.add(supply)
    await c.db.flush()
    source=supply.id
    lines=[dict(item_id=c.item.id, quantity=2, amount=20)]
    op=await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=source, amount=20,
        occurred_at=datetime.now(timezone.utc), actor=c.actor, item_lines=lines)
    assert (await c.items.balances(c.contract.id))[c.item.id]['available'] == 8
    await c.service.settle(r.id, source_type='FUEL_SUPPLY', source_id=source, amount=20,
        occurred_at=datetime.now(timezone.utc), actor=c.actor, item_lines=lines)
    supply.liters, supply.total_amount=2.5,25
    await c.service.rectify_operation('FUEL_SUPPLY', source, amount=25, actor=c.actor,
        reason='Retificação fictícia de quantidades', item_lines=[dict(item_id=c.item.id, quantity='2.5', amount=25)])
    assert (await c.items.balances(c.contract.id))[c.item.id]['available'] == Decimal('7.5')
    assert (await c.service.balances(c.contract.id))['available_balance'] == 75


@pytest.mark.asyncio
async def test_price_and_quantity_amendment_atomic_snapshot_and_retry(quant):
    from datetime import timedelta
    c=quant
    service=ContractAmendmentService(c.db)
    payload=ItemAmendmentCreate(number='2TA-TEST', signed_at=date.today(), effective_date=date.today(),
        change_types=['TERM','PRICE','QUANTITY'], valid_until=date.today()+timedelta(days=400), price_reason='REBALANCE', price_financial_effect='DECLARED',
        price_financial_delta=5, declared_quantity_amount=275, document_reference='TESTE-TERMO', notes='Alteração fictícia conferida',
        request_key=uuid4(), lines=[AmendmentLine(item_id=c.item.id, document_number='001', new_reference_price=11,
            added_quantity=25, prices=[AmendmentPrice(provider_id=c.provider.id, unit_price=11)])])
    preview=await service.preview(c.contract.id,payload,c.actor)
    payload.preview_token=preview['preview_token']
    row=await service.confirm(c.contract.id,payload,c.actor)
    await c.db.commit()
    repeated=await service.confirm(c.contract.id,payload,c.actor)
    assert row.id==repeated.id
    assert row.snapshot['lines'][0]['original_number']=='03' and row.snapshot['lines'][0]['document_number']=='001'
    assert (await c.items.balances(c.contract.id))[c.item.id]['available']==35
    assert (await c.service.balances(c.contract.id))['available_balance']==380
    assert len(await c.items.prices(c.contract.id))==2
    assert c.contract.valid_until==date.today()+timedelta(days=400)


@pytest.mark.asyncio
async def test_stale_preview_and_limit_leave_no_partial_changes(quant):
    c=quant
    service=ContractAmendmentService(c.db)
    payload=ItemAmendmentCreate(number='4TA-TEST', signed_at=date.today(), effective_date=date.today(),
        change_types=['QUANTITY'], declared_quantity_amount=250, document_reference='TESTE-TERMO', notes='Alteração fictícia conferida',
        request_key=uuid4(), lines=[AmendmentLine(item_id=c.item.id, added_quantity=25)])
    p=await service.preview(c.contract.id,payload,c.actor)
    payload.preview_token=p['preview_token']
    await reserve(c)
    with pytest.raises(HTTPException) as error:
        await service.confirm(c.contract.id,payload,c.actor)
    assert error.value.status_code==409
    payload.lines[0].added_quantity=Decimal('25.001')
    payload.declared_quantity_amount=Decimal('250.01')
    with pytest.raises(HTTPException) as error:
        await service.preview(c.contract.id,payload,c.actor)
    assert error.value.status_code==409


@pytest_asyncio.fixture
async def stocked(pg,monkeypatch):
    c=pg
    monkeypatch.setattr(settings,'CONTRACT_QUANTITY_ENABLED',True)
    c.items=ContractItemService(c.db)
    c.stock={}
    for code,category,product,price,remaining in [('diesel','FUEL','DIESEL S10',10,10),('etanol','FUEL','ETANOL',5,20),('arla','ADDITIVE','ARLA 32',2,5)]:
        item=await c.items.create(c.contract.id,ContractItemCreate(code=code,original_number=code,description='Item fictício '+code,
            category=category,unit='L',product_key=product,original_quantity=100,original_unit_price=price,reference_unit_price=price),c.actor)
        await c.items.set_price(c.contract.id,ItemPriceCreate(item_id=item.id,provider_id=c.provider.id,unit_price=price,
            fuel_price_id=c.price.id if code=='diesel' else None),c.actor)
        c.stock[code]=(item,remaining)
    await c.items.open(c.contract.id,QuantityOpening(adjudication='ITEM',justification='Abertura fictícia de todos os itens',
        document_reference='TESTE-CATALOGO',history_confirmed=True,request_key=uuid4(),items=[OpeningItem(item_id=i.id,
            remaining_quantity=q,historical_added_quantity=0) for i,q in c.stock.values()]),c.actor)
    await c.service.adjust(c.contract.id,amount=1000,request_key=uuid4(),reason='Crédito fictício para isolar testes de quantidade',actor=c.actor)
    await c.db.commit()
    return c


@pytest.mark.asyncio
async def test_arla_reserves_money_and_quantity_and_cancel_is_idempotent(stocked):
    c=stocked
    diesel,arla=c.stock['diesel'][0],c.stock['arla'][0]
    r=await c.service.reserve(contract_id=c.contract.id,provider_id=c.provider.id,source_type='FUEL_ORDER',source_id=uuid4(),
        vehicle_id=c.vehicle.id,organization_id=None,actor=c.actor,fuel_type='DIESEL S10',liters=3,expected_price_id=c.price.id,
        item_lines=[dict(item_id=diesel.id,quantity=3),dict(item_id=arla.id,quantity=2)])
    assert r.amount==34
    assert (await c.items.balances(c.contract.id))[arla.id]['available']==3
    await c.service.release(r.id,actor=c.actor)
    await c.service.release(r.id,actor=c.actor)
    totals=await c.items.balances(c.contract.id)
    assert totals[arla.id]['available']==5 and totals[diesel.id]['available']==10


@pytest.mark.asyncio
async def test_fuel_substitution_releases_requested_item_and_consumes_actual(stocked):
    from app.models.fuel_supply import FuelSupply
    c=stocked
    r=await reserve(c,3)
    ethanol=c.stock['etanol'][0]
    supply=FuelSupply(id=uuid4(),vehicle_id=c.vehicle.id,fuel_station_id=c.station.id,supplied_at=datetime.now(timezone.utc),
        odometer_km=100,liters=4,total_amount=20,fuel_type='ETANOL',receipt_path='teste.png',receipt_mime_type='image/png',receipt_size_bytes=1)
    c.db.add(supply);await c.db.flush()
    await c.service.settle(r.id,source_type='FUEL_SUPPLY',source_id=supply.id,amount=20,occurred_at=supply.supplied_at,actor=c.actor)
    totals=await c.items.balances(c.contract.id)
    assert totals[c.stock['diesel'][0].id]['available']==10
    assert totals[ethanol.id]['available']==16
    assert not (await c.service.balances(c.contract.id))['divergence_open']


@pytest.mark.asyncio
@pytest.mark.parametrize('product,liters',[('DIESEL S10',12),('GASOLINA ADITIVADA',2)])
async def test_actual_excess_or_unmapped_product_records_fact_and_blocks_orders(stocked,product,liters):
    from app.models.fuel_supply import FuelSupply
    c=stocked;r=await reserve(c,3)
    supply=FuelSupply(id=uuid4(),vehicle_id=c.vehicle.id,fuel_station_id=c.station.id,supplied_at=datetime.now(timezone.utc),
        odometer_km=100,liters=liters,total_amount=30,fuel_type=product,receipt_path='teste.png',receipt_mime_type='image/png',receipt_size_bytes=1)
    c.db.add(supply);await c.db.flush()
    await c.service.settle(r.id,source_type='FUEL_SUPPLY',source_id=supply.id,amount=30,occurred_at=supply.supplied_at,actor=c.actor)
    assert (await c.service.balances(c.contract.id))['divergence_open']
    with pytest.raises(HTTPException) as error: await reserve(c,1)
    assert error.value.status_code==409


@pytest.mark.asyncio
async def test_two_sessions_compete_for_last_quantity_not_money(stocked):
    import asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.services.contract_balance_service import ContractBalanceService
    c=stocked
    async def attempt():
        async with AsyncSession(c.engine,expire_on_commit=False) as db:
            try:
                row=await ContractBalanceService(db).reserve(contract_id=c.contract.id,provider_id=c.provider.id,
                    source_type='FUEL_ORDER',source_id=uuid4(),vehicle_id=c.vehicle.id,organization_id=None,actor=c.actor,
                    fuel_type='DIESEL S10',liters=6,expected_price_id=c.price.id)
                await db.commit();return 'ok'
            except HTTPException:
                await db.rollback();return 'blocked'
    assert sorted(await asyncio.gather(attempt(),attempt()))==['blocked','ok']
    assert (await c.items.balances(c.contract.id))[c.stock['diesel'][0].id]['available']==4


@pytest.mark.asyncio
async def test_legacy_reservation_opening_does_not_reserve_money_twice(pg,monkeypatch):
    c=pg
    r=await reserve(c,3);await c.db.commit()
    before=await c.service.balances(c.contract.id)
    monkeypatch.setattr(settings,'CONTRACT_QUANTITY_ENABLED',True)
    service=ContractItemService(c.db)
    item=await service.create(c.contract.id,ContractItemCreate(code='diesel',original_number='03',description='Diesel teste',category='FUEL',
        unit='L',product_key='DIESEL S10',original_quantity=100,original_unit_price=10,reference_unit_price=10),c.actor)
    await service.set_price(c.contract.id,ItemPriceCreate(item_id=item.id,provider_id=c.provider.id,unit_price=10,fuel_price_id=c.price.id),c.actor)
    from app.schemas.contract_item import OpeningReservation,ItemOrderLine
    payload=QuantityOpening(adjudication='ITEM',justification='Conferência fictícia da reserva herdada',document_reference='TESTE-HERDADO',
        history_confirmed=True,request_key=uuid4(),items=[OpeningItem(item_id=item.id,remaining_quantity=10,historical_added_quantity=0)],
        reservations=[OpeningReservation(reservation_id=r.id,lines=[ItemOrderLine(item_id=item.id,quantity=3,unit_price=10)])])
    await service.open(c.contract.id,payload,c.actor)
    await service.open(c.contract.id,payload,c.actor)
    assert await c.service.balances(c.contract.id)==before
    assert (await service.balances(c.contract.id))[item.id]['available']==7


@pytest.mark.asyncio
async def test_maintenance_lines_execution_and_repeat_do_not_double_consume(pg,monkeypatch):
    from app.schemas.contract_balance import MaintenanceOrderCreate,MaintenanceOrderComplete
    from app.services.maintenance_order_service import MaintenanceOrderService
    from app.schemas.contract_item import ItemOrderLine
    c=pg;c.contract.kind='MAINTENANCE';c.provider.fuel_station_id=None;await c.db.flush()
    monkeypatch.setattr(settings,'CONTRACT_QUANTITY_ENABLED',True)
    service=ContractItemService(c.db)
    item=await service.create(c.contract.id,ContractItemCreate(code='SERV',original_number='01',description='Serviço fictício',category='SERVICE',
        unit='UN',original_quantity=100,original_unit_price=20,reference_unit_price=20),c.actor)
    await service.set_price(c.contract.id,ItemPriceCreate(item_id=item.id,provider_id=c.provider.id,unit_price=20),c.actor)
    await service.open(c.contract.id,QuantityOpening(adjudication='GLOBAL',justification='Abertura fictícia da oficina',document_reference='TESTE-OFICINA',
        history_confirmed=True,request_key=uuid4(),items=[OpeningItem(item_id=item.id,remaining_quantity=5,historical_added_quantity=0)]),c.actor)
    orders=MaintenanceOrderService(c.db)
    created=await orders.create(MaintenanceOrderCreate(vehicle_id=c.vehicle.id,contract_id=c.contract.id,provider_id=c.provider.id,
        service_description='Serviço de teste integral',estimated_cost=40,request_key=uuid4(),item_lines=[ItemOrderLine(item_id=item.id,quantity=2,unit_price=20)]),c.actor)
    payload=MaintenanceOrderComplete(total_cost=20,item_lines=[ItemOrderLine(item_id=item.id,quantity=1,amount=20)])
    await orders.complete(created['id'],payload,c.actor)
    await orders.complete(created['id'],payload,c.actor)
    assert (await service.balances(c.contract.id))[item.id]['available']==4
    assert (await c.service.balances(c.contract.id))['available_balance']==80
    payload.item_lines[0].quantity=Decimal(2)
    with pytest.raises(HTTPException):await orders.complete(created['id'],payload,c.actor)


@pytest.mark.asyncio
async def test_typed_amendment_api_report_and_retry(quant):
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    from sqlalchemy.ext.asyncio import AsyncSession
    from httpx import ASGITransport,AsyncClient
    c=quant
    payload=ItemAmendmentCreate(number='API-PRICE-'+uuid4().hex[:6],signed_at=date.today(),effective_date=date.today(),change_types=['PRICE'],
        price_reason='REBALANCE',price_financial_effect='NONE',document_reference='DOC-API-TESTE',notes='Preço testado pela API real',
        request_key=uuid4(),lines=[AmendmentLine(item_id=c.item.id,document_number='001',new_reference_price=11,prices=[AmendmentPrice(provider_id=c.provider.id,unit_price=11)])]).model_dump(mode='json')
    async def session():
        async with AsyncSession(c.engine,expire_on_commit=False) as db:yield db
    app.dependency_overrides[get_db_session]=session
    app.dependency_overrides[get_current_user_ready]=lambda:c.actor
    base=f'/api/payment-contracts/{c.contract.id}/amendments'
    try:
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test') as client:
            preview=await client.post(base+'/preview',json=payload)
            assert preview.status_code==200,preview.text
            payload['preview_token']=preview.json()['preview_token']
            for _ in range(2):
                result=await client.post(base,json=payload)
                assert result.status_code==201,result.text
            amendment=next(r for r in result.json()['amendments'] if r['request_key']==payload['request_key'])
            report=await client.get(base+f'/{amendment["id"]}/report')
            assert report.status_code==200 and report.json()['snapshot']['lines'][0]['document_number']=='001'
    finally:app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_quantity_batch_is_atomic_when_last_arla_is_insufficient(stocked):
    from datetime import timedelta
    from app.models.vehicle import Vehicle
    from app.models.fuel_supply_order import FuelSupplyOrder
    from app.schemas.fuel_supply import FuelSupplyOrderBatchCreate
    from app.services.fuel_supply_order_service import FuelSupplyOrderService
    c=stocked
    vehicle=Vehicle(id=uuid4(),plate='TQ'+uuid4().hex[:5].upper(),brand='TESTE',model='FICTICIO')
    c.db.add(vehicle);await c.db.commit()
    ids=(c.contract.id,c.stock['diesel'][0].id,c.stock['arla'][0].id)
    data=FuelSupplyOrderBatchCreate(contract_id=ids[0],contract_provider_id=c.provider.id,fuel_station_id=c.station.id,
        requested_fuel_type='DIESEL S10',expected_price_id=c.price.id,request_key=uuid4(),
        expires_at=datetime.now(timezone.utc)+timedelta(hours=12),items=[dict(vehicle_id=v,requested_liters=2,
            item_lines=[dict(item_id=ids[1],quantity=2),dict(item_id=ids[2],quantity=3)]) for v in [c.vehicle.id,vehicle.id]])
    with pytest.raises(HTTPException):await FuelSupplyOrderService(c.db).create_batch(data,c.actor)
    assert await c.db.scalar(select(func.count()).select_from(FuelSupplyOrder).where(FuelSupplyOrder.contract_id==ids[0]))==0
    assert await c.db.scalar(select(func.count()).select_from(ContractReservation).where(ContractReservation.contract_id==ids[0]))==0
    totals=await c.items.balances(ids[0])
    assert totals[ids[1]]['available']==10 and totals[ids[2]]['available']==5
    assert (await c.service.balances(ids[0]))['available_balance']==1100


@pytest.mark.asyncio
async def test_expiration_and_reopening_preserve_fuel_and_arla_quantities(stocked):
    from datetime import timedelta
    from sqlalchemy import update
    from app.models.fuel_supply_order import FuelSupplyOrder
    from app.schemas.fuel_supply import FuelSupplyOrderCreate,FuelSupplyOrderDeadlineUpdate
    from app.services.fuel_supply_order_service import FuelSupplyOrderService
    c=stocked;orders=FuelSupplyOrderService(c.db)
    diesel,arla=c.stock['diesel'][0].id,c.stock['arla'][0].id
    created=await orders.create_order(FuelSupplyOrderCreate(vehicle_id=c.vehicle.id,fuel_station_id=c.station.id,
        expires_at=datetime.now(timezone.utc)+timedelta(hours=12),contract_id=c.contract.id,
        contract_provider_id=c.provider.id,requested_fuel_type='DIESEL S10',requested_liters=3,
        request_key=uuid4(),expected_price_id=c.price.id,item_lines=[dict(item_id=diesel,quantity=3),dict(item_id=arla,quantity=2)]),c.actor)
    await c.db.execute(update(FuelSupplyOrder).where(FuelSupplyOrder.id==created['id']).values(expires_at=datetime.now(timezone.utc)-timedelta(seconds=5)))
    await c.db.commit()
    for _ in range(2):await orders._expire_overdue_orders()
    totals=await c.items.balances(c.contract.id)
    assert totals[diesel]['available']==10 and totals[arla]['available']==5
    await orders.update_deadline(created['id'],FuelSupplyOrderDeadlineUpdate(expires_at=datetime.now(timezone.utc)+timedelta(hours=12),
        reason='Reabertura fictícia com combustível e ARLA'),c.actor)
    totals=await c.items.balances(c.contract.id)
    assert totals[diesel]['available']==7 and totals[arla]['available']==3
    assert (await c.service.balances(c.contract.id))['available_balance']==1066


@pytest.mark.asyncio
async def test_document_examples_keep_other_items_and_total_fourth_term(pg,monkeypatch):
    """Documentary examples are fictional data in a disposable database, never an import."""
    c=pg;monkeypatch.setattr(settings,'CONTRACT_QUANTITY_ENABLED',True)
    items=ContractItemService(c.db);amendments=ContractAmendmentService(c.db);catalog={}
    specifications=[('ET','01','ETANOL',2500,'4.87','FUEL'),
        ('GC','02','GASOLINA COMUM',130000,'6.54','FUEL'),('S10','03','DIESEL S10',87500,'6.02','FUEL'),
        ('S500','04','DIESEL S500',82500,'5.74','FUEL'),('ARLA','05','ARLA 32',5000,'2.92','ADDITIVE')]
    for code,number,product,q,price,category in specifications:
        item=await items.create(c.contract.id,ContractItemCreate(code=code,original_number=number,description='FICTÍCIO '+product,
            category=category,unit='L',product_key=product,original_quantity=q,original_unit_price=price,reference_unit_price=price),c.actor)
        await items.set_price(c.contract.id,ItemPriceCreate(item_id=item.id,provider_id=c.provider.id,unit_price=price),c.actor)
        catalog[code]=item
    await items.open(c.contract.id,QuantityOpening(adjudication='ITEM',justification='Conferência fictícia baseada nos documentos de teste',
        document_reference='TESTE-DOCUMENTAL',history_confirmed=True,request_key=uuid4(),items=[OpeningItem(item_id=item.id,
            remaining_quantity=item.original_quantity,historical_added_quantity=0) for item in catalog.values()]),c.actor)
    original_prices={p['item_id']:p['unit_price'] for p in await items.prices(c.contract.id) if p['current']}
    async def apply(number,types,rows,total=0):
        payload=ItemAmendmentCreate(number=number,signed_at=date.today(),effective_date=date.today(),change_types=types,
            price_reason='REBALANCE' if 'PRICE' in types else None,price_financial_effect='NONE' if 'PRICE' in types else None,
            document_reference='TESTE-SEM-EFEITO-REAL',notes='Reprodução fictícia dos valores do documento',request_key=uuid4(),
            declared_quantity_amount=total,lines=rows)
        payload.preview_token=(await amendments.preview(c.contract.id,payload,c.actor))['preview_token']
        return await amendments.confirm(c.contract.id,payload,c.actor)
    await apply('2TA-FICTICIO',['PRICE'],[AmendmentLine(item_id=catalog[code].id,new_reference_price=price,
        prices=[AmendmentPrice(provider_id=c.provider.id,unit_price=price)]) for code,price in [('S10','6.21'),('S500','5.96')]])
    current={p['item_id']:p['unit_price'] for p in await items.prices(c.contract.id) if p['current']}
    for code in ['ET','GC','ARLA']:assert current[catalog[code].id]==original_prices[catalog[code].id]
    assert current[catalog['S10'].id]==Decimal('6.21') and current[catalog['S500'].id]==Decimal('5.96')
    await apply('3TA-FICTICIO',['PRICE'],[AmendmentLine(item_id=catalog[code].id,new_reference_price=price,
        prices=[AmendmentPrice(provider_id=c.provider.id,unit_price=price)]) for code,price in [('S10','6.53'),('S500','6.32')]])
    row=await apply('4TA-FICTICIO',['QUANTITY'],[AmendmentLine(item_id=catalog[code].id,document_number=number,added_quantity=q)
        for code,number,q in [('GC','01',32500),('S500','02',20625),('S10','03',21875)]],Decimal('485743.75'))
    assert Decimal(row.snapshot['quantity_amount'])==Decimal('485743.75')
    assert all(Decimal(r['percent_after'])==25 for r in row.snapshot['limits'] if Decimal(r['after'])>0)
    assert row.snapshot['lines'][0]['original_number']=='02' and row.snapshot['lines'][0]['document_number']=='01'
