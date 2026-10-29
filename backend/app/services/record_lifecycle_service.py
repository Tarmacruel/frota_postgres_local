"""Reviewed, transactional reversals; effective handoffs keep their guided workflow."""
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from uuid import UUID
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select, func
from app.models.contract_balance import ContractOperation, ContractReservation, MaintenanceOrder
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.possession import VehiclePossession
from app.models.vehicle_loan import VehicleLoan
from app.models.system_settings import RecordControl
from app.services.contract_balance_service import ContractBalanceService, money


class RecordLifecycleService:
    def __init__(self, db): self.db = db

    async def plan(self, module, row, control=None):
        steps, children, source_ids = [], [], [row.id]
        managed = (control.lifecycle_effects or {}).get('managed_by') if control and control.inactive else None
        if managed:
            parent = await self.db.get(RecordControl, (managed['module'], UUID(managed['record_id'])))
            if parent and parent.inactive:
                steps.append({'key': 'managed-parent', 'blocked': True, 'label': 'Reativar pelo pedido de origem',
                    'message': 'Este registro foi inativado junto com seu pedido. Abra o pedido de origem para conferir e restabelecer o consumo uma única vez.',
                    'href': f"/parametros?section=records&module={managed['module']}&record_id={managed['record_id']}",
                    'action': 'Abrir pedido de origem'})
        if module == 'fuel_supply_orders':
            children = [('fuel_supplies', supply) for supply in (await self.db.scalars(select(FuelSupply).where(FuelSupply.fuel_supply_order_id == row.id))).all()]
        elif module == 'maintenance_orders' and row.maintenance_record_id:
            from app.models.maintenance import MaintenanceRecord
            record = await self.db.get(MaintenanceRecord, row.maintenance_record_id)
            if record: children = [('maintenance', record)]
        source_ids += [record.id for _, record in children]
        if module == 'vehicle_loans' and row.status in ('ACTIVE', 'AWAITING_RETURN_RECEIPT', 'AWAITING_RECEIPT'):
            steps.append({'key': 'handoff', 'blocked': True, 'label': 'Resolver a entrega do veículo',
                'message': 'Abra o empréstimo: cancele a proposta ainda não aceita ou solicite e confirme a devolução. A responsabilidade só retorna à origem após a confirmação.',
                'href': f'/emprestimos?id={row.id}', 'action': 'Abrir devolução ou cancelamento'})
        if module == 'payment_processes':
            from app.models.payment_process import PaymentProcessStage
            if row.stage != PaymentProcessStage.CANCELLED:
                steps.append({'key': 'payment', 'blocked': True, 'label': 'Conferir o cancelamento do processo',
                    'message': 'Abra Financeiro e registre o cancelamento com justificativa. Cancelar a fatura não estorna um serviço realizado; para anular o serviço, volte ao registro de origem e confira seu estorno.',
                    'href': f'/processos-pagamento?view=payments&financial_view=processes&focus_process={row.id}',
                    'action': 'Abrir processo em Financeiro'})
        if module in ('vehicles', 'drivers', 'possession'):
            condition = VehiclePossession.id == row.id if module == 'possession' else getattr(VehiclePossession, 'vehicle_id' if module == 'vehicles' else 'driver_id') == row.id
            possessions = (await self.db.scalars(select(VehiclePossession).where(condition, VehiclePossession.end_date.is_(None)))).all()
            for possession in possessions:
                steps.append({'key': f'possession:{possession.id}', 'blocked': True, 'label': 'Encerrar a posse ativa',
                    'message': 'Informe os dados reais do encerramento antes de inativar.',
                    'href': f'/posses?vehicle_id={possession.vehicle_id}', 'action': 'Abrir posse do veículo'})
        if module == 'vehicles':
            loans = (await self.db.scalars(select(VehicleLoan).where(VehicleLoan.vehicle_id == row.id,
                VehicleLoan.status.in_(('ACTIVE', 'AWAITING_RECEIPT', 'AWAITING_RETURN_RECEIPT'))))).all()
            for loan in loans:
                steps.append({'key': f'loan:{loan.id}', 'blocked': True, 'label': 'Resolver empréstimo em aberto',
                    'message': 'Conclua a devolução ou cancele a proposta antes de inativar o veículo.',
                    'href': f'/emprestimos?id={loan.id}', 'action': 'Abrir empréstimo'})
        active_maintenance = row if module == 'maintenance' else children[0][1] if module == 'maintenance_orders' and children else None
        if active_maintenance is not None and active_maintenance.end_date is None:
            steps.append({'key': 'maintenance', 'blocked': True, 'label': 'Conferir manutenção em execução',
                'message': 'Conclua o serviço com o custo real, inclusive zero quando não houve gasto. Depois retorne para conferir o estorno.',
                'href': f'/manutencoes?vehicle_id={active_maintenance.vehicle_id}', 'action': 'Abrir manutenção'})
        operations = (await self.db.scalars(select(ContractOperation).where(ContractOperation.source_id.in_(source_ids)).order_by(ContractOperation.contract_id, ContractOperation.id).execution_options(populate_existing=True))).all()
        reservations = (await self.db.scalars(select(ContractReservation).where(ContractReservation.source_id.in_(source_ids), ContractReservation.status == 'HELD')
            .order_by(ContractReservation.contract_id, ContractReservation.id).execution_options(populate_existing=True))).all()
        if module == 'vehicles':
            open_orders = (await self.db.scalars(select(FuelSupplyOrder).where(FuelSupplyOrder.vehicle_id == row.id, FuelSupplyOrder.status == FuelSupplyOrderStatus.OPEN))).all()
            if open_orders:
                steps.append({'key': 'orders', 'blocked': True, 'label': 'Resolver ordens de abastecimento abertas',
                    'message': 'Cancele as ordens ou registre os abastecimentos já realizados.',
                    'href': f'/abastecimentos?view=open&vehicle_id={row.id}', 'action': 'Abrir ordens do veículo'})
        reactivating = bool(control and control.inactive)
        restoring = bool(reactivating and control.lifecycle_effects.get('operations'))
        if reactivating:
            children = [(key, record) for key, record in children if (key, str(record.id)) in [tuple(item) for item in control.lifecycle_effects.get('children', [])]]
        if restoring:
            ids = [UUID(item['id']) for item in control.lifecycle_effects['operations']]
            operations = (await self.db.scalars(select(ContractOperation).where(ContractOperation.id.in_(ids)).order_by(ContractOperation.contract_id, ContractOperation.id).execution_options(populate_existing=True))).all()
            if len(operations) != len(ids):
                raise HTTPException(409, 'Uma operação do estorno não foi localizada. Confira o histórico antes de reativar.')
        elif reactivating:
            operations, reservations = [], []
        for operation in operations:
            if operation.invoice_process_id:
                from app.models.payment_process import PaymentProcess, PaymentProcessStage
                invoice = await self.db.get(PaymentProcess, operation.invoice_process_id)
                cancelled = bool(invoice and invoice.stage == PaymentProcessStage.CANCELLED)
                steps.append({'key': f'invoice:{operation.invoice_process_id}', 'blocked': True, 'label': 'Revisar a fatura conciliada',
                    'message': 'A fatura já foi cancelada. Desvincule este serviço para permitir seu estorno; a diferença de conciliação da fatura também será estornada.' if cancelled else 'Abra a fatura em Financeiro e registre o cancelamento com justificativa. Depois volte e atualize esta conferência para desvincular o serviço e revisar o estorno.',
                    'href': f'/processos-pagamento?view=payments&financial_view=processes&contract_id={operation.contract_id}&focus_process={operation.invoice_process_id}',
                    'action': 'Abrir fatura em Financeiro', 'can_release_invoice': cancelled})
        amount = sum((Decimal(item['amount']) for item in control.lifecycle_effects['operations']), Decimal(0)) if restoring else sum((operation.amount for operation in operations), Decimal(0))
        from app.services.contract_item_service import ContractItemService
        from app.models.contract_item import ContractItem
        items, quantity_effects = ContractItemService(self.db), {}
        for operation in operations:
            if restoring:
                lines = next(item['lines'] for item in control.lifecycle_effects['operations'] if item['id'] == str(operation.id))
            else:
                lines = await items.operation_lines(operation) if operation.item_revision else []
            for line in lines:
                raw_id = line['item_id'] if isinstance(line, dict) else line.item_id
                if raw_id is None:
                    continue  # An unlinked factual item has no contractual quantity balance.
                item_id = UUID(str(raw_id))
                key = (item_id, 'consumption')
                quantity_effects[key] = quantity_effects.get(key, Decimal(0)) + Decimal(str(line['quantity'] if isinstance(line, dict) else line.quantity))
        for reservation in reservations:
            for line in await items.reservation_lines(reservation.id):
                key = (line['item_id'], 'reservation')
                quantity_effects[key] = quantity_effects.get(key, Decimal(0)) + line['quantity']
        quantities = []
        for (item_id, effect), total in quantity_effects.items():
            item = await self.db.get(ContractItem, item_id)
            quantities.append({'item_id': str(item_id), 'label': item.description if item else str(item_id),
                'unit': item.unit if item else '', 'quantity': total, 'effect': effect})
        payload = jsonable_encoder({'module': module, 'id': row.id, 'restoring': restoring,
            'operations': [{'id': op.id, 'revision': op.revision, 'amount': op.amount, 'invoice': op.invoice_process_id} for op in operations],
            'reservations': [{'id': r.id, 'status': r.status, 'generation': r.generation, 'amount': r.amount} for r in reservations],
            'steps': steps, 'quantities': quantities, 'children': [(key, str(record.id)) for key, record in children]})
        token = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        return {'steps': steps, 'can_confirm': not any(step['blocked'] for step in steps), 'token': token,
            'amount': amount, 'reserved': sum((r.amount for r in reservations), Decimal(0)), 'restoring': restoring, 'reactivating': reactivating,
            'has_effects': bool(operations or reservations), 'quantities': quantities, 'children': payload['children'],
            '_operations': operations, '_reservations': reservations}

    async def release_cancelled_invoice(self, module, row, control, data, actor):
        from app.models.payment_process import PaymentProcess, PaymentProcessStage
        from app.models.contract_balance import ContractReconciliation, ContractMovement
        from app.services.audit_service import AuditService
        plan = await self.plan(module, row, control)
        if data.expected_effect_token != plan['token']:
            raise HTTPException(409, 'A conferência mudou. Atualize os efeitos antes de desvincular a fatura.')
        linked = [op for op in plan['_operations'] if op.invoice_process_id]
        if not linked:
            return
        balance = ContractBalanceService(self.db)
        for contract_id in sorted({op.contract_id for op in linked}, key=str):
            await balance.contract(contract_id, lock=True)
        for invoice_id in sorted({op.invoice_process_id for op in linked}, key=str):
            invoice = await self.db.scalar(select(PaymentProcess).where(PaymentProcess.id == invoice_id).with_for_update().execution_options(populate_existing=True))
            if not invoice or invoice.stage != PaymentProcessStage.CANCELLED:
                raise HTTPException(409, 'Cancele a fatura em Financeiro com justificativa antes de desvincular os serviços. Nenhum gasto foi estornado.')
            reconciliation = await self.db.get(ContractReconciliation, invoice.id)
            current = await self.db.scalar(select(func.coalesce(func.sum(ContractMovement.consumed_delta), 0)).where(
                ContractMovement.source_type == 'INVOICE', ContractMovement.source_id == invoice.id))
            if current:
                revision = reconciliation.revision if reconciliation else 0
                await balance.movement(event_key=f'admin-cancel-invoice:{invoice.id}:{revision}', contract_id=invoice.contract_id,
                    movement_type='CONSUMPTION_ADJUSTMENT', actor=actor, balance_delta=current, consumed_delta=-current,
                    source_type='INVOICE', source_id=invoice.id, organization_id=invoice.organization_id,
                    justification=data.justification, details={'event': 'CANCELLED_INVOICE_DIFFERENCE_REVERSED'})
            for operation in linked:
                if operation.invoice_process_id == invoice.id:
                    operation.invoice_process_id = None
            await self.db.flush()
            if reconciliation:
                total = await self.db.scalar(select(func.coalesce(func.sum(ContractOperation.amount), 0)).where(ContractOperation.invoice_process_id == invoice.id))
                reconciliation.operation_amount = total
                reconciliation.difference = money(reconciliation.invoice_amount - total)
                reconciliation.revision += 1
                reconciliation.justification = data.justification
            await AuditService(self.db).record(actor=actor, action='UNRECONCILE', entity_type='PAYMENT_PROCESS',
                entity_id=invoice.id, entity_label=invoice.process_number,
                details={'source_ids': [str(op.source_id) for op in linked], 'difference_reversed': str(current), 'justification': data.justification})
        await self.db.commit()

    async def apply(self, module, row, control, data, actor):
        plan = await self.plan(module, row, control)
        if not plan['can_confirm']:
            raise HTTPException(409, 'Há efeitos pendentes. Siga os passos da conferência de inativação e atualize a verificação antes de concluir.')
        if plan['has_effects']:
            required = 'restore' if plan['restoring'] else 'reverse'
            if data.effect_action != required or data.expected_effect_token != plan['token']:
                raise HTTPException(409, 'Confira a prévia dos efeitos e confirme o estorno/restabelecimento. Os saldos podem ter mudado; atualize a conferência.')
        balance = ContractBalanceService(self.db)
        # Lock contracts in deterministic order, then recheck every operation revision.
        for contract_id in sorted({op.contract_id for op in plan['_operations']} | {r.contract_id for r in plan['_reservations']}, key=str):
            await balance.contract(contract_id, lock=True)
        checked = await self.plan(module, row, control)
        if checked['token'] != plan['token']:
            raise HTTPException(409, 'Uma operação mudou durante a conferência. Atualize a prévia; nada foi estornado.')
        from app.services.contract_item_service import ContractItemService
        items = ContractItemService(self.db)
        snapshots = []
        for operation in plan['_operations']:
            await self.db.refresh(operation)
            if plan['restoring']:
                previous = next(item for item in control.lifecycle_effects['operations'] if item['id'] == str(operation.id))
                if operation.amount != 0 or operation.revision != previous['reversed_revision']:
                    raise HTTPException(409, 'O estorno foi alterado após a inativação. Confira o extrato do contrato antes de reativar.')
                target, lines = Decimal(previous['amount']), previous['lines']
            else:
                old_lines = await items.operation_lines(operation) if operation.item_revision else []
                snapshots.append(jsonable_encoder({'id': operation.id, 'amount': str(operation.amount),
                    'lines': [dict(item_id=r.item_id, description=r.description, category=r.category, quantity=str(r.quantity),
                                   unit_price=str(r.unit_price), amount=str(r.amount)) for r in old_lines], 'reversed_revision': operation.revision + 1}))
                target, lines = Decimal(0), []
            delta = money(target - operation.amount)
            operation.amount = target
            if operation.item_revision:
                await items.realize(operation, lines, actor, allow_update=True)
            operation.revision += 1
            await balance.movement(event_key=f'admin-lifecycle:{operation.id}:{operation.revision}', contract_id=operation.contract_id,
                movement_type='CONSUMPTION_ADJUSTMENT', actor=actor, balance_delta=-delta, consumed_delta=delta,
                operation_id=operation.id, reservation_id=operation.reservation_id, source_type=operation.source_type,
                source_id=operation.source_id, vehicle_id=operation.vehicle_id, organization_id=operation.organization_id,
                provider_id=operation.provider_id, justification=data.justification,
                details={'action': 'REACTIVATE' if plan['restoring'] else 'INACTIVATE', 'record_id': str(row.id), 'module': module})
            await balance.flag_overdraw(operation.contract_id, 'Restabelecimento administrativo acima do disponível. Confira o extrato.')
        for reservation in plan['_reservations']:
            await balance.release(reservation.id, actor=actor, reason=data.justification)
            if reservation.source_type == 'FUEL_ORDER':
                order = await self.db.get(FuelSupplyOrder, reservation.source_id)
                if order:
                    await self._cancel_fuel_order(order, actor)
            elif reservation.source_type == 'MAINTENANCE_ORDER':
                order = await self.db.get(MaintenanceOrder, reservation.source_id)
                if order: order.status, order.cancellation_reason = 'CANCELLED', data.justification
        if not plan['reactivating'] and module == 'fuel_supply_orders' and row.status == FuelSupplyOrderStatus.OPEN:
            await self._cancel_fuel_order(row, actor)
        if not plan['reactivating'] and module == 'maintenance_orders' and row.status == 'AUTHORIZED':
            row.status, row.cancellation_reason = 'CANCELLED', data.justification
        managed_children = []
        for child_module, child_id in plan['children']:
            child = await self.db.get(RecordControl, (child_module, UUID(child_id)))
            if child and child.inactive and not plan['reactivating']:
                continue
            if child is None:
                child = RecordControl(module=child_module, record_id=UUID(child_id), revision=0, custom_fields={}, lifecycle_effects={})
                self.db.add(child)
            child.inactive, child.reason = not plan['reactivating'], data.justification
            if plan['reactivating']:
                child.lifecycle_effects = {key: value for key, value in (child.lifecycle_effects or {}).items() if key != 'managed_by'}
            else:
                child.lifecycle_effects = {**(child.lifecycle_effects or {}), 'managed_by': {'module': module, 'record_id': str(row.id)}}
            child.updated_by, child.updated_at = actor.id, datetime.now(timezone.utc)
            child.revision += 1
            managed_children.append((child_module, child_id))
        if not plan['reactivating']:
            control.lifecycle_effects = {'operations': snapshots, 'children': managed_children,
                'released_reservations': [str(r.id) for r in plan['_reservations']]}
        else:
            control.lifecycle_effects = {**control.lifecycle_effects, 'operations': [], 'restored_at': datetime.now(timezone.utc).isoformat()}
        return plan

    async def _cancel_fuel_order(self, order, actor):
        from app.services.document_signature_service import DocumentSignatureService, SOURCE_FUEL_SUPPLY_ORDER
        from app.models.document_signature import DigitalDocumentType
        order.status, order.updated_at = FuelSupplyOrderStatus.CANCELLED, datetime.now(timezone.utc)
        await DocumentSignatureService(self.db).mark_source_documents_superseded(
            source_type=SOURCE_FUEL_SUPPLY_ORDER, source_id=order.id,
            document_types=[DigitalDocumentType.FUEL_SUPPLY_ORDER], current_user=actor, reason='FUEL_ORDER_CANCELLED')
