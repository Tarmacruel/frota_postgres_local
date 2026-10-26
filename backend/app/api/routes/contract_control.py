from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_ready, require_permission
from app.core.config import settings
from app.core.organization_scope import production_scope_is_empty
from app.db.session import get_db_session
from app.models.contract_balance import ContractProvider
from app.models.fuel_station import FuelStation
from app.models.payment_process import PaymentContract, PaymentProcessKind
from app.models.user import User
from app.schemas.contract_balance import (
    BalanceAdjustment, BalanceCorrection, ContractOpening, ContractQuote, Justified, MaintenanceOrderCancel,
    MaintenanceOrderComplete, MaintenanceOrderCreate, MaintenanceOrderStart,
    PriceCreate, PriceUpdate, ProviderCreate, ReconcileProcess,
)
from app.services.contract_balance_service import ContractBalanceService, TZ, utcnow
from app.services.maintenance_order_service import MaintenanceOrderService


async def enabled():
    if not settings.CONTRACT_BALANCE_ENABLED:
        raise HTTPException(409, 'Controle de saldos não habilitado neste ambiente')


router = APIRouter(prefix='/api/contract-control', tags=['ContractControl'])
orders_router = APIRouter(prefix='/api/maintenance-orders', tags=['MaintenanceOrders'], dependencies=[Depends(enabled)])
financial_view = require_permission('payment_processes', 'view')
financial_edit = require_permission('payment_processes', 'edit')


async def write(db, operation):
    try:
        result = await operation
        await db.commit()
        return result
    except Exception:
        await db.rollback()
        raise


@router.get('/config')
async def config(_user: User = Depends(get_current_user_ready)):
    return {'enabled': settings.CONTRACT_BALANCE_ENABLED, 'currency': 'BRL', 'shared_balance': True}


@router.get('/catalog', dependencies=[Depends(enabled)])
async def catalog(db: AsyncSession = Depends(get_db_session), _user: User = Depends(financial_view)):
    stations = (await db.execute(select(FuelStation.id, FuelStation.name, FuelStation.cnpj, FuelStation.active,
        ContractProvider.contract_id.label('active_contract_id'), PaymentContract.number.label('active_contract_number'))
        .outerjoin(ContractProvider, and_(ContractProvider.fuel_station_id == FuelStation.id, ContractProvider.active.is_(True)))
        .outerjoin(PaymentContract, PaymentContract.id == ContractProvider.contract_id)
        .order_by(FuelStation.name))).mappings().all()
    catalog_stations = {}
    for station in stations:
        entry = catalog_stations.setdefault(station['id'], {
            **dict(station), 'active_contracts': [],
        })
        if station['active_contract_id']:
            entry['active_contracts'].append({
                'id': station['active_contract_id'], 'number': station['active_contract_number'],
            })
    for entry in catalog_stations.values():
        if len(entry['active_contracts']) != 1:
            entry['active_contract_id'] = None
            entry['active_contract_number'] = None
    return {'stations': list(catalog_stations.values())}


@router.get('/eligible', dependencies=[Depends(enabled)])
async def eligible(kind: PaymentProcessKind, fuel_station_id: UUID | None = None,
                   db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user_ready)):
    await require_permission('fuel_supply_orders' if kind == PaymentProcessKind.FUEL else 'maintenance', 'create')(db=db, current_user=user)
    if production_scope_is_empty(user):
        return []
    service = ContractBalanceService(db)
    await service.release_expired()
    result = await service.eligible(kind=kind.value, station_id=fuel_station_id)
    await db.commit()
    return result


