from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.core.vehicle_handoff import lock_vehicle_handoff
from app.models.contract_balance import MaintenanceOrder
from app.models.maintenance import MaintenanceRecord
from app.models.master_data import Organization
from app.models.payment_process import PaymentContract, PaymentSupplier
from app.models.contract_balance import ContractProvider
from app.models.vehicle import Vehicle
from app.repositories.vehicle_scope import record_visible
from app.services.contract_balance_service import ContractBalanceService, money, utcnow
from app.services.operational_scope import attribute_operation, ensure_record_visible


class MaintenanceOrderService:
    def __init__(self, db):
        self.db = db
        self.balance = ContractBalanceService(db)

    async def get(self, order_id, actor, *, lock=False):
        order = await self.db.get(MaintenanceOrder, order_id)
        if not order:
            raise HTTPException(404, 'Pedido de manutenção não encontrado')
        await ensure_record_visible(self.db, order, actor)
        if lock:
            await lock_vehicle_handoff(self.db, order.vehicle_id)
            await self.balance.contract(order.contract_id, lock=True)
            await self.db.refresh(order, with_for_update=True)
        return order

    async def serialize(self, order):
        vehicle = await self.db.get(Vehicle, order.vehicle_id)
        contract = await self.balance.contract(order.contract_id)
        provider = await self.db.get(ContractProvider, order.provider_id)
        supplier = await self.db.get(PaymentSupplier, provider.supplier_id)
        org = await self.db.get(Organization, order.responsible_organization_id) if order.responsible_organization_id else None
        record = await self.db.get(MaintenanceRecord, order.maintenance_record_id) if order.maintenance_record_id else None
        return dict(id=order.id, contract_id=order.contract_id, contract_number=contract.number,
            provider_id=order.provider_id, provider_name=supplier.name,
            vehicle_id=order.vehicle_id, vehicle_plate=vehicle.plate, organization_name=org.name if org else None,
            status=order.status, service_description=order.service_description, estimated_cost=order.estimated_cost,
            total_cost=record.total_cost if record and record.end_date else None,
            start_date=record.start_date if record else None, end_date=record.end_date if record else None,
            maintenance_record_id=order.maintenance_record_id, created_at=order.created_at,
            cancellation_reason=order.cancellation_reason,
            contract_funding=await self.balance.funding(order.reservation_id))

    async def create(self, data, actor):
        await lock_vehicle_handoff(self.db, data.vehicle_id)
        existing = await self.db.scalar(select(MaintenanceOrder).where(MaintenanceOrder.request_key == data.request_key))
        if existing:
            await ensure_record_visible(self.db, existing, actor)
            if (existing.vehicle_id, existing.contract_id, existing.provider_id, existing.estimated_cost,
                    existing.service_description) != (data.vehicle_id, data.contract_id, data.provider_id,
                    money(data.estimated_cost), data.service_description):
                raise HTTPException(409, 'Esta identificação já foi usada em outro pedido')
            return await self.serialize(existing)
        if not await self.db.get(Vehicle, data.vehicle_id):
            raise HTTPException(404, 'Veículo não encontrado')
        order = MaintenanceOrder(id=uuid4(), vehicle_id=data.vehicle_id, contract_id=data.contract_id,
            provider_id=data.provider_id, estimated_cost=money(data.estimated_cost), request_key=data.request_key,
            service_description=data.service_description.strip(), created_by=actor.id, created_at=utcnow())
        await attribute_operation(self.db, order, actor, new=True)
        self.db.add(order)
        await self.db.flush()
        reservation = await self.balance.reserve(contract_id=order.contract_id, provider_id=order.provider_id,
            source_type='MAINTENANCE_ORDER', source_id=order.id, amount=order.estimated_cost,
            vehicle_id=order.vehicle_id, organization_id=order.responsible_organization_id, actor=actor)
        order.reservation_id = reservation.id
        await self.db.flush()
        return await self.serialize(order)

    async def start(self, order_id, data, actor):
        order = await self.get(order_id, actor, lock=True)
        if order.status == 'IN_PROGRESS':
            return await self.serialize(order)
        if order.status != 'AUTHORIZED':
            raise HTTPException(409, 'Somente pedidos autorizados podem ser iniciados')
        start = data.start_date or utcnow()
        if not start.tzinfo or start > utcnow():
            raise HTTPException(422, 'Informe uma data de início válida, com fuso e sem estar no futuro')
        record = MaintenanceRecord(id=uuid4(), vehicle_id=order.vehicle_id, start_date=start,
            service_description=order.service_description, total_cost=0, created_by=actor.id,
            contract_id=order.contract_id, contract_provider_id=order.provider_id,
            contract_reservation_id=order.reservation_id)
        await attribute_operation(self.db, record, actor, new=True)
        if record.responsible_organization_id != order.responsible_organization_id:
            raise HTTPException(409, 'A responsabilidade pelo veículo mudou. Confira o pedido e a data de execução.')
        self.db.add(record)
        await self.db.flush()
        order.maintenance_record_id, order.status = record.id, 'IN_PROGRESS'
        await self.balance.audit.record(actor=actor, action='MAINTENANCE_STARTED', entity_type='MAINTENANCE_ORDER',
            entity_id=order.id, entity_label=order.service_description[:100], details={'record_id': str(record.id)})
        return await self.serialize(order)

    async def complete(self, order_id, data, actor):
        order = await self.get(order_id, actor, lock=True)
        if order.status == 'COMPLETED':
            result = await self.serialize(order)
            if result['total_cost'] != money(data.total_cost):
                raise HTTPException(409, 'Pedido concluído. Utilize a retificação do registro para alterar o custo.')
            return result
        if order.status == 'CANCELLED':
            raise HTTPException(409, 'Pedido cancelado')
        end = data.end_date or utcnow()
        if not end.tzinfo or end > utcnow():
            raise HTTPException(422, 'Informe uma conclusão válida, com fuso e sem estar no futuro')
        if order.status == 'AUTHORIZED':
            from app.schemas.contract_balance import MaintenanceOrderStart
            await self.start(order_id, MaintenanceOrderStart(start_date=data.start_date or end), actor)
        record = await self.db.get(MaintenanceRecord, order.maintenance_record_id)
        if end < record.start_date:
            raise HTTPException(422, 'Conclusão anterior ao início da manutenção')
        record.end_date, record.total_cost, record.parts_replaced = end, money(data.total_cost), data.parts_replaced
        await self.balance.settle(order.reservation_id, source_type='MAINTENANCE', source_id=record.id,
                                  amount=record.total_cost, occurred_at=end, actor=actor)
        order.status = 'COMPLETED'
        await self.balance.audit.record(actor=actor, action='MAINTENANCE_COMPLETED', entity_type='MAINTENANCE_ORDER',
            entity_id=order.id, entity_label=order.service_description[:100], details={'total_cost': str(record.total_cost)})
        await self.db.flush()
        return await self.serialize(order)

    async def cancel(self, order_id, reason, actor):
        order = await self.get(order_id, actor, lock=True)
        if order.status == 'CANCELLED':
            return await self.serialize(order)
        if order.status != 'AUTHORIZED':
            raise HTTPException(409, 'Manutenção iniciada deve ser concluída com o custo real, inclusive zero quando não houve gasto')
        await self.balance.release(order.reservation_id, actor=actor, reason=reason)
        order.status, order.cancellation_reason = 'CANCELLED', reason
        await self.db.flush()
        return await self.serialize(order)

    async def list(self, actor, *, page=1, limit=20, status=None, contract_id=None, vehicle_id=None,
                   organization_id=None, search=None, start=None, end=None):
        if production_scope_is_empty(actor):
            return dict(data=[], total=0, page=page, pages=0, counts={})
        conditions = []
        scope = scoped_organization_id(actor, organization_id)
        if scope:
            conditions.append(record_visible(MaintenanceOrder.vehicle_id, MaintenanceOrder.created_at, scope))
        if contract_id:
            conditions.append(MaintenanceOrder.contract_id == contract_id)
        if vehicle_id:
            conditions.append(MaintenanceOrder.vehicle_id == vehicle_id)
        if start:
            conditions.append(MaintenanceOrder.created_at >= start)
        if end:
            conditions.append(MaintenanceOrder.created_at <= end)
        if search:
            conditions.append(MaintenanceOrder.service_description.ilike(f'%{search.strip()}%'))
        counts = dict((await self.db.execute(select(MaintenanceOrder.status, func.count()).where(*conditions)
                                             .group_by(MaintenanceOrder.status))).all())
        if status:
            conditions.append(MaintenanceOrder.status == status)
        total = await self.db.scalar(select(func.count()).select_from(MaintenanceOrder).where(*conditions))
        rows = (await self.db.scalars(select(MaintenanceOrder).where(*conditions)
            .order_by(MaintenanceOrder.created_at.desc(), MaintenanceOrder.id).offset((page-1)*limit).limit(limit))).all()
        return dict(data=[await self.serialize(o) for o in rows], total=total, page=page,
                    pages=(total+limit-1)//limit, counts=counts)
