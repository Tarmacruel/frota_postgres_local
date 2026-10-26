"""Opt-in request-local indicators over the exact authorized listing query.

Repositories opt in explicitly, before ordering/pagination. A scoped SQL subquery
provides the population; no separate permission/scope implementation is needed.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import Depends, HTTPException, Query
from sqlalchemy import String, and_, cast, func, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db_session

STATE_KEY = 'interactive_kpis'


@dataclass
class Indicator:
    key: str
    label: str
    predicate: Any
    tone: str = 'info'
    amount: Any = None
    unit: str = 'count'
    description: str = ''


def definitions(module: str):
    # Import lazily to avoid model-registration cycles.
    from app.models.vehicle import Vehicle
    from app.models.possession import VehiclePossession
    from app.models.maintenance import MaintenanceRecord
    from app.models.claim import Claim
    from app.models.fine import Fine
    from app.models.fuel_supply import FuelSupply
    from app.models.fuel_supply_order import FuelSupplyOrder
    from app.models.fuel_station import FuelStation
    from app.models.user import User
    from app.models.audit_log import AuditLog
    from app.models.vehicle_loan import VehicleLoan
    from app.models.data_import import DataImportBatch
    from app.models.payment_process import PaymentProcess
    now = datetime.now(ZoneInfo('America/Sao_Paulo'))
    blank = lambda col: or_(col.is_(None), func.trim(col) == '')
    total = lambda label: Indicator('total', label, true(), description='Todos os registros da busca e dos filtros gerais.')
    if module == 'vehicles':
        m = Vehicle
        return m, [total('Veículos'),
            Indicator('active', 'Ativos', m.status == 'ATIVO', 'success'),
            Indicator('maintenance', 'Em manutenção', m.status == 'MANUTENCAO', 'warning'),
            Indicator('inactive', 'Inativos', m.status == 'INATIVO', 'danger'),
            Indicator('without_driver', 'Ativos sem condutor', and_(m.status == 'ATIVO', ~m.possessions.any(VehiclePossession.end_date.is_(None))), 'warning'),
            Indicator('own', 'Próprios', m.ownership_type == 'PROPRIO'),
            Indicator('rented', 'Locados', m.ownership_type == 'LOCADO'),
            Indicator('assigned', 'Cedidos', m.ownership_type == 'CEDIDO')]
    if module == 'possession':
        m = VehiclePossession
        return m, [total('Posses'), Indicator('active', 'Ativas', m.end_date.is_(None), 'success'),
            Indicator('closed', 'Encerradas', m.end_date.is_not(None)),
            Indicator('without_photos', 'Encerradas sem fotos', and_(m.end_date.is_not(None), ~m.photos.any(), blank(m.photo_path)), 'warning', description='Posses encerradas sem qualquer foto vinculada, incluindo registros legados.'),
            Indicator('without_driver', 'Sem vínculo ao condutor', m.driver_id.is_(None), 'warning', description='Registro sem vínculo ao cadastro reutilizável de condutores.')]
    if module == 'maintenance':
        m = MaintenanceRecord
        return m, [total('Manutenções'), Indicator('open', 'Em andamento', m.end_date.is_(None), 'warning'),
            Indicator('closed', 'Concluídas', m.end_date.is_not(None), 'success'),
            Indicator('long_open', 'Abertas há mais de 30 dias', and_(m.end_date.is_(None), m.start_date < now - timedelta(days=30)), 'danger'),
            Indicator('without_cost', 'Sem custo informado', m.total_cost.is_(None), 'warning'),
            Indicator('cost', 'Custo registrado', m.total_cost.is_not(None), amount=m.total_cost, unit='BRL', description='Soma dos custos informados. Clique para consultar os registros que a compõem.')]
    if module == 'claims':
        m = Claim
        return m, [total('Sinistros'), Indicator('open', 'Abertos', m.status == 'ABERTO', 'danger'),
            Indicator('review', 'Em análise', m.status == 'EM_ANALISE', 'warning'),
            Indicator('closed', 'Encerrados', m.status == 'ENCERRADO', 'success'),
            Indicator('without_attachments', 'Sem anexos', and_(~m.attachments.any(), or_(m.anexos.is_(None), cast(m.anexos, String).in_(['[]', 'null']))), 'warning', description='Sem arquivos na galeria ou na referência legada de anexos.'),
            Indicator('estimated', 'Valor estimado', m.valor_estimado.is_not(None), amount=m.valor_estimado, unit='BRL')]
    if module == 'fines':
        m = Fine
        return m, [total('Multas'), Indicator('pending', 'Pendentes', m.status == 'PENDENTE', 'warning'),
            Indicator('overdue', 'Pendentes vencidas', and_(m.status == 'PENDENTE', m.due_date < now.date()), 'danger'),
            Indicator('appeal', 'Em recurso', m.status == 'RECURSO', 'warning'),
            Indicator('paid', 'Pagas', m.status == 'PAGA', 'success'),
            Indicator('without_driver', 'Sem condutor vinculado', m.driver_id.is_(None), 'warning'),
            Indicator('amount', 'Valor das multas', m.amount.is_not(None), amount=m.amount, unit='BRL')]
    if module == 'fuel_supplies':
        m = FuelSupply
        return m, [total('Abastecimentos'),
            Indicator('anomalies', 'Com alerta de consumo', m.is_consumption_anomaly.is_(True), 'warning'),
            Indicator('without_receipt', 'Sem comprovante', blank(m.receipt_path), 'danger'),
            Indicator('without_amount', 'Sem valor informado', m.total_amount.is_(None), 'warning'),
            Indicator('liters', 'Litros abastecidos', m.liters.is_not(None), amount=m.liters, unit='L'),
            Indicator('amount', 'Valor abastecido', m.total_amount.is_not(None), amount=m.total_amount, unit='BRL')]
    if module == 'fuel_orders':
        m = FuelSupplyOrder
        return m, [total('Ordens'), Indicator('open', 'Abertas válidas', and_(m.status == 'OPEN', m.expires_at >= now), 'success'),
            Indicator('due_today', 'Abertas com vencimento hoje', and_(m.status == 'OPEN', m.expires_at >= now, m.expires_at < datetime.combine(now.date()+timedelta(days=1), datetime.min.time(), tzinfo=now.tzinfo)), 'warning'),
            Indicator('expires_soon', 'Vencem em até 1 hora', and_(m.status == 'OPEN', m.expires_at.between(now, now+timedelta(hours=1))), 'danger'),
            Indicator('expired', 'Expiradas', or_(m.status == 'EXPIRED', and_(m.status == 'OPEN', m.expires_at < now)), 'danger'),
            Indicator('completed', 'Concluídas', m.status == 'COMPLETED', 'success'),
            Indicator('cancelled', 'Canceladas', m.status == 'CANCELLED')]
    if module == 'fuel_stations':
        m = FuelStation
        return m, [total('Postos'), Indicator('active', 'Ativos', m.active.is_(True), 'success'),
            Indicator('inactive', 'Inativos', m.active.is_(False), 'warning'),
            Indicator('without_location', 'Sem coordenadas', or_(m.latitude.is_(None), m.longitude.is_(None)), 'warning')]
    if module == 'users':
        m = User
        return m, [total('Usuários'), Indicator('production', 'Perfil produção', m.role == 'PRODUCAO'),
            Indicator('standard', 'Perfil padrão', m.role == 'PADRAO'), Indicator('station', 'Perfil posto', m.role == 'POSTO'),
            Indicator('admin', 'Administradores', m.role == 'ADMIN'),
            Indicator('password', 'Trocas de senha pendentes', m.must_change_password.is_(True), 'warning'),
            Indicator('cpf', 'CPFs pendentes', blank(m.cpf), 'warning')]
    if module == 'audit':
        m = AuditLog
        return m, [total('Eventos'), Indicator('created', 'Inclusões', m.action == 'CREATE', 'success'),
            Indicator('updated', 'Alterações', m.action == 'UPDATE'), Indicator('deleted', 'Exclusões', m.action == 'DELETE', 'danger'),
            Indicator('today', 'Eventos de hoje', m.created_at >= now.replace(hour=0, minute=0, second=0, microsecond=0)),
            Indicator('other', 'Outras ações', m.action.not_in(['CREATE', 'UPDATE', 'DELETE']))]
    if module == 'vehicle_loans':
        m = VehicleLoan
        return m, [total('Empréstimos'), Indicator('pending', 'Aguardando aceite', m.status.in_(['AWAITING_RECEIPT', 'AWAITING_RETURN_RECEIPT']), 'warning'),
            Indicator('active', 'Em andamento', m.status == 'ACTIVE', 'success'),
            Indicator('overdue', 'Devolução em atraso', and_(m.status.in_(['ACTIVE', 'AWAITING_RETURN_RECEIPT']), m.expected_return_at < now), 'danger'),
            Indicator('returned', 'Devolvidos', m.status == 'RETURNED'),
            Indicator('regularized', 'Regularizados', m.regularized_at.is_not(None))]
    if module == 'imports':
        m = DataImportBatch
        return m, [total('Lotes'), Indicator('review', 'Aguardando revisão', m.status.in_(['ANALYZED', 'REVIEWING']), 'warning'),
            Indicator('applied', 'Aplicados', m.status == 'APPLIED', 'success'),
            Indicator('cancelled', 'Cancelados', m.status == 'CANCELLED')]
    if module == 'payments':
        m = PaymentProcess
        open_process = m.stage.not_in(['PAID', 'ARCHIVED', 'RETURNED', 'CANCELLED'])
        paid = m.stage.in_(['PAID', 'ARCHIVED'])
        return m, [total('Processos'), Indicator('open', 'Em aberto', open_process, 'warning'),
            Indicator('overdue', 'Vencidos', and_(open_process, m.due_date < now.date()), 'danger'),
            Indicator('due_soon', 'Vencem em até 7 dias', and_(open_process, m.due_date.between(now.date(), now.date()+timedelta(days=7))), 'warning'),
            Indicator('pending_amount', 'Valor pendente informado', and_(open_process, m.amount.is_not(None)), amount=m.amount, unit='BRL'),
            Indicator('paid_amount', 'Valor pago registrado', and_(paid, m.amount.is_not(None)), 'success', amount=m.amount, unit='BRL'),
            Indicator('without_amount', 'Sem valor informado', m.amount.is_(None), 'warning')]
    raise ValueError('Unsupported indicator module')


class IndicatorRequest:
    def __init__(self, module, selected):
        self.module = module
        self.model, self.items = definitions(module)
        self.selected = selected or 'total'
        if self.selected not in {item.key for item in self.items}:
            raise HTTPException(status_code=422, detail='Indicador inválido para esta tela.')
        self.result = {'selected': self.selected, 'population': 0, 'reference_at': datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(),
            'items': [{'key': item.key, 'label': item.label, 'value': 0, 'unit': item.unit, 'tone': item.tone, 'description': item.description} for item in self.items]}

    def filter(self, stmt):
        if self.selected == 'total':
            return stmt
        return stmt.where(next(item.predicate for item in self.items if item.key == self.selected))

    def attach(self, value):
        if isinstance(value, dict):
            return {**value, 'indicators': self.result}
        return value.model_copy(update={'indicators': self.result})


def indicator_context(module):
    async def dependency(indicator: str | None = Query(default=None, max_length=40), db: AsyncSession = Depends(get_db_session)):
        context = IndicatorRequest(module, indicator)
        previous = db.info.get(STATE_KEY)
        db.info[STATE_KEY] = context
        try:
            yield context
        finally:
            if previous is None: db.info.pop(STATE_KEY, None)
            else: db.info[STATE_KEY] = previous
    return dependency


def active_context(db, module):
    info = getattr(db, 'info', None)
    context = info.get(STATE_KEY) if isinstance(info, dict) else None
    return context if isinstance(context, IndicatorRequest) and context.module == module else None


def filter_indicator(db, module, stmt):
    context = active_context(db, module)
    return context.filter(stmt) if context else stmt


async def populate_indicators(db, module, stmt):
    context = active_context(db, module)
    if not context:
        return stmt
    model = context.model
    scoped_ids = stmt.with_only_columns(model.id, maintain_column_froms=True).order_by(None).distinct()
    aggregates = [
        (func.coalesce(func.sum(item.amount).filter(item.predicate), 0) if item.amount is not None
         else func.count(model.id).filter(item.predicate)).label(item.key)
        for item in context.items
    ]
    row = (await db.execute(select(*aggregates).where(model.id.in_(scoped_ids)))).mappings().one()
    context.result = {'selected': context.selected, 'population': int(row['total']),
        'reference_at': datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(),
        'items': [{'key': item.key, 'label': item.label, 'value': row[item.key], 'unit': item.unit,
                   'tone': item.tone, 'description': item.description} for item in context.items]}
    return context.filter(stmt)
