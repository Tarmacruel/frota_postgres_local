"""One contract lock, one transaction and a reproducible snapshot per confirmed instrument."""
from datetime import date
from decimal import Decimal
import json
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from app.models.contract_balance import ContractControl
from app.models.contract_item import ContractItem, ContractQuantityControl, ContractAmendmentItem
from app.models.payment_process import PaymentContractAmendment
from app.schemas.contract_item import ItemPriceCreate
from app.services.contract_balance_service import ContractBalanceService, money, utcnow, TZ
from app.services.contract_item_service import ContractItemService, fingerprint, quantity


def serial(value):
    return json.loads(json.dumps(value, default=str))


def limits_for(items, adjudication, additions, prices):
    groups = {}
    for item in items:
        key = str(item['id']) if adjudication == 'ITEM' else item['group_key'] if adjudication == 'GROUP' else 'GLOBAL'
        if key is None:
            raise HTTPException(422, 'Confira a identificação dos lotes/grupos')
        row = groups.setdefault(key, dict(key=key, label=item['description'] if adjudication == 'ITEM' else str(key), base=Decimal(0), before=Decimal(0), after=Decimal(0)))
        price = Decimal(str(prices.get(item['id'], item['reference_unit_price'])))
        accumulated = Decimal(str(item['accumulated_added_quantity']))
        proposed = accumulated + Decimal(str(additions.get(item['id'], 0)))
        if proposed < 0:
            raise HTTPException(422, 'Correção não pode deixar acréscimos acumulados negativos')
        row['base'] += Decimal(str(item['original_quantity']))*price
        row['before'] += accumulated*price
        row['after'] += proposed*price
    for row in groups.values():
        row['limit'] = row['base']*Decimal('.25')
        row['remaining'] = row['limit']-row['after']
        row['percent_after'] = row['after']/row['base']*100 if row['base'] else Decimal(0)
        row['exceeded'] = row['after'] > row['limit']
    return list(groups.values())