@router.get('/contracts', dependencies=[Depends(enabled)])
async def overview(kind: PaymentProcessKind | None = None, search: str | None = None, indicator: str | None = None,
                   db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    from app.services.payment_process_service import PaymentProcessService
    service = ContractBalanceService(db)
    await service.release_expired()
    if production_scope_is_empty(user):
        return {'data': [], 'indicators': {}, 'totals': {}}
    contracts = await PaymentProcessService(db).list_contracts(current_user=user, kind=kind, search=search)
    for item in contracts:
        item['provider_count'] = await db.scalar(select(func.count()).select_from(ContractProvider).where(
            ContractProvider.contract_id == item['id'], ContractProvider.active.is_(True)))
        contract = await service.contract(item['id'])
        item['eligibility_errors'] = await service.errors(contract)
        item['ready'] = not item['eligibility_errors'] and bool(item['provider_count'])
    today = utcnow().astimezone(TZ).date()
    predicates = {
        'all': lambda c: True,
        'ready': lambda c: c['ready'],
        'opened': lambda c: c.get('control_opened'),
        'paid': lambda c: c.get('paid_amount', 0) > 0,
        'pending': lambda c: c.get('pending_amount', 0) > 0,
        'pending_setup': lambda c: not c.get('control_opened') or not c['provider_count'] or not c.get('valid_from') or not c.get('valid_until'),
        'reserved': lambda c: c.get('reserved_amount', 0) > 0,
        'consumed': lambda c: c.get('consumed_since_opening', 0) != 0,
        'low_balance': lambda c: c.get('control_opened') and c['available_balance'] <= c['opening_balance']*Decimal('.10'),
        'expires_30': lambda c: c.get('valid_until') and today <= c['valid_until'] <= today+timedelta(days=30),
        'divergence': lambda c: c.get('divergence_open'),
    }
    if indicator and indicator not in predicates:
        raise HTTPException(422, 'Indicador inválido')
    counts = {key: sum(bool(predicate(c)) for c in contracts) for key, predicate in predicates.items()}
    totals = {key: sum((c.get(key) or Decimal('0') for c in contracts), Decimal('0'))
              for key in ('available_balance', 'reserved_amount', 'consumed_since_opening', 'paid_amount', 'pending_amount')}
    if not any(c.get('control_opened') for c in contracts):
        for key in ('available_balance', 'reserved_amount', 'consumed_since_opening'):
            totals[key] = None
    await db.commit()
    return {'data': [c for c in contracts if not indicator or predicates[indicator](c)], 'indicators': counts, 'totals': totals}


@router.get('/contracts/{contract_id}', dependencies=[Depends(enabled)])
async def detail(contract_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    from app.services.payment_process_service import PaymentProcessService
    if production_scope_is_empty(user):
        raise HTTPException(404, 'Contrato não encontrado')
    service = ContractBalanceService(db)
    await service.release_expired(contract_id=contract_id)
    contract = await PaymentProcessService(db).get_contract(contract_id)
    result = dict(contract=contract, providers=await service.providers(contract_id), prices=await service.prices(contract_id, include_deleted=True))
    await db.commit()
    return result


@router.post('/contracts/{contract_id}/opening', dependencies=[Depends(enabled)])
async def opening(contract_id: UUID, data: ContractOpening, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).open_control(contract_id, data, user))


@router.post('/contracts/{contract_id}/providers', dependencies=[Depends(enabled)], status_code=201)
async def add_provider(contract_id: UUID, data: ProviderCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).add_provider(contract_id, data, user))


@router.patch('/contracts/{contract_id}/providers/{provider_id}', dependencies=[Depends(enabled)])
async def set_provider(contract_id: UUID, provider_id: UUID, active: bool = Query(),
                       db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).set_provider_active(contract_id, provider_id, active, user))


@router.post('/contracts/{contract_id}/prices', dependencies=[Depends(enabled)], status_code=201)
async def add_price(contract_id: UUID, data: PriceCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).add_price(contract_id, data, user))


@router.patch('/contracts/{contract_id}/prices/{price_id}', dependencies=[Depends(enabled)])
async def update_price(contract_id: UUID, price_id: UUID, data: PriceUpdate,
                       db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).update_price(contract_id, price_id, data, user))


@router.delete('/contracts/{contract_id}/prices/{price_id}', dependencies=[Depends(enabled)])
async def delete_price(contract_id: UUID, price_id: UUID,
                       db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).delete_price(contract_id, price_id, user))


@router.post('/contracts/{contract_id}/quote', dependencies=[Depends(enabled)])
async def quote(contract_id: UUID, data: ContractQuote, db: AsyncSession = Depends(get_db_session),
                user: User = Depends(require_permission('fuel_supply_orders', 'create'))):
    if production_scope_is_empty(user):
        raise HTTPException(403, 'Defina sua secretaria antes de emitir pedidos')
    service = ContractBalanceService(db)
    await service.release_expired(contract_id=contract_id)
    result = await service.quote(contract_id, data.provider_id, data.fuel_type, data.liters, item_liters=data.item_liters)
    await db.commit()
    return result


@router.post('/contracts/{contract_id}/balance-correction', dependencies=[Depends(enabled)])
async def correct_balance(contract_id: UUID, data: BalanceCorrection, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).correct_balance(contract_id, data, user))


@router.post('/contracts/{contract_id}/adjustments', dependencies=[Depends(enabled)])
async def adjust(contract_id: UUID, data: BalanceAdjustment, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).adjust(contract_id, amount=data.amount,
        request_key=data.request_key, reason=data.justification, actor=user, details={'document_reference': data.document_reference}))


