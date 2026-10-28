"""Quantities and item prices; caller owns the transaction and the contract row lock."""
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from app.models.contract_item import (ContractItem, ContractQuantityControl, ContractItemPrice,
    ContractReservationItem, ContractOperationItem, ContractItemMovement)
from app.models.contract_balance import ContractControl, ContractFuelPrice, ContractReservation
from app.schemas.contract_balance import PriceCreate
from app.schemas.contract_item import ContractItemCreate, ItemPriceCreate
from app.services.contract_balance_service import ContractBalanceService, NETWORK_VALUE, fuel_key, money, pricing_mode, utcnow


def quantity(value):
    return Decimal(str(value or 0)).quantize(Decimal('.001'), rounding=ROUND_HALF_UP)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str, separators=(',', ':')).encode()).hexdigest()


def fields(data):
    return data.model_dump() if hasattr(data, 'model_dump') else dict(data)


class ContractItemService:
    def __init__(self, db):
        self.db = db
        self.balance = ContractBalanceService(db)

    async def get(self, contract_id, item_id):
        row = await self.db.get(ContractItem, item_id)
        if not row or row.contract_id != contract_id or not row.active:
            raise HTTPException(422, 'Item não pertence a este contrato ou está inativo')
        return row

    async def balances(self, contract_id):
        rows = (await self.db.execute(select(ContractItemMovement.item_id,
            func.sum(ContractItemMovement.quantity_delta), func.sum(ContractItemMovement.reserved_delta))
            .where(ContractItemMovement.contract_id == contract_id).group_by(ContractItemMovement.item_id))).all()
        return {item: dict(remaining=quantity(total), reserved=quantity(reserved), available=quantity(total-reserved))
                for item, total, reserved in rows}

    async def list(self, contract_id):
        await self.balance.contract(contract_id)
        control = await self.db.get(ContractQuantityControl, contract_id)
        totals = await self.balances(contract_id)
        items = (await self.db.scalars(select(ContractItem).where(ContractItem.contract_id == contract_id)
            .order_by(ContractItem.original_number, ContractItem.code))).all()
        result = []
        for item in items:
            row = {col.name: getattr(item, col.name) for col in item.__table__.columns}
            row.update(totals.get(item.id, dict(remaining=None, reserved=None, available=None)))
            row['consumed_since_opening'] = (quantity(item.opening_quantity + await self.added_since_opening(item.id) - row['remaining'])
                if control else None)
            result.append(row)
        return dict(opened=bool(control), adjudication=control.adjudication if control else None,
            opened_at=control.opened_at if control else None, items=result, prices=await self.prices(contract_id),
            original_complements_supported=True)

    async def added_since_opening(self, item_id):
        return quantity(await self.db.scalar(select(func.coalesce(func.sum(ContractItemMovement.quantity_delta), 0))
            .where(ContractItemMovement.item_id == item_id, ContractItemMovement.movement_type == 'AMENDMENT')))

    async def create(self, contract_id, data, actor, *, item_id=None):
        contract = await self.balance.contract(contract_id, lock=True)
        if await self.db.get(ContractQuantityControl, contract_id):
            raise HTTPException(409, 'Abertura já confirmada. Preserve os itens originais e registre alterações por instrumento.')
        return await self._store_item(contract, data, actor, item_id=item_id)

    async def _store_item(self, contract, data, actor, *, item_id=None):
        contract_id = contract.id
        values = fields(data)
        allowed = {'FUEL', 'ADDITIVE'} if contract.kind == 'FUEL' else {'SERVICE', 'PART'}
        if values['category'] not in allowed:
            raise HTTPException(422, 'Categoria incompatível com o objeto do contrato')
        values['code'] = values['code'].strip()
        values['product_key'] = fuel_key(values.get('product_key')) or None
        if values['category'] in {'FUEL', 'ADDITIVE'} and not values['product_key']:
            raise HTTPException(422, 'Identifique o combustível ou aditivo correspondente ao item')
        if not values['code'] or not values['description'].strip() or not values['unit'].strip():
            raise HTTPException(422, 'Informe código, descrição e unidade do item')
        duplicate = await self.db.scalar(select(ContractItem.id).where(ContractItem.contract_id == contract_id,
            ContractItem.code == values['code']))
        if duplicate and duplicate != item_id:
            raise HTTPException(409, 'Código já cadastrado neste contrato')
        row = await self.get(contract_id, item_id) if item_id else ContractItem(contract_id=contract_id)
        for key, value in values.items():
            setattr(row, key, value)
        self.db.add(row)
        await self.db.flush()
        await self.balance.audit.record(actor=actor, action='CONFIGURE_CONTRACT_ITEM', entity_type='PAYMENT_CONTRACT',
            entity_id=contract_id, entity_label=contract.number, details={'item_id': str(row.id), 'code': row.code})
        return row

    async def complement_original(self, contract_id, data, actor):
        """Append an omitted original item; never change money or existing quantity/price records."""
        from app.core.config import settings
        if not settings.CONTRACT_QUANTITY_ENABLED:
            raise HTTPException(409, 'Controle por itens não habilitado neste ambiente')
        contract = await self.balance.contract(contract_id, lock=True)
        event_key = f'original-complement:{data.request_key}'
        digest = fingerprint(data.model_dump(mode='json'))
        prior = await self.db.scalar(select(ContractItemMovement).where(ContractItemMovement.event_key == event_key))
        if prior:
            if prior.contract_id != contract_id or (prior.details or {}).get('request_fingerprint') != digest:
                raise HTTPException(409, 'Identificação já utilizada com outros dados ou em outro contrato')
            return await self.db.get(ContractItem, prior.item_id)
        control = await self.db.get(ContractQuantityControl, contract_id)
        if not control or not await self.db.get(ContractControl, contract_id):
            raise HTTPException(409, 'Antes da abertura, utilize Cadastrar item e confira as quantidades do contrato')
        if control.adjudication == 'GROUP' and not data.group_key:
            raise HTTPException(422, 'Informe o lote/grupo original deste item')
        duplicate = select(ContractItem.id).where(ContractItem.contract_id == contract_id,
            func.lower(ContractItem.original_number) == data.original_number.lower())
        if control.adjudication == 'GROUP':
            duplicate = duplicate.where(func.lower(func.coalesce(ContractItem.group_key, '')) == data.group_key.lower())
        if await self.db.scalar(duplicate.limit(1)):
            raise HTTPException(409, 'Este número de item original já está cadastrado. Consulte o item existente; não duplique suas quantidades.')
        product = fuel_key(data.product_key)
        if data.category in {'FUEL', 'ADDITIVE'} and await self.db.scalar(select(ContractItem.id).where(
                ContractItem.contract_id == contract_id, ContractItem.category == data.category,
                ContractItem.product_key == product, ContractItem.active.is_(True)).limit(1)):
            raise HTTPException(409, 'Este combustível ou aditivo já possui item ativo. Consulte o cadastro existente.')
        network = pricing_mode(contract) == NETWORK_VALUE
        if network and data.prices:
            raise HTTPException(422, 'Rede por valor acompanha quantidades sem cadastrar preços fixos por item')
        if not network and not data.prices:
            raise HTTPException(422, 'Informe ao menos uma oficina/posto e o preço cobrado pelo novo item')
        now = utcnow()
        # Validate every assignment before inserting. Existing fuel versions must be chosen explicitly.
        for assignment in data.prices:
            provider = await self.balance.provider(contract_id, assignment.provider_id)
            if data.category != 'FUEL':
                if assignment.fuel_price_id:
                    raise HTTPException(422, 'Preço de combustível não corresponde a serviço, peça ou ARLA')
                continue
            if not provider.fuel_station_id:
                raise HTTPException(422, 'Selecione um posto executante para o combustível')
            if assignment.fuel_price_id:
                legacy = await self.db.get(ContractFuelPrice, assignment.fuel_price_id, populate_existing=True)
                if (not legacy or legacy.provider_id != provider.id or legacy.fuel_type != product
                        or legacy.unit_price != assignment.unit_price or legacy.deleted_at
                        or legacy.valid_from > now or (legacy.valid_until and legacy.valid_until <= now)):
                    raise HTTPException(409, 'O preço selecionado não está vigente ou não corresponde ao item/posto. Confira novamente.')
            elif await self.db.scalar(select(ContractFuelPrice.id).where(
                    ContractFuelPrice.provider_id == provider.id, ContractFuelPrice.fuel_type == product,
                    ContractFuelPrice.deleted_at.is_(None),
                    or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > now)).limit(1)):
                raise HTTPException(409, 'Já existe preço vigente ou agendado deste combustível no posto. Selecione a versão vigente, sem substituí-la.')
        original = data.model_dump(include=set(ContractItemCreate.model_fields), exclude={'reference_unit_price'})
        row = await self._store_item(contract, ContractItemCreate(**original, reference_unit_price=data.original_unit_price), actor)
        row.opening_quantity = data.remaining_quantity
        row.historical_added_quantity = data.historical_added_quantity
        configured_prices = []
        for assignment in data.prices:
            legacy_id = assignment.fuel_price_id
            if data.category == 'FUEL' and not legacy_id:
                # Only a missing product/version is initialized. No old version is closed or repriced.
                legacy = ContractFuelPrice(provider_id=assignment.provider_id, fuel_type=product,
                    unit_price=assignment.unit_price, valid_from=now, created_by=actor.id)
                self.db.add(legacy)
                await self.db.flush()
                legacy_id = legacy.id
            configured = await self.set_price(contract_id, ItemPriceCreate(item_id=row.id, provider_id=assignment.provider_id,
                unit_price=assignment.unit_price, fuel_price_id=legacy_id, valid_from=now), actor)
            configured_prices.append(dict(price_id=str(configured.id), provider_id=str(assignment.provider_id),
                unit_price=str(assignment.unit_price), fuel_price_id=str(legacy_id) if legacy_id else None))
        await self.movement(contract_id, row.id, event_key, 'ORIGINAL_ITEM_COMPLEMENT', actor,
            quantity_delta=data.remaining_quantity, details=dict(request_fingerprint=digest,
                document_reference=data.document_reference, justification=data.justification,
                original_quantity=str(data.original_quantity), original_unit_price=str(data.original_unit_price),
                historical_added_quantity=str(data.historical_added_quantity),
                prices=configured_prices, financial_effect='NONE'))
        await self.balance.audit.record(actor=actor, action='COMPLEMENT_ORIGINAL_ITEM',
            entity_type='PAYMENT_CONTRACT', entity_id=contract_id, entity_label=contract.number,
            details=dict(item_id=str(row.id), code=row.code, document_reference=data.document_reference,
                justification=data.justification, remaining_quantity=str(data.remaining_quantity), financial_effect='NONE'))
        return row

    async def prices(self, contract_id, *, provider_id=None):
        stmt = select(ContractItemPrice).join(ContractItem, ContractItem.id == ContractItemPrice.item_id)
        stmt = stmt.where(ContractItem.contract_id == contract_id).order_by(ContractItemPrice.valid_from.desc())
        if provider_id:
            stmt = stmt.where(ContractItemPrice.provider_id == provider_id)
        result = []
        now = utcnow()
        for p in (await self.db.scalars(stmt)).all():
            live = p.valid_from <= now and (not p.valid_until or p.valid_until > now)
            if live and p.fuel_price_id:
                legacy = await self.db.get(ContractFuelPrice, p.fuel_price_id, populate_existing=True)
                live = bool(legacy and not legacy.deleted_at and legacy.valid_from <= now
                    and (not legacy.valid_until or legacy.valid_until > now) and legacy.unit_price == p.unit_price)
            result.append(dict(id=p.id, item_id=p.item_id, provider_id=p.provider_id, unit_price=p.unit_price,
                valid_from=p.valid_from, valid_until=p.valid_until, fuel_price_id=p.fuel_price_id,
                amendment_id=p.amendment_id, current=live))
        return result

    async def set_price(self, contract_id, data, actor, *, amendment_id=None):
        await self.balance.contract(contract_id, lock=True)
        item = await self.get(contract_id, data.item_id)
        provider = await self.balance.provider(contract_id, data.provider_id)
        start = data.valid_from or utcnow()
        if not start.tzinfo:
            raise HTTPException(422, 'Informe o fuso da vigência do preço')
        later = await self.db.scalar(select(ContractItemPrice.id).where(ContractItemPrice.item_id == item.id,
            ContractItemPrice.provider_id == provider.id, ContractItemPrice.valid_from >= start,
            or_(ContractItemPrice.valid_until.is_(None), ContractItemPrice.valid_until > ContractItemPrice.valid_from)))
        if later:
            raise HTTPException(409, 'Existe preço com início igual ou posterior. Confira as vigências.')
        old = (await self.db.scalars(select(ContractItemPrice).where(ContractItemPrice.item_id == item.id,
            ContractItemPrice.provider_id == provider.id,
            or_(ContractItemPrice.valid_until.is_(None), ContractItemPrice.valid_until > start)))).all()
        for price in old:
            price.valid_until = start
        fuel_price_id = None
        if item.category == 'FUEL':
            if data.fuel_price_id:
                legacy = await self.db.get(ContractFuelPrice, data.fuel_price_id)
                if (not legacy or legacy.provider_id != provider.id or legacy.fuel_type != item.product_key
                        or legacy.unit_price != data.unit_price or legacy.deleted_at):
                    raise HTTPException(422, 'O preço existente não corresponde ao item e ao posto selecionados')
                # Exact existing version, explicitly chosen by the manager; no name-based import.
                fuel_price_id = legacy.id
            else:
                legacy = await self.balance.add_price(contract_id, PriceCreate(provider_id=provider.id,
                    fuel_type=item.product_key, unit_price=data.unit_price, valid_from=start), actor, amendment=bool(amendment_id))
                fuel_price_id = legacy.id
        row = ContractItemPrice(item_id=item.id, provider_id=provider.id, unit_price=data.unit_price,
            valid_from=start, fuel_price_id=fuel_price_id, amendment_id=amendment_id, created_by=actor.id)
        self.db.add(row)
        await self.db.flush()
        await self.balance.audit.record(actor=actor, action='SET_CONTRACT_ITEM_PRICE', entity_type='PAYMENT_CONTRACT',
            entity_id=contract_id, entity_label=item.description, details={'item_id': str(item.id), 'price_id': str(row.id), 'amendment_id': str(amendment_id) if amendment_id else None})
        return row

    async def movement(self, contract_id, item_id, key, kind, actor=None, **values):
        prior = await self.db.scalar(select(ContractItemMovement).where(ContractItemMovement.event_key == key))
        if prior:
            return prior
        row = ContractItemMovement(contract_id=contract_id, item_id=item_id, event_key=key,
            movement_type=kind, actor_id=getattr(actor, 'id', None), **values)
        self.db.add(row)
        await self.db.flush()
        return row

    async def open(self, contract_id, data, actor):
        await self.balance.contract(contract_id, lock=True)
        digest = fingerprint(data.model_dump(mode='json'))
        prior = await self.db.get(ContractQuantityControl, contract_id)
        if prior:
            if prior.request_key == data.request_key and prior.request_fingerprint == digest:
                return await self.list(contract_id)
            raise HTTPException(409, 'As quantidades já foram abertas. Utilize alteração vinculada, sem sobrescrever o histórico.')
        used_key = await self.db.scalar(select(ContractQuantityControl.contract_id).where(ContractQuantityControl.request_key == data.request_key))
        if used_key:
            raise HTTPException(409, 'Identificação já utilizada na abertura de outro contrato')
        if not data.history_confirmed:
            raise HTTPException(422, 'Confirme a conferência do histórico e da base de incidência')
        if not await self.db.get(ContractControl, contract_id):
            raise HTTPException(409, 'Confirme primeiro o saldo financeiro')
        items = (await self.db.scalars(select(ContractItem).where(ContractItem.contract_id == contract_id, ContractItem.active.is_(True)))).all()
        if not items or {i.id for i in items} != {i.item_id for i in data.items} or len(data.items) != len(items):
            raise HTTPException(422, 'Confira exatamente uma abertura para cada item ativo')
        if data.adjudication == 'GROUP' and any(not i.group_key for i in items):
            raise HTTPException(422, 'Identifique o lote/grupo de todos os itens')
        held = (await self.db.scalars(select(ContractReservation).where(ContractReservation.contract_id == contract_id,
            ContractReservation.status == 'HELD'))).all()
        if {r.id for r in held} != {r.reservation_id for r in data.reservations} or len(held) != len(data.reservations):
            raise HTTPException(409, 'As reservas abertas mudaram. Distribua todos os pedidos e confira novamente.')
        by_id = {i.id: i for i in items}
        priced = {p['item_id'] for p in await self.prices(contract_id) if p['current']}
        if any(i.id not in priced for i in items):
            raise HTTPException(409, 'Vincule ao menos um preço vigente e executante a cada item antes de confirmar a abertura')
        for opening in data.items:
            item = by_id[opening.item_id]
            if opening.remaining_quantity > item.original_quantity + opening.historical_added_quantity:
                raise HTTPException(422, f'Quantidade remanescente superior ao contratado no item {item.code}')
            item.opening_quantity = opening.remaining_quantity
            item.historical_added_quantity = opening.historical_added_quantity
            await self.movement(contract_id, item.id, f'opening:{contract_id}:{item.id}', 'OPENING', actor,
                quantity_delta=opening.remaining_quantity, details={'historical_added_quantity': str(opening.historical_added_quantity)})
        self.db.add(ContractQuantityControl(contract_id=contract_id, adjudication=data.adjudication,
            justification=data.justification, document_reference=data.document_reference, request_key=data.request_key,
            request_fingerprint=digest, opened_by=actor.id))
        await self.db.flush()
        for entry in data.reservations:
            reservation = next(r for r in held if r.id == entry.reservation_id)
            prepared = []
            fuels = []
            for line in entry.lines:
                item = await self.get(contract_id, line.item_id)
                unit = line.unit_price if line.unit_price is not None else reservation.unit_price
                if unit is None:
                    raise HTTPException(422, 'Informe os valores originais das linhas da reserva herdada')
                if item.category == 'FUEL':
                    fuels.append((item, line.quantity, unit))
                prepared.append(dict(item_id=item.id, quantity=line.quantity, unit_price=unit,
                    amount=money(line.quantity*unit), price_id=None))
            if sum((r['amount'] for r in prepared), Decimal(0)) != reservation.amount:
                raise HTTPException(422, 'A distribuição precisa preservar exatamente o valor financeiro reservado')
            if reservation.source_type in {'FUEL_ORDER','FUEL_DIRECT'} and (len(fuels) != 1
                    or fuels[0][0].product_key != fuel_key(reservation.fuel_type)
                    or fuels[0][1] != reservation.liters or fuels[0][2] != reservation.unit_price):
                raise HTTPException(422, 'Preserve o combustível, os litros e o preço originais do pedido herdado')
            await self.hold(reservation, prepared, actor)
        await self.balance.audit.record(actor=actor, action='OPEN_CONTRACT_QUANTITIES', entity_type='PAYMENT_CONTRACT',
            entity_id=contract_id, entity_label=str(contract_id), details={'adjudication': data.adjudication, 'items': len(items), 'legacy_reservations': len(held)})
        return await self.list(contract_id)

    async def resolve_product(self, contract_id, category, product):
        rows = (await self.db.scalars(select(ContractItem).where(ContractItem.contract_id == contract_id,
            ContractItem.category == category, ContractItem.product_key == fuel_key(product), ContractItem.active.is_(True)))).all()
        return rows[0] if len(rows) == 1 else None

    async def quote_lines(self, contract_id, provider_id, lines, *, require_open=True, check_available=True):
        if require_open and not await self.db.get(ContractQuantityControl, contract_id):
            raise HTTPException(409, 'Itens e quantidades ainda não conferidos. Abra a configuração do contrato.')
        await self.balance.provider(contract_id, provider_id)
        prices = [p for p in await self.prices(contract_id, provider_id=provider_id) if p['current']]
        totals = await self.balances(contract_id)
        result, seen = [], set()
        for raw in lines:
            line = fields(raw)
            item = await self.get(contract_id, line.get('item_id'))
            if item.id in seen:
                raise HTTPException(422, 'Agrupe as quantidades do mesmo item em uma única linha')
            seen.add(item.id)
            q = quantity(line['quantity'])
            if q <= 0:
                raise HTTPException(422, 'Informe uma quantidade maior que zero')
            available = totals.get(item.id, {}).get('available')
            if check_available and (available is None or available < q):
                raise HTTPException(409, f'Quantidade insuficiente em {item.description}. Disponível: {available if available is not None else "pendente"} {item.unit}.')
            price = next((p for p in prices if p['item_id'] == item.id), None)
            if not price:
                raise HTTPException(409, f'Vincule um preço vigente para {item.description} neste executante')
            if line.get('expected_price_id') and str(line['expected_price_id']) != str(price['id']):
                raise HTTPException(409, 'O preço do item mudou. Atualize a prévia.')
            if line.get('unit_price') is not None and Decimal(str(line['unit_price'])) != price['unit_price']:
                raise HTTPException(409, 'Valor do item diferente do preço vigente. Atualize a prévia.')
            result.append(dict(item_id=item.id, description=item.description, category=item.category, product_key=item.product_key, unit=item.unit,
                quantity=q, unit_price=price['unit_price'], amount=money(q*price['unit_price']),
                price_id=price['id'], fuel_price_id=price['fuel_price_id'], available=available))
        if not result:
            raise HTTPException(422, 'Informe os itens e as quantidades do pedido')
        return result

    async def hold(self, reservation, lines, actor):
        prior = (await self.db.scalars(select(ContractReservationItem).where(ContractReservationItem.reservation_id == reservation.id))).all()
        marker = f'hold:{reservation.id}:{reservation.generation}:'
        count = await self.db.scalar(select(func.count()).select_from(ContractItemMovement).where(ContractItemMovement.event_key.like(marker+'%')))
        if count:
            expected = sorted((str(x['item_id']), quantity(x['quantity']), Decimal(str(x['unit_price']))) for x in lines)
            actual = sorted((str(x.item_id), x.quantity, x.unit_price) for x in prior)
            if actual != expected:
                raise HTTPException(409, 'Pedido repetido com outras quantidades ou preços')
            return
        totals = await self.balances(reservation.contract_id)
        seen = set()
        for line in lines:
            item_id = line['item_id']
            if item_id in seen or totals.get(item_id, {}).get('available', Decimal(-1)) < line['quantity']:
                raise HTTPException(409, 'Quantidade insuficiente para reservar os itens')
            seen.add(item_id)
            row = next((r for r in prior if r.item_id == item_id), None)
            if not row:
                row = ContractReservationItem(reservation_id=reservation.id, item_id=item_id)
                self.db.add(row)
            row.quantity, row.unit_price, row.price_id = line['quantity'], line['unit_price'], line.get('price_id')
            await self.movement(reservation.contract_id, item_id, marker+str(item_id), 'RESERVE', actor,
                reserved_delta=line['quantity'], source_id=reservation.source_id,
                details={'quantity': str(line['quantity']), 'unit_price': str(line['unit_price']), 'generation': reservation.generation})
        for row in prior:
            if row.item_id not in seen:
                row.quantity = Decimal(0)  # Previous generation remains in the immutable ledger.
        await self.db.flush()

    async def release(self, reservation, actor=None):
        rows = (await self.db.scalars(select(ContractReservationItem).where(ContractReservationItem.reservation_id == reservation.id))).all()
        for row in rows:
            held = await self.db.scalar(select(ContractItemMovement.id).where(
                ContractItemMovement.event_key == f'hold:{reservation.id}:{reservation.generation}:{row.item_id}'))
            if held:
                await self.movement(reservation.contract_id, row.item_id,
                    f'release:{reservation.id}:{reservation.generation}:{row.item_id}', 'RELEASE', actor,
                    reserved_delta=-row.quantity, source_id=reservation.source_id)

    async def reservation_lines(self, reservation_id):
        rows = (await self.db.execute(select(ContractReservationItem, ContractItem)
            .join(ContractItem, ContractItem.id == ContractReservationItem.item_id)
            .where(ContractReservationItem.reservation_id == reservation_id, ContractReservationItem.quantity > 0))).all()
        return [dict(item_id=i.id, code=i.code, description=i.description, category=i.category, product_key=i.product_key, unit=i.unit,
            quantity=r.quantity, unit_price=r.unit_price, amount=money(r.quantity*r.unit_price), expected_price_id=r.price_id) for r, i in rows]

    async def assert_replay(self, reservation_id, lines, *, fuel_type=None, liters=None):
        held = await self.reservation_lines(reservation_id)
        if not held:
            return  # A historical retry does not create a new reservation.
        if lines is None and fuel_type:
            original = next((r for r in held if r['category'] == 'FUEL'), None)
            lines = [dict(item_id=original['item_id'], quantity=liters)] if original else []
        expected = sorted((str(fields(r).get('item_id')), quantity(fields(r)['quantity'])) for r in (lines or []))
        actual = sorted((str(r['item_id']), r['quantity']) for r in held)
        if expected != actual:
            raise HTTPException(409, 'Identificação repetida com outros itens ou quantidades')

    async def operation_lines(self, operation):
        return (await self.db.scalars(select(ContractOperationItem).where(ContractOperationItem.operation_id == operation.id,
            ContractOperationItem.revision == operation.item_revision))).all()

    async def realize(self, operation, lines, actor, *, allow_update=False):
        """Record factual quantities, even if the real supply exceeds or differs from authorization."""
        old = await self.operation_lines(operation)
        normalized = []
        for raw in lines:
            line = fields(raw)
            q = quantity(line['quantity'])
            if q <= 0:
                continue
            item_id = line.get('item_id')
            item = await self.get(operation.contract_id, item_id) if item_id else None
            allowed = {'FUEL','ADDITIVE'} if operation.source_type == 'FUEL_SUPPLY' else {'SERVICE','PART'}
            if (item.category if item else line.get('category')) not in allowed:
                raise HTTPException(422, 'Categoria realizada incompatível com a operação')
            amount = money(line.get('amount') if line.get('amount') is not None else q*Decimal(str(line.get('unit_price') or 0)))
            unit = (amount/q).quantize(Decimal('.000001'), rounding=ROUND_HALF_UP)
            normalized.append(dict(item_id=item.id if item else None, description=item.description if item else line.get('description') or 'Item sem vínculo',
                category=item.category if item else line.get('category') or 'SERVICE', quantity=q, unit_price=unit, amount=amount))
        if sum((r['amount'] for r in normalized), Decimal(0)) != operation.amount:
            raise HTTPException(422, 'A soma dos itens realizados precisa ser igual ao total do comprovante/serviço')
        digest = fingerprint(normalized)
        if operation.item_revision and fingerprint([dict(item_id=r.item_id, description=r.description, category=r.category,
                quantity=r.quantity, unit_price=r.unit_price, amount=r.amount) for r in old]) == digest:
            return
        if operation.item_revision and not allow_update:
            raise HTTPException(409, 'Execução já registrada com outros itens. Utilize a retificação.')
        # A legacy operation predating the quantity opening must not consume quantities again.
        control = await self.db.get(ContractQuantityControl, operation.contract_id)
        if not control:
            return
        changes = defaultdict(Decimal)
        for row in old:
            if row.item_id:
                changes[row.item_id] += row.quantity
        for row in normalized:
            if row['item_id']:
                changes[row['item_id']] -= row['quantity']
        operation.item_revision += 1
        for item_id, delta in changes.items():
            if delta:
                await self.movement(operation.contract_id, item_id,
                    f'actual:{operation.id}:{operation.item_revision}:{item_id}', 'CONSUMPTION' if not old else 'RECTIFICATION', actor,
                    quantity_delta=delta, source_id=operation.id, details={'before': [str(r.quantity) for r in old if r.item_id == item_id], 'actual': digest})
        for row in normalized:
            self.db.add(ContractOperationItem(operation_id=operation.id, revision=operation.item_revision, **row))
        await self.db.flush()
        totals = await self.balances(operation.contract_id)
        if any(r['available'] < 0 for r in totals.values()) or any(r['item_id'] is None for r in normalized):
            financial = await self.db.get(ContractControl, operation.contract_id)
            financial.divergence_open = True
            financial.divergence_note = 'Execução com quantidade acima do disponível ou item sem vínculo. Confira o extrato de itens e regularize antes de novos pedidos.'
            await self.db.flush()

    async def actual_fuel_lines(self, contract_id, supply, explicit=None):
        if supply.additive_type and not supply.additive_quantity_liters:
            raise HTTPException(422, 'Informe a quantidade efetivamente utilizada do aditivo')
        if explicit is not None:
            fuel, additive = [], []
            for raw in explicit:
                line = fields(raw)
                item = await self.get(contract_id, line['item_id']) if line.get('item_id') else None
                category = item.category if item else line.get('category')
                if category == 'FUEL':
                    if item and item.product_key != fuel_key(supply.fuel_type):
                        raise HTTPException(422, 'O item realizado deve corresponder ao combustível efetivamente abastecido')
                    line.update(category='FUEL', description=supply.fuel_type)
                    fuel.append(line)
                elif category == 'ADDITIVE':
                    if item and item.product_key != fuel_key(supply.additive_type):
                        raise HTTPException(422, 'O item realizado deve corresponder ao aditivo informado')
                    line.update(category='ADDITIVE', description=supply.additive_type)
                    additive.append(line)
                else:
                    raise HTTPException(422, 'Abastecimento só pode registrar combustível e aditivo')
            if len(fuel) != 1 or quantity(fuel[0]['quantity']) != quantity(supply.liters):
                raise HTTPException(422, 'Confira os litros do combustível efetivamente abastecido')
            if (len(additive) != (1 if supply.additive_quantity_liters else 0)
                    or additive and quantity(additive[0]['quantity']) != quantity(supply.additive_quantity_liters)):
                raise HTTPException(422, 'Confira a quantidade do aditivo efetivamente utilizado')
            return fuel+additive
        if supply.additive_quantity_liters:
            raise HTTPException(422, 'Discrimine combustível e aditivo com quantidades e valores do comprovante')
        item = await self.resolve_product(contract_id, 'FUEL', supply.fuel_type)
        return [dict(item_id=item.id if item else None, quantity=quantity(supply.liters), amount=money(supply.total_amount),
            description=supply.fuel_type, category='FUEL')]