class ContractAmendmentService:
    def __init__(self, db):
        self.db = db
        self.balance = ContractBalanceService(db)
        self.items = ContractItemService(db)

    def payload(self, data):
        return data.model_dump(mode='json', exclude={'preview_token'})

    async def preview(self, contract_id, data, actor):
        contract = await self.balance.contract(contract_id)
        if data.effective_date > utcnow().astimezone(TZ).date():
            raise HTTPException(422, 'Confirme o instrumento a partir do início de seus efeitos. As alterações não serão antecipadas.')
        if data.signed_at > utcnow().astimezone(TZ).date():
            raise HTTPException(422, 'Confira as datas de assinatura e início dos efeitos')
        if 'TERM' in data.change_types and (not contract.valid_until or (data.valid_until <= contract.valid_until and not data.corrects_amendment_id)):
            raise HTTPException(422, 'A prorrogação deve informar uma data posterior ao fim atual da vigência')
        if data.corrects_amendment_id:
            previous = await self.db.get(PaymentContractAmendment, data.corrects_amendment_id)
            if not previous or previous.contract_id != contract_id or not previous.snapshot:
                raise HTTPException(422, 'Selecione uma alteração estruturada deste contrato para vincular a correção')
        catalog = await self.items.list(contract_id)
        by_id = {r['id']: r for r in catalog['items']}
        if len({r.item_id for r in data.lines}) != len(data.lines):
            raise HTTPException(422, 'Informe cada item apenas uma vez')
        if any(x in data.change_types for x in ['PRICE', 'QUANTITY']) and not data.lines:
            raise HTTPException(422, 'Selecione os itens afetados')
        if 'QUANTITY' in data.change_types and not catalog['opened']:
            raise HTTPException(409, 'Confira a abertura quantitativa e o histórico antes de registrar acréscimos')
        lines, additions, new_prices = [], {}, {}
        providers = {p['id']: p for p in await self.balance.providers(contract_id)}
        amount = Decimal(0)
        for entry in data.lines:
            item = by_id.get(entry.item_id)
            if not item or not item['active']:
                raise HTTPException(422, 'Item não pertence ao contrato')
            if (entry.new_reference_price is not None or entry.prices) and 'PRICE' not in data.change_types:
                raise HTTPException(422, 'Selecione alteração de preços para os valores informados')
            if (entry.new_reference_price is not None or entry.prices) and (entry.new_reference_price is None or not entry.prices):
                raise HTTPException(422, 'Informe o preço de referência e os executantes afetados em cada item selecionado')
            if len({p.provider_id for p in entry.prices}) != len(entry.prices):
                raise HTTPException(422, 'Não repita o mesmo executante no item')
            current_prices = [p for p in catalog['prices'] if p['item_id'] == entry.item_id and p['current']]
            assignments = []
            for new in entry.prices:
                provider = await self.balance.provider(contract_id, new.provider_id)
                old = next((p for p in current_prices if p['provider_id'] == provider.id), None)
                assignments.append(dict(provider_id=provider.id, previous_price_id=old['id'] if old else None,
                    before=old['unit_price'] if old else None, after=new.unit_price,
                    provider_name=providers[provider.id]['station_name'] or providers[provider.id]['name']))
            updated_price = entry.new_reference_price if entry.new_reference_price is not None else item['reference_unit_price']
            delta = quantity(entry.added_quantity)
            if delta < 0:
                if not data.corrects_amendment_id:
                    raise HTTPException(422, 'Redução exige correção vinculada ao lançamento original')
                target = await self.db.scalar(select(ContractAmendmentItem).where(
                    ContractAmendmentItem.amendment_id == data.corrects_amendment_id,
                    ContractAmendmentItem.item_id == entry.item_id))
                used = await self.db.scalar(select(func.coalesce(func.sum(ContractAmendmentItem.quantity_delta), 0))
                    .join(PaymentContractAmendment, PaymentContractAmendment.id == ContractAmendmentItem.amendment_id)
                    .where(PaymentContractAmendment.corrects_amendment_id == data.corrects_amendment_id,
                        ContractAmendmentItem.item_id == entry.item_id, ContractAmendmentItem.quantity_delta < 0))
                if not target or target.quantity_delta + used + delta < 0:
                    raise HTTPException(422, 'Correção excede o acréscimo do lançamento vinculado')
                if item['available'] + delta < 0:
                    raise HTTPException(409, 'A quantidade a corrigir já foi consumida ou reservada')
            additions[item['id']] = delta
            new_prices[item['id']] = updated_price
            subtotal = money(delta*updated_price)
            amount += subtotal
            lines.append(dict(item_id=item['id'], code=item['code'], original_number=item['original_number'],
                document_number=entry.document_number, description=item['description'], unit=item['unit'],
                before_price=item['reference_unit_price'], after_price=updated_price,
                price_percent=(updated_price/item['reference_unit_price']-1)*100,
                added_quantity=delta, before_remaining=item['remaining'],
                after_remaining=item['remaining']+delta if item['remaining'] is not None else None,
                quantity_amount=subtotal, prices=assignments))
        if 'PRICE' in data.change_types and not any(line.prices for line in data.lines):
            raise HTTPException(422, 'Selecione pelo menos um preço a alterar')
        if amount != data.declared_quantity_amount:
            raise HTTPException(422, f'A soma dos itens é R$ {amount:.2f}. Confira o valor de acréscimo declarado no documento.')
        if 'QUANTITY' in data.change_types and not any(additions.values()):
            raise HTTPException(422, 'Informe as quantidades adicionais dos itens')
        for item in catalog['items']:
            item['accumulated_added_quantity'] = (item['historical_added_quantity'] or Decimal(0)) + await self.items.added_since_opening(item['id'])
        limits = limits_for(catalog['items'], catalog['adjudication'], additions, new_prices) if catalog['opened'] else []
        if 'QUANTITY' in data.change_types and any(r['exceeded'] for r in limits):
            raise HTTPException(409, 'O acréscimo ultrapassa o limite acumulado de 25% da base atualizada aplicável.')
        balances = await self.balance.balances(contract_id)
        delta = money(amount+data.price_financial_delta)
        if delta and not balances['control_opened']:
            raise HTTPException(409, 'Confira o saldo financeiro inicial antes de aplicar o efeito financeiro do instrumento')
        base = contract.value_updated if contract.value_updated is not None else contract.value_initial
        if delta and base is None:
            raise HTTPException(409, 'Confira o valor global atual do contrato antes de aplicar o efeito financeiro')
        if delta and not Decimal(0) <= base+delta < Decimal('1000000000000'):
            raise HTTPException(422, 'O valor global resultante deve ser não negativo e respeitar a precisão monetária do contrato')
        before = balances['available_balance']
        snapshot = dict(contract_id=contract.id, contract_number=contract.number, supplier_id=contract.supplier_id,
            number=data.number, instrument_type=data.instrument_type, change_types=data.change_types,
            price_reason=data.price_reason, signed_at=data.signed_at, effective_date=data.effective_date,
            document_reference=data.document_reference, notes=data.notes, corrects_amendment_id=data.corrects_amendment_id,
            before_valid_until=contract.valid_until, after_valid_until=data.valid_until if 'TERM' in data.change_types else contract.valid_until,
            before_available=before, after_available=before+delta if before is not None else None,
            quantity_amount=amount, price_financial_delta=data.price_financial_delta, total_financial_delta=delta,
            adjudication=catalog['adjudication'], limits=limits, lines=lines)
        snapshot = serial(snapshot)
        token = fingerprint(dict(payload=self.payload(data), snapshot=snapshot, catalog=catalog,
            contract_updated_at=contract.updated_at, balances=balances))
        return dict(preview_token=token, snapshot=snapshot)

    async def confirm(self, contract_id, data, actor):
        contract = await self.balance.contract(contract_id, lock=True)
        digest = fingerprint(self.payload(data))
        prior = await self.db.scalar(select(PaymentContractAmendment).where(PaymentContractAmendment.request_key == data.request_key))
        if prior:
            if prior.contract_id != contract_id or prior.request_fingerprint != digest:
                raise HTTPException(409, 'Identificação já usada com outros dados')
            return prior
        used = await self.db.scalar(select(PaymentContractAmendment.id).where(PaymentContractAmendment.contract_id == contract_id,
            PaymentContractAmendment.number == data.number, or_(PaymentContractAmendment.instrument_type == data.instrument_type,
                PaymentContractAmendment.instrument_type.is_(None))))
        if used:
            raise HTTPException(409, 'Número de instrumento já registrado. Consulte o histórico ou registre uma correção vinculada.')
        preview = await self.preview(contract_id, data, actor)
        if not data.preview_token or preview['preview_token'] != data.preview_token:
            raise HTTPException(409, 'O contrato, seus saldos ou os preços mudaram. Confira novamente os impactos antes de confirmar.')
        snapshot = preview['snapshot']
        row = PaymentContractAmendment(contract_id=contract_id, number=data.number, instrument_type=data.instrument_type,
            amendment_type=' / '.join(data.change_types), change_types=data.change_types, signed_at=data.signed_at,
            effective_date=data.effective_date, valid_until=data.valid_until if 'TERM' in data.change_types else None,
            document_reference=data.document_reference, notes=data.notes,
            value_delta=Decimal(snapshot['total_financial_delta']), price_financial_delta=data.price_financial_delta,
            request_key=data.request_key, request_fingerprint=digest, snapshot=snapshot,
            corrects_amendment_id=data.corrects_amendment_id)
        if data.attachment_token:
            from pathlib import Path
            from app.core.config import settings
            directory = Path(settings.STORAGE_DIR)/'contract_amendments'
            metadata_path = directory/f'{data.attachment_token}.json'
            document_path = directory/f'{data.attachment_token}.pdf'
            if not metadata_path.is_file() or not document_path.is_file():
                raise HTTPException(422, 'Anexo não disponível. Selecione o PDF novamente.')
            metadata = json.loads(metadata_path.read_text(encoding='utf-8'))
            if metadata['contract_id'] != str(contract_id) or metadata['actor_id'] != str(actor.id):
                raise HTTPException(403, 'Anexo não pertence a este contrato e usuário')
            row.attachment = metadata
        self.db.add(row)
        await self.db.flush()
        for entry, saved in zip(data.lines, snapshot['lines']):
            item = await self.items.get(contract_id, entry.item_id)
            if entry.new_reference_price is not None:
                item.reference_unit_price = entry.new_reference_price
            for price in entry.prices:
                await self.items.set_price(contract_id, ItemPriceCreate(item_id=item.id, provider_id=price.provider_id,
                    unit_price=price.unit_price), actor, amendment_id=row.id)
            if entry.added_quantity:
                await self.items.movement(contract_id, item.id, f'amend:{row.id}:{item.id}', 'AMENDMENT', actor,
                    quantity_delta=entry.added_quantity, source_id=row.id, details={'number': row.number, 'corrects': str(data.corrects_amendment_id) if data.corrects_amendment_id else None})
            self.db.add(ContractAmendmentItem(amendment_id=row.id, item_id=item.id, document_number=entry.document_number,
                quantity_delta=entry.added_quantity, value_delta=Decimal(saved['quantity_amount']), snapshot=saved))
        if row.value_delta:
            base = contract.value_updated if contract.value_updated is not None else contract.value_initial or Decimal(0)
            contract.value_updated = base+row.value_delta
            await self.balance.adjust(contract_id, amount=row.value_delta, request_key=row.id, source_type='AMENDMENT',
                actor=actor, reason=f'Instrumento {row.number}: {row.notes}', details={'snapshot_id': str(row.id)})
        if row.valid_until:
            contract.valid_until = row.valid_until
        contract.updated_at = utcnow()
        await self.balance.audit.record(actor=actor, action='CONFIRM_CONTRACT_AMENDMENT', entity_type='PAYMENT_CONTRACT',
            entity_id=contract_id, entity_label=contract.number, details={'amendment_id': str(row.id), 'snapshot': snapshot})
        await self.db.flush()
        return row