@router.post('/contracts/{contract_id}/resolve-divergence', dependencies=[Depends(enabled)])
async def resolve(contract_id: UUID, data: Justified, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).resolve_divergence(contract_id, data.justification, user))


@router.get('/contracts/{contract_id}/movements', dependencies=[Depends(enabled)])
async def movements(contract_id: UUID, page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=200),
                    organization_id: UUID | None = None, vehicle_id: UUID | None = None,
                    provider_id: UUID | None = None, start: datetime | None = None, end: datetime | None = None,
                    status: str | None = None, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    return await ContractBalanceService(db).movements(contract_id, user, page=page, limit=limit,
        organization_id=organization_id, vehicle_id=vehicle_id, provider_id=provider_id, start=start, end=end, status=status)


@router.get('/contracts/{contract_id}/operations', dependencies=[Depends(enabled)])
async def operations(contract_id: UUID, unbilled: bool = False, process_id: UUID | None = None,
                     page: int = Query(1, ge=1), limit: int = Query(50, ge=1, le=200),
                     organization_id: UUID | None = None, vehicle_search: str | None = None, provider_id: UUID | None = None,
                     start: datetime | None = None, end: datetime | None = None,
                     db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    return await ContractBalanceService(db).operations(contract_id, user, unbilled=unbilled,
        process_id=process_id, page=page, limit=limit, organization_id=organization_id,
        vehicle_search=vehicle_search, provider_id=provider_id, start=start, end=end)


@router.get('/contracts/{contract_id}/reservations', dependencies=[Depends(enabled)])
async def reservations(contract_id: UUID, page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=200),
        organization_id: UUID | None = None, vehicle_search: str | None = None, provider_id: UUID | None = None,
        start: datetime | None = None, end: datetime | None = None,
        db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    return await ContractBalanceService(db).reservations(contract_id, user, page=page, limit=limit,
        organization_id=organization_id, vehicle_search=vehicle_search, provider_id=provider_id, start=start, end=end)


@router.get('/processes/{process_id}/reconciliation', dependencies=[Depends(enabled)])
async def get_reconciliation(process_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    from app.services.payment_process_service import PaymentProcessService
    await PaymentProcessService(db).get(process_id, current_user=user)
    return await ContractBalanceService(db).reconciliation(process_id)


@router.post('/processes/{process_id}/reconciliation', dependencies=[Depends(enabled)])
async def reconcile(process_id: UUID, data: ReconcileProcess, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    return await write(db, ContractBalanceService(db).reconcile(process_id, data, user))


@orders_router.get('')
async def maintenance_orders(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
        status: str | None = Query(None, pattern='^(AUTHORIZED|IN_PROGRESS|COMPLETED|CANCELLED)$'),
        contract_id: UUID | None = None, vehicle_id: UUID | None = None, organization_id: UUID | None = None,
        search: str | None = None, start: datetime | None = None, end: datetime | None = None,
        db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('maintenance', 'view'))):
    return await MaintenanceOrderService(db).list(user, page=page, limit=limit, status=status, contract_id=contract_id,
        vehicle_id=vehicle_id, organization_id=organization_id, search=search, start=start, end=end)


@orders_router.post('', status_code=201)
async def create_maintenance_order(data: MaintenanceOrderCreate, db: AsyncSession = Depends(get_db_session),
                                 user: User = Depends(require_permission('maintenance', 'create'))):
    return await write(db, MaintenanceOrderService(db).create(data, user))


@orders_router.post('/{order_id}/start')
async def start_maintenance_order(order_id: UUID, data: MaintenanceOrderStart, db: AsyncSession = Depends(get_db_session),
                                 user: User = Depends(require_permission('maintenance', 'edit'))):
    return await write(db, MaintenanceOrderService(db).start(order_id, data, user))


@orders_router.post('/{order_id}/complete')
async def complete_maintenance_order(order_id: UUID, data: MaintenanceOrderComplete, db: AsyncSession = Depends(get_db_session),
                                 user: User = Depends(require_permission('maintenance', 'edit'))):
    return await write(db, MaintenanceOrderService(db).complete(order_id, data, user))


@orders_router.post('/{order_id}/cancel')
async def cancel_maintenance_order(order_id: UUID, data: MaintenanceOrderCancel, db: AsyncSession = Depends(get_db_session),
                                 user: User = Depends(require_permission('maintenance', 'edit'))):
    return await write(db, MaintenanceOrderService(db).cancel(order_id, data.justification, user))
