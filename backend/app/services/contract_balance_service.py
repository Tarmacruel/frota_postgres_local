"""Transactional contract commitments. Callers commit the operation and its ledger together."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.contract_balance import (
    ContractControl, ContractFuelPrice, ContractMovement, ContractOperation,
    ContractProvider, ContractReconciliation, ContractReservation,
)
from app.models.fuel_station import FuelStation
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.master_data import Organization
from app.models.payment_process import PaymentContract, PaymentContractStatus, PaymentProcess, PaymentSupplier
from app.models.user import User
from app.models.vehicle import Vehicle
from app.services.audit_service import AuditService

TZ = ZoneInfo('America/Sao_Paulo')
ZERO = Decimal('0.00')
FIXED_PRICE = 'FIXED_PRICE'
NETWORK_VALUE = 'NETWORK_VALUE'


def pricing_mode(contract):
    return getattr(contract, 'fuel_pricing_mode', None) or FIXED_PRICE


def utcnow():
    return datetime.now(timezone.utc)


def money(value):
    return Decimal(str(value or 0)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)


def fuel_key(value):
    return ' '.join(str(value or '').split()).upper()


def price_state(price, instant=None):
    instant = instant or utcnow()
    start = price.valid_from.replace(tzinfo=timezone.utc) if not price.valid_from.tzinfo else price.valid_from
    end = price.valid_until
    if end and not end.tzinfo:
        end = end.replace(tzinfo=timezone.utc)
    if price.deleted_at:
        return 'DELETED'
    if end and end <= start:
        return 'REPLACED'
    if end and end <= instant:
        return 'EXPIRED'
    return 'SCHEDULED' if start > instant else 'CURRENT'


def price_snapshot(price):
    return dict(id=str(price.id), provider_id=str(price.provider_id), fuel_type=price.fuel_type,
                unit_price=str(price.unit_price), valid_from=price.valid_from.isoformat(),
                valid_until=price.valid_until.isoformat() if price.valid_until else None,
                deleted_at=price.deleted_at.isoformat() if price.deleted_at else None)


def funding_fields(record):
    from app.core.config import settings
    if not settings.CONTRACT_BALANCE_ENABLED:
        return {}
    return {field: getattr(record, field, None) for field in
            ('contract_id', 'contract_provider_id', 'contract_reservation_id')}


class ContractBalanceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.audit = AuditService(db)

    async def contract(self, contract_id, *, lock=False):
        stmt = select(PaymentContract).where(PaymentContract.id == contract_id)
        if lock:
            stmt = stmt.with_for_update().execution_options(populate_existing=True)
        contract = await self.db.scalar(stmt)
        if not contract:
            raise HTTPException(404, 'Contrato não encontrado')
        return contract

    async def balances(self, contract_id):
        control = await self.db.get(ContractControl, contract_id, populate_existing=True)
        if not control:
            return dict(control_opened=False, opening_balance=None, opening_date=None,
                        contractual_balance=None, reserved_amount=ZERO, consumed_since_opening=ZERO,
                        available_balance=None, divergence_open=False, divergence_note=None)
        row = (await self.db.execute(select(
            func.coalesce(func.sum(ContractMovement.balance_delta), 0),
            func.coalesce(func.sum(ContractMovement.reserved_delta), 0),
            func.coalesce(func.sum(ContractMovement.consumed_delta), 0),
        ).where(ContractMovement.contract_id == contract_id))).one()
        balance, reserved, consumed = map(money, row)
        return dict(control_opened=True, opening_balance=control.opening_balance,
                    opening_date=control.opening_date, contractual_balance=balance,
                    reserved_amount=reserved, consumed_since_opening=consumed,
                    available_balance=balance-reserved, divergence_open=control.divergence_open,
                    divergence_note=control.divergence_note)

    async def errors(self, contract, *, require_open=True, require_price=None, require_quantity=None):
        errors = []
        from app.core.config import settings
        if require_price is None:
            require_price = pricing_mode(contract) != NETWORK_VALUE
        if require_quantity is None:
            require_quantity = pricing_mode(contract) != NETWORK_VALUE
        today = utcnow().astimezone(TZ).date()
        if contract.status != PaymentContractStatus.ACTIVE:
            errors.append('Contrato não está ativo')
        if not contract.kind:
            errors.append('Informe o tipo do contrato')
        if not contract.valid_from or not contract.valid_until:
            errors.append('Informe o início e o fim da vigência')
        elif not contract.valid_from <= today <= contract.valid_until:
            errors.append('Contrato fora da vigência')
        supplier = await self.db.get(PaymentSupplier, contract.supplier_id)
        if not supplier or not supplier.active:
            errors.append('Empresa contratada inativa')
        balance = await self.balances(contract.id)
        if require_open and not balance['control_opened']:
            errors.append('Saldo inicial ainda não confirmado')
        if balance['divergence_open']:
            errors.append('Regularize a divergência financeira')
        if balance['available_balance'] is not None and balance['available_balance'] <= 0:
            errors.append('Contrato sem saldo disponível')
        if require_open and require_price and getattr(contract.kind, 'value', contract.kind) == 'FUEL':
            instant = utcnow()
            price_count = await self.db.scalar(select(func.count()).select_from(ContractFuelPrice)
                .join(ContractProvider, ContractProvider.id == ContractFuelPrice.provider_id).where(
                    ContractProvider.contract_id == contract.id, ContractProvider.active.is_(True),
                    ContractFuelPrice.deleted_at.is_(None),
                    ContractFuelPrice.valid_from <= instant,
                    or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > instant)))
            if not price_count:
                errors.append('Cadastre um preço vigente de combustível')
        if require_open and require_quantity and settings.CONTRACT_QUANTITY_ENABLED:
            from app.models.contract_item import ContractQuantityControl
            if not await self.db.get(ContractQuantityControl, contract.id):
                errors.append('Itens e quantidades ainda não conferidos')
        return errors

    async def movement(self, *, event_key, contract_id, movement_type, actor=None, **fields):
        existing = await self.db.scalar(select(ContractMovement).where(ContractMovement.event_key == event_key))
        if existing:
            return existing
        row = ContractMovement(event_key=event_key, contract_id=contract_id,
                               movement_type=movement_type, actor_id=getattr(actor, 'id', None), **fields)
        self.db.add(row)
        await self.db.flush()
        if actor:
            await self.audit.record(actor=actor, action=movement_type, entity_type='CONTRACT_BALANCE',
                                    entity_id=row.id, entity_label=str(contract_id),
                                    details={'contract_id': str(contract_id), 'event_key': event_key,
                                             'balance_delta': str(row.balance_delta),
                                             'reserved_delta': str(row.reserved_delta),
                                             'consumed_delta': str(row.consumed_delta),
                                             'justification': row.justification})
        return row

    async def open_control(self, contract_id, data, actor):
        contract = await self.contract(contract_id, lock=True)
        if await self.db.get(ContractControl, contract_id):
            raise HTTPException(409, 'O saldo inicial já foi confirmado. Utilize um ajuste ou aditivo.')
        errors = await self.errors(contract, require_open=False)
        if errors:
            raise HTTPException(409, '; '.join(errors))
        if data.opening_date > utcnow().astimezone(TZ).date():
            raise HTTPException(422, 'A data de abertura não pode estar no futuro')
        if not contract.valid_from <= data.opening_date <= contract.valid_until:
            raise HTTPException(422, 'A data de abertura deve pertencer à vigência do contrato')
        providers = await self.db.scalar(select(func.count()).select_from(ContractProvider).where(
            ContractProvider.contract_id == contract_id, ContractProvider.active.is_(True)))
        if not providers:
            raise HTTPException(409, 'Vincule pelo menos um prestador antes de confirmar o saldo')
        self.db.add(ContractControl(contract_id=contract_id, opening_balance=money(data.balance),
                                   opening_date=data.opening_date, opened_by=actor.id,
                                   justification=data.justification))
        await self.movement(event_key=f'opening:{contract_id}', contract_id=contract_id,
                            movement_type='OPENING', actor=actor, balance_delta=money(data.balance),
                            source_type='OPENING', source_id=contract_id, justification=data.justification,
                            details={'opening_date': data.opening_date.isoformat()})
        return await self.balances(contract_id)

    async def provider(self, contract_id, provider_id, *, station_id=None):
        provider = await self.db.get(ContractProvider, provider_id)
        if not provider or provider.contract_id != contract_id or not provider.active:
            raise HTTPException(409, 'Prestador não está ativo na rede deste contrato')
        supplier = await self.db.get(PaymentSupplier, provider.supplier_id)
        if not supplier or not supplier.active:
            raise HTTPException(409, 'Prestador inativo')
        if station_id is not None and provider.fuel_station_id != station_id:
            raise HTTPException(409, 'O posto não pertence ao vínculo selecionado')
        if provider.fuel_station_id:
            station = await self.db.get(FuelStation, provider.fuel_station_id)
            if not station or not station.active:
                raise HTTPException(409, 'Posto inativo')
        return provider

    async def _validate_station(self, station_id):
        station = await self.db.scalar(select(FuelStation).where(FuelStation.id == station_id)
            .with_for_update().execution_options(populate_existing=True))
        if not station:
            raise HTTPException(404, 'Posto não encontrado')
        if not station.active:
            raise HTTPException(409, 'O posto está inativo')

    async def set_provider_active(self, contract_id, provider_id, active, actor):
        contract = await self.contract(contract_id, lock=True)
        provider = await self.db.get(ContractProvider, provider_id, populate_existing=True)
        if not provider or provider.contract_id != contract_id:
            raise HTTPException(404, 'Vínculo não encontrado')
        if provider.active == active:
            return {'id': provider_id, 'active': active}
        if active:
            supplier = await self.db.get(PaymentSupplier, provider.supplier_id)
            if not supplier or not supplier.active:
                raise HTTPException(409, 'Prestador inativo')
            if provider.fuel_station_id:
                await self._validate_station(provider.fuel_station_id)
        provider.active = active
        await self.audit.record(actor=actor, action='UPDATE_PROVIDER_LINK', entity_type='PAYMENT_CONTRACT',
            entity_id=contract_id, entity_label=contract.number, details={'provider_id': str(provider_id), 'active': active})
        await self.db.flush()
        return {'id': provider_id, 'active': active}

    async def add_provider(self, contract_id, data, actor):
        contract = await self.contract(contract_id, lock=True)
        supplier = await self.db.get(PaymentSupplier, data.supplier_id)
        if not supplier or not supplier.active:
            raise HTTPException(409, 'Selecione um prestador ativo')
        if getattr(contract.kind, 'value', contract.kind) == 'FUEL':
            if not data.fuel_station_id:
                raise HTTPException(422, 'Vincule o posto executante do abastecimento')
            await self._validate_station(data.fuel_station_id)
            previous = await self.db.scalar(select(ContractProvider.id).where(
                ContractProvider.contract_id == contract_id, ContractProvider.fuel_station_id == data.fuel_station_id))
            if previous:
                raise HTTPException(409, 'Este posto já possui um vínculo anterior neste contrato. Utilize Reativar vínculo.')
        elif data.fuel_station_id:
            raise HTTPException(422, 'Contrato de manutenção deve vincular uma oficina, sem posto')
        row = ContractProvider(contract_id=contract_id, **data.model_dump())
        self.db.add(row)
        await self.db.flush()
        await self.audit.record(actor=actor, action='LINK_PROVIDER', entity_type='PAYMENT_CONTRACT',
                                entity_id=contract_id, entity_label=contract.number,
                                details={'provider_id': str(row.id), 'supplier_id': str(data.supplier_id)})
        return row

    async def add_price(self, contract_id, data, actor, *, amendment=False):
        contract = await self.contract(contract_id, lock=True)
        if pricing_mode(contract) == NETWORK_VALUE:
            raise HTTPException(409, 'Contrato de rede por valor não utiliza preço por litro cadastrado')
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED and not amendment:
            from app.models.contract_item import ContractQuantityControl
            if await self.db.get(ContractQuantityControl, contract_id):
                raise HTTPException(409, 'Controle por itens iniciado: registre o novo preço em Registrar alteração contratual')
        provider = await self.provider(contract_id, data.provider_id)
        if getattr(contract.kind, 'value', contract.kind) != 'FUEL' or not provider.fuel_station_id:
            raise HTTPException(422, 'Preço de combustível exige um contrato e posto de abastecimento')
        start = data.valid_from or utcnow()
        if not start.tzinfo:
            raise HTTPException(422, 'Informe o fuso horário do início do preço')
        key = fuel_key(data.fuel_type)
        if not key:
            raise HTTPException(422, 'Informe o combustível')
        later = await self.db.scalar(select(ContractFuelPrice.id).where(
            ContractFuelPrice.provider_id == provider.id, ContractFuelPrice.fuel_type == key,
            ContractFuelPrice.deleted_at.is_(None),
            or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > ContractFuelPrice.valid_from),
            ContractFuelPrice.valid_from >= start).limit(1))
        if later:
            raise HTTPException(409, 'Já existe um preço com início igual ou posterior. Use uma nova vigência.')
        current = (await self.db.scalars(select(ContractFuelPrice).where(
            ContractFuelPrice.provider_id == provider.id, ContractFuelPrice.fuel_type == key,
            ContractFuelPrice.deleted_at.is_(None),
            or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > ContractFuelPrice.valid_from),
            or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > start)))).all()
        for price in current:
            price.valid_until = start
        row = ContractFuelPrice(provider_id=provider.id, fuel_type=key, unit_price=data.unit_price,
                                valid_from=start, created_by=actor.id)
        self.db.add(row)
        await self.db.flush()
        await self.audit.record(actor=actor, action='SET_FUEL_PRICE', entity_type='PAYMENT_CONTRACT',
                                entity_id=contract_id, entity_label=contract.number,
                                details={'price_id': str(row.id), 'fuel_type': key, 'unit_price': str(data.unit_price)})
        return row

    async def _locked_price(self, contract_id, price_id):
        contract = await self.contract(contract_id, lock=True)
        row = await self.db.scalar(select(ContractFuelPrice)
            .join(ContractProvider, ContractProvider.id == ContractFuelPrice.provider_id)
            .where(ContractFuelPrice.id == price_id, ContractProvider.contract_id == contract_id)
            .execution_options(populate_existing=True))
        if not row:
            raise HTTPException(404, 'Preço não encontrado neste contrato')
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.models.contract_item import ContractItemPrice, ContractQuantityControl
            if await self.db.get(ContractQuantityControl, contract_id) and await self.db.scalar(select(ContractItemPrice.id)
                    .where(ContractItemPrice.fuel_price_id == price_id).limit(1)):
                raise HTTPException(409, 'Preço vinculado ao controle de itens. Use Registrar alteração contratual; o histórico será preservado.')
        return contract, row

    async def _price_predecessor(self, row):
        return await self.db.scalar(select(ContractFuelPrice).where(
            ContractFuelPrice.provider_id == row.provider_id, ContractFuelPrice.fuel_type == row.fuel_type,
            ContractFuelPrice.id != row.id, ContractFuelPrice.deleted_at.is_(None),
            ContractFuelPrice.valid_from < row.valid_from,
            or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > ContractFuelPrice.valid_from))
            .order_by(ContractFuelPrice.valid_from.desc()).limit(1))

    async def update_price(self, contract_id, price_id, data, actor):
        contract, row = await self._locked_price(contract_id, price_id)
        instant = utcnow()
        state = price_state(row, instant)
        if state not in {'CURRENT', 'SCHEDULED'}:
            raise HTTPException(409, 'Este preço já foi encerrado, substituído ou excluído. Atualize a lista de preços.')
        start = row.valid_from if row.valid_from.tzinfo else row.valid_from.replace(tzinfo=timezone.utc)
        end = row.valid_until
        if end and not end.tzinfo:
            end = end.replace(tzinfo=timezone.utc)
        effective = data.valid_from or (start if state == 'SCHEDULED' else instant)
        if not effective.tzinfo:
            raise HTTPException(422, 'Informe o fuso horário do início do preço')
        if data.valid_from and effective < instant:
            raise HTTPException(422, 'A nova vigência não pode começar no passado; deixe em branco para aplicar agora')
        if end and effective >= end:
            raise HTTPException(409, 'A nova vigência deve começar antes do próximo preço agendado')
        if data.unit_price == row.unit_price and (data.valid_from is None or effective == start):
            return row
        before = price_snapshot(row)
        predecessor_change = None
        if state == 'SCHEDULED':
            predecessor = await self._price_predecessor(row)
            if predecessor:
                prev_start = predecessor.valid_from
                if not prev_start.tzinfo:
                    prev_start = prev_start.replace(tzinfo=timezone.utc)
                prev_end = predecessor.valid_until
                if prev_end and not prev_end.tzinfo:
                    prev_end = prev_end.replace(tzinfo=timezone.utc)
                if effective <= prev_start or (prev_end != start and (prev_end is None or effective < prev_end)):
                    raise HTTPException(409, 'A nova vigência conflita com outro preço deste posto e combustível')
                if prev_end == start:
                    predecessor_change = dict(before=price_snapshot(predecessor))
                    predecessor.valid_until = effective
                    predecessor_change['after'] = price_snapshot(predecessor)
            # An empty interval retains the superseded scheduled version without offering it to orders.
            row.valid_until = start
        else:
            row.valid_until = effective
        replacement = ContractFuelPrice(provider_id=row.provider_id, fuel_type=row.fuel_type,
            unit_price=data.unit_price, valid_from=effective, valid_until=end, created_by=actor.id)
        self.db.add(replacement)
        await self.db.flush()
        await self.audit.record(actor=actor, action='UPDATE_FUEL_PRICE', entity_type='PAYMENT_CONTRACT',
            entity_id=contract_id, entity_label=contract.number,
            details={'before': before, 'after': price_snapshot(replacement),
                     'predecessor': predecessor_change})
        return replacement

    async def delete_price(self, contract_id, price_id, actor):
        contract, row = await self._locked_price(contract_id, price_id)
        if row.deleted_at:
            return {'id': row.id, 'deleted_at': row.deleted_at}
        instant = utcnow()
        before = price_snapshot(row)
        predecessor_change = None
        if price_state(row, instant) == 'SCHEDULED':
            predecessor = await self._price_predecessor(row)
            if predecessor and predecessor.valid_until == row.valid_from:
                predecessor_change = dict(before=price_snapshot(predecessor))
                predecessor.valid_until = row.valid_until
                predecessor_change['after'] = price_snapshot(predecessor)
        row.deleted_at = instant
        await self.db.flush()
        await self.audit.record(actor=actor, action='DELETE_FUEL_PRICE', entity_type='PAYMENT_CONTRACT',
            entity_id=contract_id, entity_label=contract.number,
            details={'before': before, 'after': price_snapshot(row), 'predecessor': predecessor_change})
        return {'id': row.id, 'deleted_at': row.deleted_at}

    async def quote(self, contract_id, provider_id, fuel_type, liters, *, item_liters=None, item_lines=None, funding_mode=None):
        contract = await self.contract(contract_id)
        mode = funding_mode or pricing_mode(contract)
        errors = await self.errors(contract, require_price=mode != NETWORK_VALUE, require_quantity=mode != NETWORK_VALUE)
        if errors:
            raise HTTPException(409, '; '.join(errors))
        provider = await self.provider(contract_id, provider_id)
        if getattr(contract.kind, 'value', contract.kind) != 'FUEL' or not provider.fuel_station_id:
            raise HTTPException(409, 'Selecione um contrato de abastecimento')
        if not liters or Decimal(str(liters)) <= 0:
            raise HTTPException(422, 'Informe a quantidade prevista de litros')
        if not fuel_key(fuel_type):
            raise HTTPException(422, 'Informe o combustível solicitado')
        if item_liters is not None:
            quantities = [Decimal(str(quantity)) for quantity in item_liters]
            if any(quantity <= 0 for quantity in quantities) or sum(quantities) != Decimal(str(liters)):
                raise HTTPException(422, 'Confira os litros previstos de cada veículo do lote')
        if mode == NETWORK_VALUE:
            balances = await self.balances(contract_id)
            return dict(price_id=None, fuel_type=fuel_key(fuel_type), unit_price=None,
                liters=Decimal(str(liters)), reserve_amount=ZERO, funding_mode=NETWORK_VALUE,
                available_balance=balances['available_balance'], available_after=balances['available_balance'],
                sufficient=balances['available_balance'] > 0)
        instant = utcnow()
        price = await self.db.scalar(select(ContractFuelPrice).where(
            ContractFuelPrice.provider_id == provider_id, ContractFuelPrice.fuel_type == fuel_key(fuel_type),
            ContractFuelPrice.deleted_at.is_(None),
            ContractFuelPrice.valid_from <= instant,
            or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > instant)
        ).order_by(ContractFuelPrice.valid_from.desc()).limit(1))
        if not price:
            raise HTTPException(409, 'Não há preço vigente para este posto e combustível')
        amount = money(Decimal(str(liters)) * price.unit_price)
        from app.core.config import settings
        prepared = None
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.services.contract_item_service import ContractItemService
            items = ContractItemService(self.db)
            if not item_lines:
                item = await items.resolve_product(contract_id, 'FUEL', fuel_type)
                if not item:
                    raise HTTPException(409, 'Selecione o item contratual correspondente ao combustível')
                item_lines = [dict(item_id=item.id, quantity=liters)]
            prepared = await items.quote_lines(contract_id, provider_id, item_lines)
            primary = [line for line in prepared if line['category'] == 'FUEL']
            if len(primary) != 1 or primary[0]['quantity'] != Decimal(str(liters)) or primary[0]['fuel_price_id'] != price.id:
                raise HTTPException(422, 'Confira o item do combustível solicitado e seus litros previstos')
            amount = sum((line['amount'] for line in prepared), ZERO)
        if item_liters is not None:
            quantities = [Decimal(str(quantity)) for quantity in item_liters]
            if any(quantity <= 0 for quantity in quantities) or sum(quantities) != Decimal(str(liters)):
                raise HTTPException(422, 'Confira os litros previstos de cada veículo do lote')
            amount = sum((money(quantity*price.unit_price) for quantity in quantities), ZERO)
            if prepared:
                for line in prepared:
                    if line['category'] != 'FUEL':
                        each = line['quantity']/len(quantities)
                        if each != each.quantize(Decimal('.001')):
                            raise HTTPException(422, 'Confira a quantidade de aditivo por veículo do lote')
                        amount += money(each*line['unit_price'])*len(quantities)
        if amount <= 0:
            raise HTTPException(422, 'O valor previsto deve ser maior que zero')
        balances = await self.balances(contract_id)
        return dict(item_lines=prepared, price_id=price.id, fuel_type=price.fuel_type, unit_price=price.unit_price,
                    liters=Decimal(str(liters)), reserve_amount=amount,
                    available_balance=balances['available_balance'],
                    available_after=balances['available_balance']-amount,
                    sufficient=balances['available_balance'] >= amount)

    async def reserve(self, *, contract_id, provider_id, source_type, source_id, amount=None,
                      vehicle_id, organization_id, actor, fuel_type=None, liters=None,
                      expected_price_id=None, station_id=None, item_lines=None, funding_mode=None):
        contract = await self.contract(contract_id, lock=True)
        mode = funding_mode or pricing_mode(contract)
        if source_type in {'FUEL_ORDER', 'FUEL_DIRECT'} and mode == NETWORK_VALUE:
            raise HTTPException(409, 'Rede por valor registra somente o consumo real, sem reserva prévia')
        await self.release_expired(contract_id=contract_id, actor=actor)
        previous = await self.db.scalar(select(ContractReservation).where(
            ContractReservation.source_type == source_type, ContractReservation.source_id == source_id))
        if previous and previous.status != 'RELEASED':
            same = previous.contract_id == contract_id and previous.provider_id == provider_id
            if source_type in {'FUEL_ORDER', 'FUEL_DIRECT'}:
                same = same and previous.fuel_type == fuel_key(fuel_type) and previous.liters == Decimal(str(liters))
            else:
                same = same and previous.amount == money(amount)
            if not same:
                raise HTTPException(409, 'Pedido já possui outra reserva')
            from app.core.config import settings
            if settings.CONTRACT_QUANTITY_ENABLED:
                from app.services.contract_item_service import ContractItemService
                await ContractItemService(self.db).assert_replay(previous.id, item_lines, fuel_type=fuel_type, liters=liters)
            return previous
        errors = await self.errors(contract, require_price=mode != NETWORK_VALUE, require_quantity=mode != NETWORK_VALUE)
        if errors:
            raise HTTPException(409, '; '.join(errors))
        provider = await self.provider(contract_id, provider_id, station_id=station_id)
        if source_type in {'FUEL_ORDER', 'FUEL_DIRECT'}:
            if getattr(contract.kind, 'value', contract.kind) != 'FUEL' or not provider.fuel_station_id:
                raise HTTPException(409, 'Contrato ou posto incompatível com abastecimento')
            quote = await self.quote(contract_id, provider_id, fuel_type, liters, item_lines=item_lines, funding_mode=mode)
            if expected_price_id and quote['price_id'] != expected_price_id:
                raise HTTPException(409, 'O preço mudou. Atualize a prévia antes de emitir o pedido.')
            amount = quote['reserve_amount']
        else:
            if getattr(contract.kind, 'value', contract.kind) != 'MAINTENANCE' or provider.fuel_station_id:
                raise HTTPException(409, 'Contrato ou prestador incompatível com manutenção')
            quote = None
            from app.core.config import settings
            if settings.CONTRACT_QUANTITY_ENABLED:
                from app.services.contract_item_service import ContractItemService
                prepared = await ContractItemService(self.db).quote_lines(contract_id, provider_id, item_lines or [])
                total = sum((line['amount'] for line in prepared), ZERO)
                if money(amount) != total:
                    raise HTTPException(422, 'O orçamento precisa ser igual à soma dos itens previstos')
        amount = money(amount)
        if amount <= 0:
            raise HTTPException(422, 'Informe um orçamento previsto maior que zero')
        row = await self.db.scalar(select(ContractReservation).where(
            ContractReservation.source_type == source_type, ContractReservation.source_id == source_id))
        if row and row.status != 'RELEASED':
            if row.contract_id != contract_id or row.provider_id != provider_id or row.amount != amount:
                raise HTTPException(409, 'Pedido já possui outra reserva')
            return row
        balances = await self.balances(contract_id)
        if balances['available_balance'] < amount:
            raise HTTPException(409, f'Saldo insuficiente. Disponível: R$ {balances["available_balance"]:.2f}; pedido: R$ {amount:.2f}.')
        if row:
            if row.contract_id != contract_id:
                raise HTTPException(409, 'A reabertura deve manter o contrato original')
            row.generation += 1
            row.amount, row.status, row.finished_at = amount, 'HELD', None
        else:
            row = ContractReservation(contract_id=contract_id, provider_id=provider_id, source_type=source_type,
                                      source_id=source_id, amount=amount, vehicle_id=vehicle_id,
                                      organization_id=organization_id, created_by=actor.id)
            self.db.add(row)
        if quote:
            row.price_id, row.unit_price, row.fuel_type, row.liters = quote['price_id'], quote['unit_price'], quote['fuel_type'], quote['liters']
        await self.db.flush()
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.services.contract_item_service import ContractItemService
            await ContractItemService(self.db).hold(row, quote['item_lines'] if quote else prepared, actor)
        await self.movement(event_key=f'reserve:{row.id}:{row.generation}', contract_id=contract_id,
                            movement_type='RESERVE', actor=actor, reserved_delta=amount,
                            source_type=source_type, source_id=source_id, reservation_id=row.id,
                            vehicle_id=vehicle_id, organization_id=organization_id, provider_id=provider_id,
                            details={'price_id': str(row.price_id) if row.price_id else None,
                                     'unit_price': str(row.unit_price) if row.unit_price else None,
                                     'liters': str(row.liters) if row.liters else None, 'fuel_type': row.fuel_type})
        return row

    async def release(self, reservation_id, *, actor=None, reason='Cancelamento'):
        if not reservation_id:
            return False
        row = await self.db.get(ContractReservation, reservation_id)
        if not row:
            return False
        await self.contract(row.contract_id, lock=True)
        await self.db.refresh(row)
        if row.status != 'HELD':
            return False
        row.status, row.finished_at = 'RELEASED', utcnow()
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.services.contract_item_service import ContractItemService
            await ContractItemService(self.db).release(row, actor)
        await self.movement(event_key=f'release:{row.id}:{row.generation}', contract_id=row.contract_id,
                            movement_type='RELEASE', actor=actor, reserved_delta=-row.amount,
                            source_type=row.source_type, source_id=row.source_id, reservation_id=row.id,
                            vehicle_id=row.vehicle_id, organization_id=row.organization_id,
                            provider_id=row.provider_id, justification=reason)
        return True

    async def release_expired(self, *, contract_id=None, actor=None):
        stmt = select(ContractReservation.id, ContractReservation.contract_id).join(
            FuelSupplyOrder, and_(ContractReservation.source_id == FuelSupplyOrder.id,
                                  ContractReservation.source_type == 'FUEL_ORDER')).where(
            ContractReservation.status == 'HELD', or_(
                FuelSupplyOrder.status.in_([FuelSupplyOrderStatus.EXPIRED, FuelSupplyOrderStatus.CANCELLED]),
                and_(FuelSupplyOrder.status == FuelSupplyOrderStatus.OPEN, FuelSupplyOrder.expires_at <= utcnow())))
        if contract_id:
            stmt = stmt.where(ContractReservation.contract_id == contract_id)
        rows = (await self.db.execute(stmt.order_by(ContractReservation.contract_id, ContractReservation.id))).all()
        changed = False
        for reservation_id, _ in rows:
            changed = await self.release(reservation_id, actor=actor, reason='Reserva liberada por expiração ou cancelamento') or changed
            reservation = await self.db.get(ContractReservation, reservation_id)
            await self.db.execute(update(FuelSupplyOrder).where(FuelSupplyOrder.id == reservation.source_id,
                FuelSupplyOrder.status == FuelSupplyOrderStatus.OPEN, FuelSupplyOrder.expires_at <= utcnow())
                .values(status=FuelSupplyOrderStatus.EXPIRED))
        return changed

    async def settle(self, reservation_id, *, source_type, source_id, amount, occurred_at, actor, item_lines=None):
        reservation = await self.db.get(ContractReservation, reservation_id)
        if not reservation:
            raise HTTPException(409, 'Pedido sem reserva. Regularize o vínculo ao contrato antes de concluir.')
        await self.contract(reservation.contract_id, lock=True)
        await self.db.refresh(reservation)
        existing = await self.db.scalar(select(ContractOperation).where(
            ContractOperation.source_type == source_type, ContractOperation.source_id == source_id))
        amount = money(amount)
        if amount < 0:
            raise HTTPException(422, 'Custo não pode ser negativo')
        if existing:
            if existing.reservation_id != reservation.id or existing.amount != amount:
                raise HTTPException(409, 'Execução já registrada com outro valor')
            from app.core.config import settings
            if settings.CONTRACT_QUANTITY_ENABLED and item_lines is not None:
                from app.services.contract_item_service import ContractItemService
                await ContractItemService(self.db).realize(existing, item_lines, actor)
            return existing
        if reservation.status != 'HELD':
            raise HTTPException(409, 'A reserva não está disponível para execução')
        control = await self.db.get(ContractControl, reservation.contract_id)
        if occurred_at.astimezone(TZ).date() < control.opening_date:
            raise HTTPException(409, 'Execução anterior à abertura do controle; confira a data informada')
        operation = ContractOperation(contract_id=reservation.contract_id, provider_id=reservation.provider_id,
            reservation_id=reservation.id, source_type=source_type, source_id=source_id, amount=amount,
            occurred_at=occurred_at, vehicle_id=reservation.vehicle_id, organization_id=reservation.organization_id)
        self.db.add(operation)
        await self.db.flush()
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.services.contract_item_service import ContractItemService
            items = ContractItemService(self.db)
            from app.models.contract_item import ContractQuantityControl
            if not await self.db.get(ContractQuantityControl, reservation.contract_id):
                raise HTTPException(409, 'Confira as quantidades e distribua as reservas herdadas antes de concluir o pedido')
            if source_type == 'FUEL_SUPPLY':
                from app.models.fuel_supply import FuelSupply
                supply = await self.db.get(FuelSupply, source_id)
                item_lines = await items.actual_fuel_lines(reservation.contract_id, supply, item_lines)
            if item_lines is None:
                if amount != 0:
                    raise HTTPException(422, 'Informe os itens e as quantidades efetivamente realizados')
                item_lines = []
            await items.release(reservation, actor)
            await items.realize(operation, item_lines, actor)
        reservation.status, reservation.finished_at = 'SETTLED', utcnow()
        await self.movement(event_key=f'consume:{reservation.id}:{reservation.generation}', contract_id=reservation.contract_id,
            movement_type='CONSUMPTION', actor=actor, balance_delta=-amount, reserved_delta=-reservation.amount,
            consumed_delta=amount, reservation_id=reservation.id, operation_id=operation.id,
            source_type=source_type, source_id=source_id, vehicle_id=reservation.vehicle_id,
            organization_id=reservation.organization_id, provider_id=reservation.provider_id)
        await self.flag_overdraw(reservation.contract_id, f'Execução {source_id} acima do saldo disponível')
        return operation

    async def consume_unreserved(self, *, contract_id, provider_id, source_type, source_id, amount,
                                 occurred_at, vehicle_id, organization_id, actor, station_id, item_lines=None):
        contract = await self.contract(contract_id, lock=True)
        provider = await self.db.get(ContractProvider, provider_id)
        if (getattr(contract.kind, 'value', contract.kind) != 'FUEL' or not provider
                or provider.contract_id != contract_id or provider.fuel_station_id != station_id):
            raise HTTPException(409, 'Posto ou contrato incompatível com a execução')
        if amount is None or money(amount) <= 0:
            raise HTTPException(422, 'Informe o valor real do abastecimento')
        amount = money(amount)
        existing = await self.db.scalar(select(ContractOperation).where(
            ContractOperation.source_type == source_type, ContractOperation.source_id == source_id))
        if existing:
            if (existing.contract_id != contract_id or existing.provider_id != provider_id
                    or existing.amount != amount or existing.reservation_id is not None):
                raise HTTPException(409, 'Execução já registrada com outro vínculo ou valor')
            if item_lines is not None and existing.item_revision:
                from app.services.contract_item_service import ContractItemService
                await ContractItemService(self.db).realize(existing, item_lines, actor)
            return existing
        control = await self.db.get(ContractControl, contract_id)
        if not control or occurred_at.astimezone(TZ).date() < control.opening_date:
            raise HTTPException(409, 'Execução sem abertura do controle ou anterior à abertura; confira a data')
        row = ContractOperation(contract_id=contract_id, provider_id=provider_id, source_type=source_type,
            source_id=source_id, amount=amount, occurred_at=occurred_at, vehicle_id=vehicle_id,
            organization_id=organization_id)
        self.db.add(row)
        await self.db.flush()
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.models.contract_item import ContractQuantityControl
            if await self.db.get(ContractQuantityControl, contract_id):
                from app.models.fuel_supply import FuelSupply
                from app.services.contract_item_service import ContractItemService
                items = ContractItemService(self.db)
                supply = await self.db.get(FuelSupply, source_id)
                lines = await items.actual_fuel_lines(contract_id, supply, item_lines)
                await items.realize(row, lines, actor)
        await self.movement(event_key=f'consume-unreserved:{source_type}:{source_id}', contract_id=contract_id,
            movement_type='CONSUMPTION', actor=actor, balance_delta=-amount, consumed_delta=amount,
            operation_id=row.id, source_type=source_type, source_id=source_id, vehicle_id=vehicle_id,
            organization_id=organization_id, provider_id=provider_id, details={'funding_mode': NETWORK_VALUE})
        await self.flag_overdraw(contract_id, f'Execução {source_id} acima do saldo disponível')
        return row

    async def flag_overdraw(self, contract_id, note):
        balances = await self.balances(contract_id)
        if balances['available_balance'] is not None and balances['available_balance'] < 0:
            control = await self.db.get(ContractControl, contract_id)
            control.divergence_open, control.divergence_note = True, note
            await self.db.flush()

    async def rectify_operation(self, source_type, source_id, *, amount, actor, reason, occurred_at=None, item_lines=None):
        row = await self.db.scalar(select(ContractOperation).where(
            ContractOperation.source_type == source_type, ContractOperation.source_id == source_id))
        if not row:
            return None  # Imported history has no financial effect without an explicit opening/link.
        await self.contract(row.contract_id, lock=True)
        await self.db.refresh(row)
        if occurred_at is not None:
            control = await self.db.get(ContractControl, row.contract_id)
            if occurred_at.astimezone(TZ).date() < control.opening_date:
                raise HTTPException(409, 'Execução anterior à abertura do controle; confira a data informada')
            row.occurred_at = occurred_at
        delta = money(amount)-row.amount
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED and row.item_revision:
            from app.services.contract_item_service import ContractItemService
            items = ContractItemService(self.db)
            if source_type == 'FUEL_SUPPLY':
                from app.models.fuel_supply import FuelSupply
                supply = await self.db.get(FuelSupply, source_id)
                item_lines = await items.actual_fuel_lines(row.contract_id, supply, item_lines)
            if item_lines is None:
                if delta:
                    raise HTTPException(422, 'Confira as linhas e os valores reais para retificar o custo')
            else:
                row.amount = money(amount)
                await items.realize(row, item_lines, actor, allow_update=True)
        if not delta:
            return row
        if money(amount) < 0:
            raise HTTPException(422, 'Custo não pode ser negativo')
        row.amount, row.revision = money(amount), row.revision+1
        await self.movement(event_key=f'rectify:{row.id}:{row.revision}', contract_id=row.contract_id,
            movement_type='CONSUMPTION_ADJUSTMENT', actor=actor, balance_delta=-delta, consumed_delta=delta,
            operation_id=row.id, reservation_id=row.reservation_id, source_type=source_type, source_id=source_id,
            vehicle_id=row.vehicle_id, organization_id=row.organization_id, provider_id=row.provider_id,
            justification=reason)
        await self.flag_overdraw(row.contract_id, f'Retificação {source_id} acima do saldo disponível')
        return row

    async def adjust(self, contract_id, *, amount, request_key, reason, actor, source_type='MANUAL', details=None):
        await self.contract(contract_id, lock=True)
        if not (await self.balances(contract_id))['control_opened']:
            raise HTTPException(409, 'Confirme o saldo inicial antes de ajustar')
        key = f'adjust:{source_type}:{request_key}'
        existing = await self.db.scalar(select(ContractMovement).where(ContractMovement.event_key == key))
        if existing:
            if existing.contract_id != contract_id or existing.balance_delta != money(amount):
                raise HTTPException(409, 'Esta identificação já foi usada para outro ajuste')
            return existing
        row = await self.movement(event_key=key, contract_id=contract_id,
            movement_type='CREDIT' if money(amount) >= 0 else 'DEBIT', actor=actor,
            balance_delta=money(amount), source_type=source_type, source_id=request_key,
            justification=reason, details=details)
        await self.flag_overdraw(contract_id, 'Ajuste deixou o saldo disponível negativo')
        return row

    async def correct_balance(self, contract_id, data, actor):
        await self.contract(contract_id, lock=True)
        target = money(data.target_available_balance)
        expected = money(data.expected_available_balance)
        key = f'balance-correction:{data.request_key}'
        existing = await self.db.scalar(select(ContractMovement).where(ContractMovement.event_key == key))
        if existing:
            details = existing.details or {}
            if (existing.contract_id != contract_id or details.get('available_after') != str(target)
                    or details.get('available_before') != str(expected)):
                raise HTTPException(409, 'Esta identificação já foi usada para outra correção')
            return existing
        balance = await self.balances(contract_id)
        if not balance['control_opened']:
            raise HTTPException(409, 'Confirme o saldo inicial antes de corrigir')
        if balance['available_balance'] != expected:
            raise HTTPException(409, 'O saldo mudou desde a conferência. Atualize o contrato e confira novamente a correção.')
        delta = target - expected
        if not delta:
            raise HTTPException(422, 'O valor informado já é o saldo disponível atual')
        return await self.movement(event_key=key, contract_id=contract_id,
            movement_type='BALANCE_CORRECTION', actor=actor, balance_delta=delta,
            source_type='BALANCE_CORRECTION', source_id=data.request_key, justification=data.justification,
            details={'available_before': str(expected), 'available_after': str(target),
                     'contractual_before': str(balance['contractual_balance']),
                     'contractual_after': str(balance['contractual_balance'] + delta),
                     'reserved_amount': str(balance['reserved_amount']),
                     'consumed_since_opening': str(balance['consumed_since_opening'])})

    async def resolve_divergence(self, contract_id, reason, actor):
        await self.contract(contract_id, lock=True)
        control = await self.db.get(ContractControl, contract_id)
        if not control:
            raise HTTPException(409, 'Controle ainda não iniciado')
        if (await self.balances(contract_id))['available_balance'] < 0:
            raise HTTPException(409, 'Recomponha o saldo antes de regularizar a divergência')
        from app.core.config import settings
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.services.contract_item_service import ContractItemService
            from app.models.contract_item import ContractOperationItem
            if any(r['available'] < 0 for r in (await ContractItemService(self.db).balances(contract_id)).values()):
                raise HTTPException(409, 'Regularize as quantidades negativas antes de liberar pedidos')
            missing = await self.db.scalar(select(ContractOperationItem.id).join(ContractOperation,
                ContractOperation.id == ContractOperationItem.operation_id).where(ContractOperation.contract_id == contract_id,
                ContractOperationItem.item_id.is_(None), ContractOperationItem.revision == ContractOperation.item_revision).limit(1))
            if missing:
                raise HTTPException(409, 'Vincule os itens realizados sem identificação contratual antes de liberar pedidos')
        if control.divergence_open:
            control.divergence_open, control.divergence_note = False, None
            await self.movement(event_key=f'resolve:{uuid4()}', contract_id=contract_id,
                movement_type='DIVERGENCE_RESOLVED', actor=actor, source_type='MANUAL', justification=reason)
        return await self.balances(contract_id)

    async def funding(self, reservation_id, *, order=None, record=None):
        from app.core.config import settings
        operation = None
        if not reservation_id and record is not None and getattr(record, 'contract_id', None):
            operation = await self.db.scalar(select(ContractOperation).where(
                ContractOperation.source_type == 'FUEL_SUPPLY', ContractOperation.source_id == record.id))
        network_order = order is not None and getattr(order, 'contract_funding_mode', None) == NETWORK_VALUE
        if not reservation_id and (network_order or (operation and operation.reservation_id is None)):
            context = order if network_order else record
            contract = await self.contract(context.contract_id)
            provider = await self.db.get(ContractProvider, context.contract_provider_id)
            supplier = await self.db.get(PaymentSupplier, provider.supplier_id)
            quantitative = False
            actual_item_lines = None
            if settings.CONTRACT_QUANTITY_ENABLED:
                from app.models.contract_item import ContractQuantityControl
                quantitative = bool(await self.db.get(ContractQuantityControl, contract.id)) if network_order else bool(operation.item_revision)
                if operation and operation.item_revision:
                    from app.services.contract_item_service import ContractItemService
                    actual_item_lines = [dict(item_id=r.item_id, quantity=r.quantity, unit_price=r.unit_price,
                        amount=r.amount, description=r.description, category=r.category)
                        for r in await ContractItemService(self.db).operation_lines(operation)]
            return dict(contract_id=contract.id, contract_number=contract.number, provider_id=provider.id,
                provider_name=supplier.name, reserved_amount=ZERO, status='UNRESERVED',
                fuel_type=getattr(context, 'requested_fuel_type', None) or getattr(context, 'fuel_type', None),
                unit_price=None, price_id=None, funding_mode=NETWORK_VALUE, quantity_enabled=quantitative,
                item_lines=[] if quantitative else None, actual_item_lines=actual_item_lines)
        if not reservation_id:
            return None
        row = await self.db.get(ContractReservation, reservation_id)
        if not row:
            return None
        contract = await self.contract(row.contract_id)
        provider = await self.db.get(ContractProvider, row.provider_id)
        supplier = await self.db.get(PaymentSupplier, provider.supplier_id)
        from app.core.config import settings
        item_lines = None
        actual_item_lines = None
        if settings.CONTRACT_QUANTITY_ENABLED:
            from app.services.contract_item_service import ContractItemService
            items = ContractItemService(self.db)
            item_lines = await items.reservation_lines(row.id)
            operation = await self.db.scalar(select(ContractOperation).where(ContractOperation.reservation_id == row.id))
            if operation and operation.item_revision:
                actual_item_lines = [dict(item_id=r.item_id, quantity=r.quantity, unit_price=r.unit_price,
                    amount=r.amount, description=r.description, category=r.category) for r in await items.operation_lines(operation)]
        return dict(quantity_enabled=bool(item_lines or actual_item_lines), item_lines=item_lines, actual_item_lines=actual_item_lines, contract_id=contract.id, contract_number=contract.number, provider_id=row.provider_id,
                    provider_name=supplier.name, reserved_amount=row.amount, status=row.status,
                    fuel_type=row.fuel_type, unit_price=row.unit_price, price_id=row.price_id)

    async def providers(self, contract_id):
        rows = (await self.db.execute(select(ContractProvider, PaymentSupplier.name, FuelStation.name.label('station_name'))
            .join(PaymentSupplier, PaymentSupplier.id == ContractProvider.supplier_id)
            .outerjoin(FuelStation, FuelStation.id == ContractProvider.fuel_station_id)
            .where(ContractProvider.contract_id == contract_id).order_by(PaymentSupplier.name))).all()
        return [dict(id=p.id, contract_id=p.contract_id, supplier_id=p.supplier_id, name=name,
                     fuel_station_id=p.fuel_station_id, station_name=station, active=p.active) for p, name, station in rows]

    async def prices(self, contract_id, *, include_deleted=False):
        query = (select(ContractFuelPrice, PaymentSupplier.name, FuelStation.name.label('station_name'))
            .join(ContractProvider, ContractProvider.id == ContractFuelPrice.provider_id)
            .join(PaymentSupplier, PaymentSupplier.id == ContractProvider.supplier_id)
            .outerjoin(FuelStation, FuelStation.id == ContractProvider.fuel_station_id)
            .where(ContractProvider.contract_id == contract_id)
            .order_by(ContractFuelPrice.valid_from.desc(), ContractFuelPrice.created_at.desc()))
        if not include_deleted:
            query = query.where(ContractFuelPrice.deleted_at.is_(None),
                or_(ContractFuelPrice.valid_until.is_(None), ContractFuelPrice.valid_until > ContractFuelPrice.valid_from))
        rows = (await self.db.execute(query)).all()
        instant = utcnow()
        return [dict(id=p.id, provider_id=p.provider_id, provider_name=name, station_name=station,
                     fuel_type=p.fuel_type, unit_price=p.unit_price, valid_from=p.valid_from, valid_until=p.valid_until,
                     deleted_at=p.deleted_at, status=price_state(p, instant))
                for p, name, station in rows]

    async def eligible(self, *, kind, station_id=None):
        contracts = (await self.db.scalars(select(PaymentContract).where(PaymentContract.kind == kind)
                                          .order_by(PaymentContract.number))).all()
        result = []
        for contract in contracts:
            if await self.errors(contract):
                continue
            providers = [p for p in await self.providers(contract.id) if p['active'] and
                         (station_id is None or p['fuel_station_id'] == station_id)]
            valid = []
            for provider in providers:
                try:
                    await self.provider(contract.id, provider['id'])
                except HTTPException:
                    continue
                valid.append(provider)
            if valid:
                extra = {}
                from app.core.config import settings
                if settings.CONTRACT_QUANTITY_ENABLED:
                    from app.services.contract_item_service import ContractItemService
                    catalog = await ContractItemService(self.db).list(contract.id)
                    extra = dict(quantity_enabled=True, quantity_opened=catalog['opened'], items=[{k: r[k] for k in ('id','code','description','category','unit','product_key','available')} for r in catalog['items'] if r['active']],
                        item_prices=[p for p in catalog['prices'] if p['current'] and any(v['id'] == p['provider_id'] for v in valid)])
                result.append(dict(id=contract.id, number=contract.number, kind=kind,
                    fuel_pricing_mode=pricing_mode(contract),
                    available_balance=(await self.balances(contract.id))['available_balance'],
                    providers=valid, prices=await self.prices(contract.id) if kind == 'FUEL' and pricing_mode(contract) != NETWORK_VALUE else [], **extra))
        return result

    async def movements(self, contract_id, actor, *, page=1, limit=20, organization_id=None,
                        vehicle_id=None, provider_id=None, start=None, end=None, status=None):
        await self.contract(contract_id)
        conditions = [ContractMovement.contract_id == contract_id]
        scope = scoped_organization_id(actor, organization_id)
        if production_scope_is_empty(actor):
            return dict(data=[], total=0, page=page, pages=0)
        if scope:
            conditions.append(ContractMovement.organization_id == scope)
        for field, value in [(ContractMovement.vehicle_id, vehicle_id), (ContractMovement.provider_id, provider_id),
                             (ContractMovement.movement_type, status)]:
            if value:
                conditions.append(field == value)
        if start:
            conditions.append(ContractMovement.created_at >= start)
        if end:
            conditions.append(ContractMovement.created_at <= end)
        total = await self.db.scalar(select(func.count()).select_from(ContractMovement).where(*conditions))
        rows = (await self.db.execute(select(ContractMovement, Vehicle.plate, Organization.name,
                    PaymentSupplier.name.label('provider_name'), User.name.label('actor_name'))
            .outerjoin(Vehicle, Vehicle.id == ContractMovement.vehicle_id)
            .outerjoin(Organization, Organization.id == ContractMovement.organization_id)
            .outerjoin(ContractProvider, ContractProvider.id == ContractMovement.provider_id)
            .outerjoin(PaymentSupplier, PaymentSupplier.id == ContractProvider.supplier_id)
            .outerjoin(User, User.id == ContractMovement.actor_id).where(*conditions)
            .order_by(ContractMovement.created_at.desc(), ContractMovement.id.desc())
            .offset((page-1)*limit).limit(limit))).all()
        return dict(data=[dict(id=m.id, movement_type=m.movement_type, balance_delta=m.balance_delta,
            reserved_delta=m.reserved_delta, consumed_delta=m.consumed_delta, source_type=m.source_type,
            source_id=m.source_id, created_at=m.created_at, justification=m.justification,
            vehicle_plate=plate, organization_name=org, provider_name=provider, actor_name=actor_name,
            details=m.details) for m, plate, org, provider, actor_name in rows], total=total, page=page, pages=(total+limit-1)//limit)

    async def reservations(self, contract_id, actor, *, page=1, limit=20, organization_id=None,
                           vehicle_search=None, provider_id=None, start=None, end=None):
        await self.contract(contract_id)
        if production_scope_is_empty(actor):
            return dict(data=[], total=0, page=page, pages=0)
        conditions = [ContractReservation.contract_id == contract_id, ContractReservation.status == 'HELD']
        scope = scoped_organization_id(actor, organization_id)
        if scope:
            conditions.append(ContractReservation.organization_id == scope)
        if provider_id:
            conditions.append(ContractReservation.provider_id == provider_id)
        if vehicle_search:
            conditions.append(ContractReservation.vehicle_id.in_(select(Vehicle.id).where(Vehicle.plate.ilike(f'%{vehicle_search.strip()}%'))))
        if start:
            conditions.append(ContractReservation.created_at >= start)
        if end:
            conditions.append(ContractReservation.created_at <= end)
        total = await self.db.scalar(select(func.count()).select_from(ContractReservation).where(*conditions))
        rows = (await self.db.execute(select(ContractReservation, Vehicle.plate, Organization.name, PaymentSupplier.name.label('provider_name'))
            .join(Vehicle, Vehicle.id == ContractReservation.vehicle_id)
            .outerjoin(Organization, Organization.id == ContractReservation.organization_id)
            .join(ContractProvider, ContractProvider.id == ContractReservation.provider_id)
            .join(PaymentSupplier, PaymentSupplier.id == ContractProvider.supplier_id)
            .where(*conditions).order_by(ContractReservation.created_at.desc(), ContractReservation.id)
            .offset((page-1)*limit).limit(limit))).all()
        return dict(data=[dict(id=r.id, source_id=r.source_id, source_type=r.source_type,
            amount=r.amount, occurred_at=r.created_at, vehicle_plate=plate, organization_name=org,
            provider_name=provider, fuel_type=r.fuel_type, unit_price=r.unit_price, liters=r.liters)
            for r, plate, org, provider in rows], total=total, page=page, pages=(total+limit-1)//limit)

    async def operations(self, contract_id, actor, *, unbilled=False, process_id=None, page=1, limit=50,
                         organization_id=None, vehicle_search=None, provider_id=None, start=None, end=None):
        conditions = [ContractOperation.contract_id == contract_id]
        if production_scope_is_empty(actor):
            return dict(data=[], total=0, page=page, pages=0)
        scope = scoped_organization_id(actor, organization_id)
        if scope:
            conditions.append(ContractOperation.organization_id == scope)
        if unbilled:
            conditions.append(or_(ContractOperation.invoice_process_id.is_(None), ContractOperation.invoice_process_id == process_id))
        if vehicle_search:
            conditions.append(ContractOperation.vehicle_id.in_(select(Vehicle.id).where(Vehicle.plate.ilike(f'%{vehicle_search.strip()}%'))))
        if provider_id:
            conditions.append(ContractOperation.provider_id == provider_id)
        if start:
            conditions.append(ContractOperation.occurred_at >= start)
        if end:
            conditions.append(ContractOperation.occurred_at <= end)
        total = await self.db.scalar(select(func.count()).select_from(ContractOperation).where(*conditions))
        rows = (await self.db.execute(select(ContractOperation, Vehicle.plate, Organization.name, PaymentSupplier.name.label('provider_name'))
            .outerjoin(Vehicle, Vehicle.id == ContractOperation.vehicle_id)
            .outerjoin(Organization, Organization.id == ContractOperation.organization_id)
            .outerjoin(ContractProvider, ContractProvider.id == ContractOperation.provider_id)
            .outerjoin(PaymentSupplier, PaymentSupplier.id == ContractProvider.supplier_id)
            .where(*conditions).order_by(ContractOperation.occurred_at.desc(), ContractOperation.id)
            .offset((page-1)*limit).limit(limit))).all()
        return dict(data=[dict(id=o.id, source_type=o.source_type, source_id=o.source_id, amount=o.amount,
            occurred_at=o.occurred_at, vehicle_plate=plate, organization_name=org, provider_name=provider,
            invoice_process_id=o.invoice_process_id) for o, plate, org, provider in rows],
            total=total, page=page, pages=(total+limit-1)//limit)

    async def reconcile(self, process_id, data, actor):
        process = await self.db.get(PaymentProcess, process_id)
        if not process or not process.contract_id:
            raise HTTPException(409, 'Vincule a fatura a um contrato antes de conciliar')
        if production_scope_is_empty(actor) or (scoped_organization_id(actor) and process.organization_id != scoped_organization_id(actor)):
            raise HTTPException(403, 'Processo fora da sua secretaria')
        locked_contract_id = process.contract_id
        await self.contract(locked_contract_id, lock=True)
        await self.db.refresh(process, with_for_update=True)
        if process.contract_id != locked_contract_id:
            raise HTTPException(409, 'O contrato da fatura foi alterado; atualize a consulta')
        if not (await self.balances(process.contract_id))['control_opened']:
            raise HTTPException(409, 'Confirme o saldo inicial do contrato')
        control = await self.db.get(ContractControl, process.contract_id)
        invoice_date = process.issue_date or process.competence_month or process.created_at.astimezone(TZ).date()
        created = process.created_at.replace(tzinfo=timezone.utc) if process.created_at.tzinfo is None else process.created_at
        opened = control.opened_at.replace(tzinfo=timezone.utc) if control.opened_at.tzinfo is None else control.opened_at
        if invoice_date < control.opening_date or created < opened:
            raise HTTPException(409, 'Fatura anterior à abertura: seu efeito já integra o saldo inicial conferido')
        if process.amount is None:
            raise HTTPException(409, 'Informe o valor da fatura')
        if len(set(data.operation_ids)) != len(data.operation_ids):
            raise HTTPException(422, 'Não repita operações')
        operations = (await self.db.scalars(select(ContractOperation).where(
            ContractOperation.id.in_(data.operation_ids)).with_for_update().execution_options(populate_existing=True))).all()
        if len(operations) != len(data.operation_ids):
            raise HTTPException(404, 'Operação não encontrada')
        for operation in operations:
            if operation.contract_id != process.contract_id or (scoped_organization_id(actor) and operation.organization_id != scoped_organization_id(actor)):
                raise HTTPException(403, 'Operação fora do contrato ou da sua secretaria')
            if operation.invoice_process_id and operation.invoice_process_id != process_id:
                raise HTTPException(409, 'Operação já conciliada em outro processo')
        total = sum((o.amount for o in operations), ZERO)
        difference = money(process.amount)-total
        if difference and len((data.justification or '').strip()) < 10:
            raise HTTPException(422, 'Justifique a diferença entre a fatura e as operações (mínimo 10 caracteres)')
        previous = await self.db.get(ContractReconciliation, process_id)
        linked = (await self.db.scalars(select(ContractOperation).where(ContractOperation.invoice_process_id == process_id))).all()
        unchanged = previous and previous.invoice_amount == money(process.amount) and previous.operation_amount == total and {o.id for o in linked} == set(data.operation_ids)
        if unchanged:
            return await self.reconciliation(process_id)
        old_difference = previous.difference if previous else ZERO
        for operation in linked:
            operation.invoice_process_id = None
        for operation in operations:
            operation.invoice_process_id = process_id
        if previous:
            previous.invoice_amount, previous.operation_amount, previous.difference = money(process.amount), total, difference
            previous.justification, previous.revision, previous.actor_id, previous.reconciled_at = data.justification, previous.revision+1, actor.id, utcnow()
            row = previous
        else:
            row = ContractReconciliation(process_id=process_id, contract_id=process.contract_id,
                invoice_amount=money(process.amount), operation_amount=total, difference=difference,
                justification=data.justification, actor_id=actor.id)
            self.db.add(row)
        await self.db.flush()
        delta = difference-old_difference
        if delta:
            await self.movement(event_key=f'reconcile:{process_id}:{row.revision}', contract_id=process.contract_id,
                movement_type='INVOICE_ADJUSTMENT', actor=actor, balance_delta=-delta, consumed_delta=delta,
                source_type='INVOICE', source_id=process_id, organization_id=process.organization_id,
                justification=data.justification, details={'invoice_amount': str(process.amount), 'operations_amount': str(total)})
            await self.flag_overdraw(process.contract_id, f'Diferença da fatura {process.process_number} acima do saldo')
        await self.audit.record(actor=actor, action='RECONCILE', entity_type='PAYMENT_PROCESS', entity_id=process_id,
            entity_label=process.process_number, details={'operation_ids': [str(o.id) for o in operations], 'difference': str(difference)})
        return await self.reconciliation(process_id)

    async def reconciliation(self, process_id):
        row = await self.db.get(ContractReconciliation, process_id)
        if not row:
            return None
        operations = (await self.db.scalars(select(ContractOperation).where(ContractOperation.invoice_process_id == process_id))).all()
        current_total = sum((o.amount for o in operations), ZERO)
        process = await self.db.get(PaymentProcess, process_id)
        return dict(process_id=process_id, invoice_amount=row.invoice_amount, operation_amount=row.operation_amount,
            difference=row.difference, justification=row.justification, reconciled_at=row.reconciled_at,
            operation_ids=[o.id for o in operations], stale=current_total != row.operation_amount or money(process.amount) != row.invoice_amount)
