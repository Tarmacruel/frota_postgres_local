from uuid import UUID, uuid4
from pathlib import Path
import hashlib
import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user_ready, require_permission
from app.api.routes.contract_control import enabled, financial_edit, financial_view, write
from app.core.config import settings
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.db.session import get_db_session
from app.models.contract_balance import ContractOperation, ContractReservation
from app.models.contract_item import ContractItemMovement
from app.models.payment_process import PaymentContractAmendment
from app.schemas.contract_item import ContractItemCreate, OriginalItemComplement, ItemPriceCreate, ItemAmendmentCreate, QuantityOpening, ItemOrderLine, ItemQuote
from app.models.user import User
from app.services.contract_item_service import ContractItemService
from app.services.contract_amendment_service import ContractAmendmentService

router = APIRouter(prefix='/api/contract-control/contracts', tags=['ContractItems'], dependencies=[Depends(enabled)])
amendment_router = APIRouter(prefix='/api/payment-contracts', tags=['ContractAmendments'], dependencies=[Depends(enabled)])


def visible(user):
    if production_scope_is_empty(user):
        raise HTTPException(403, 'Defina sua secretaria para acessar o contrato')


@router.get('/{contract_id}/items')
async def list_items(contract_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    visible(user)
    return await ContractItemService(db).list(contract_id)


@router.post('/{contract_id}/items', status_code=201)
async def create_item(contract_id: UUID, data: ContractItemCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    visible(user)
    return await write(db, ContractItemService(db).create(contract_id, data, user))


@router.put('/{contract_id}/items/{item_id}')
async def update_item(contract_id: UUID, item_id: UUID, data: ContractItemCreate,
                      db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    visible(user)
    return await write(db, ContractItemService(db).create(contract_id, data, user, item_id=item_id))


@router.post('/{contract_id}/items/original-complements', status_code=201)
async def complement_original_item(contract_id: UUID, data: OriginalItemComplement,
        db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    visible(user)
    try:
        return await write(db, ContractItemService(db).complement_original(contract_id, data, user))
    except IntegrityError as err:
        if (getattr(err.orig, 'sqlstate', None) or getattr(err.orig, 'pgcode', None)) == '23505':
            raise HTTPException(409, 'Cadastro repetido ou identificação já utilizada. Confira os itens; nenhuma inclusão parcial foi mantida.') from err
        raise


@router.post('/{contract_id}/item-prices', status_code=201)
async def item_price(contract_id: UUID, data: ItemPriceCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    visible(user)
    service = ContractItemService(db)
    from app.models.contract_item import ContractQuantityControl
    if await db.get(ContractQuantityControl, contract_id):
        raise HTTPException(409, 'Controle aberto: altere preços pelo instrumento para preservar o demonstrativo')
    return await write(db, service.set_price(contract_id, data, user))


@router.get('/{contract_id}/quantity-opening')
async def opening_context(contract_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    visible(user)
    service = ContractItemService(db)
    result = await service.list(contract_id)
    held = (await db.scalars(select(ContractReservation).where(ContractReservation.contract_id == contract_id,
        ContractReservation.status == 'HELD').order_by(ContractReservation.created_at))).all()
    result['reservations'] = [dict(id=r.id, source_type=r.source_type, source_id=r.source_id, provider_id=r.provider_id,
        amount=r.amount, liters=r.liters, fuel_type=r.fuel_type, unit_price=r.unit_price,
        lines=await service.reservation_lines(r.id)) for r in held]
    return result


@router.post('/{contract_id}/quantity-opening')
async def opening(contract_id: UUID, data: QuantityOpening, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    visible(user)
    return await write(db, ContractItemService(db).open(contract_id, data, user))


@router.get('/{contract_id}/item-options')
async def options(contract_id: UUID, provider_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user_ready)):
    visible(user)
    service = ContractItemService(db)
    contract = await service.balance.contract(contract_id)
    await require_permission('fuel_supply_orders' if contract.kind == 'FUEL' else 'maintenance', 'view')(db=db, current_user=user)
    await service.balance.provider(contract_id, provider_id)
    if getattr(user.role, 'value', user.role) == 'POSTO':
        from app.repositories.fuel_station_repository import FuelStationRepository
        provider = await service.balance.provider(contract_id, provider_id)
        if not provider.fuel_station_id or not await FuelStationRepository(db).has_active_user_link(user_id=user.id, fuel_station_id=provider.fuel_station_id):
            raise HTTPException(403, 'Posto não vinculado a este usuário')
    data = await service.list(contract_id)
    # Operational users need current prices and quantities, not historical financial expenses.
    return dict(opened=data['opened'], items=[{k: r[k] for k in ['id','code','description','category','product_key','unit','available']} for r in data['items'] if r['active']],
        prices=[p for p in data['prices'] if p['provider_id'] == provider_id and p['current']])


@router.post('/{contract_id}/item-quote')
async def item_quote(contract_id: UUID, data: ItemQuote, db: AsyncSession = Depends(get_db_session), user: User = Depends(get_current_user_ready)):
    visible(user)
    service = ContractItemService(db)
    contract = await service.balance.contract(contract_id)
    await require_permission('fuel_supply_orders' if contract.kind == 'FUEL' else 'maintenance', 'create')(db=db, current_user=user)
    errors = await service.balance.errors(contract)
    if errors:
        raise HTTPException(409, '; '.join(errors))
    rows = await service.quote_lines(contract_id, data.provider_id, data.lines)
    from decimal import Decimal
    total = sum((r['amount'] for r in rows), Decimal(0))
    balance = await service.balance.balances(contract_id)
    return dict(item_lines=rows, reserve_amount=total, available_balance=balance['available_balance'],
        available_after=balance['available_balance']-total, sufficient=balance['available_balance']>=total)


@router.get('/{contract_id}/item-movements')
async def movements(contract_id: UUID, item_id: UUID | None = None, page: int = 1,
                    db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    visible(user)
    await ContractItemService(db).balance.contract(contract_id)
    m = ContractItemMovement
    stmt = select(m).outerjoin(ContractReservation, ContractReservation.source_id == m.source_id).outerjoin(ContractOperation, ContractOperation.id == m.source_id)
    conditions = [m.contract_id == contract_id]
    if item_id:
        conditions.append(m.item_id == item_id)
    scope = scoped_organization_id(user)
    if scope:
        conditions.append(or_(m.movement_type.in_(['OPENING','AMENDMENT','ORIGINAL_ITEM_COMPLEMENT']), ContractReservation.organization_id == scope, ContractOperation.organization_id == scope))
    if page < 1:
        raise HTTPException(422, 'Página inválida')
    rows = (await db.scalars(stmt.where(*conditions).order_by(m.occurred_at.desc(), m.id).offset((page-1)*50).limit(50))).all()
    return {'data': rows, 'page': page, 'limit': 50}


@amendment_router.post('/{contract_id}/amendments/preview')
async def preview(contract_id: UUID, data: ItemAmendmentCreate, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    visible(user)
    return await ContractAmendmentService(db).preview(contract_id, data, user)


@amendment_router.get('/{contract_id}/amendments/{amendment_id}/report')
async def report(contract_id: UUID, amendment_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    visible(user)
    row = await db.get(PaymentContractAmendment, amendment_id)
    if not row or row.contract_id != contract_id:
        raise HTTPException(404, 'Alteração não encontrada')
    if not row.snapshot:
        raise HTTPException(409, 'Registro histórico anterior ao demonstrativo por itens')
    return dict(id=row.id, created_at=row.created_at, snapshot=row.snapshot, has_attachment=bool(row.attachment))


@amendment_router.post('/{contract_id}/amendment-attachments', status_code=201)
async def upload(contract_id: UUID, file: UploadFile = File(...), db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_edit)):
    visible(user)
    await ContractItemService(db).balance.contract(contract_id)
    content = await file.read(25*1024*1024+1)
    await file.close()
    if len(content) > 25*1024*1024 or not content.startswith(b'%PDF-'):
        raise HTTPException(422, 'Anexe um PDF válido de até 25 MB')
    token = uuid4()
    directory = Path(settings.STORAGE_DIR)/'contract_amendments'
    directory.mkdir(parents=True, exist_ok=True)
    (directory/f'{token}.pdf').write_bytes(content)
    metadata = dict(token=str(token), contract_id=str(contract_id), actor_id=str(user.id),
        filename=Path(file.filename or 'instrumento.pdf').name[:200], size=len(content), sha256=hashlib.sha256(content).hexdigest())
    (directory/f'{token}.json').write_text(json.dumps(metadata), encoding='utf-8')
    return {'attachment_token': token, 'filename': metadata['filename']}


@amendment_router.get('/{contract_id}/amendments/{amendment_id}/attachment')
async def download(contract_id: UUID, amendment_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(financial_view)):
    visible(user)
    row = await db.get(PaymentContractAmendment, amendment_id)
    if not row or row.contract_id != contract_id or not row.attachment:
        raise HTTPException(404, 'Anexo não encontrado')
    token = UUID(row.attachment['token'])
    path = Path(settings.STORAGE_DIR)/'contract_amendments'/f'{token}.pdf'
    if not path.is_file():
        raise HTTPException(404, 'Arquivo não disponível')
    return FileResponse(path, media_type='application/pdf', filename=row.attachment['filename'])
