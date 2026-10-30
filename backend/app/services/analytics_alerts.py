"""Explicit, transactional workflow over the existing fuel-v2.1 detector."""
import hashlib
import json
import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import DateTime, String, cast, func, select, text
from sqlalchemy.dialects.postgresql import insert

from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.analytics_alert import AnalyticsAlertCase as Case, AnalyticsAlertEvent as Event, AnalyticsAlertRequest as SavedRequest
from app.models.fuel_supply import FuelSupply
from app.models.vehicle import Vehicle
from app.repositories.vehicle_scope import historical_organization, responsible_to
from app.services.analytics_v2_fuel import RULE_VERSION, detect_anomalies, fuel_statement
from app.services.analytics_v2_periods import equivalent_periods
from app.services.audit_service import AuditService

RULES = {'capacity', 'odometer', 'close', 'consumption', 'price'}
TRANSITIONS = {'NEW': ['IN_REVIEW', 'RESOLVED', 'IGNORED'],
               'IN_REVIEW': ['RESOLVED', 'IGNORED'], 'RESOLVED': ['IN_REVIEW'], 'IGNORED': ['IN_REVIEW']}
EMPTY_ORG = UUID('00000000-0000-0000-0000-000000000000')


def role(user):
    return getattr(user.role, 'value', user.role)


def permitted(user, module, action='view'):
    return bool(user.permissions.get(module, {}).get('can_' + action))


def authorize(user, *, mutation=False, reconcile=False):
    if not permitted(user, 'analytics') or not permitted(user, 'fuel_supplies'):
        raise HTTPException(403, 'Permissão insuficiente para casos de abastecimento')
    if mutation and (role(user) not in ('SUPERUSER', 'ADMIN', 'PRODUCAO') or not permitted(user, 'analytics', 'edit')):
        raise HTTPException(403, 'Permissão insuficiente para tratar alertas')
    if reconcile and role(user) not in ('SUPERUSER', 'ADMIN'):
        raise HTTPException(403, 'Reconciliação exige administrador autorizado')


def fingerprint(source_id, rule_key):
    if rule_key not in RULES:
        raise ValueError('Regra não suportada')
    return hashlib.sha256(f'analytics-alert:1|fuel_supply|{UUID(str(source_id))}|{rule_key}'.encode()).hexdigest()


def require_transition(current, target, reason):
    if target not in TRANSITIONS[current]:
        raise HTTPException(409, 'Transição não permitida para o estado atual')
    if not reason and not (current == 'NEW' and target == 'IN_REVIEW'):
        raise HTTPException(422, 'Informe a ação realizada ou o motivo da decisão/reabertura')


def mutation_headers(key, etag=None, *, status_change=False):
    if not key or (status_change and not etag):
        raise HTTPException(428, 'Idempotency-Key e, na transição, If-Match são obrigatórios')
    if not re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}', key):
        raise HTTPException(422, 'Idempotency-Key inválida')
    if status_change:
        if not re.fullmatch(r'"[1-9][0-9]{0,9}"', etag):
            raise HTTPException(422, 'If-Match deve conter a versão entre aspas')
        return int(etag[1:-1])
    return None


def effective_scope(user, requested=None):
    return EMPTY_ORG if production_scope_is_empty(user) else scoped_organization_id(user, requested)


def evidence_visible(user, context):
    if role(user) not in ('ADMIN', 'PRODUCAO'):
        return True
    return user.organization_id is not None and context.get('organization') == str(user.organization_id)


class AnalyticsAlerts:
    def __init__(self, db):
        self.db = db

    def _statement(self, user, organization=None):
        scope = effective_scope(user, organization)
        last_decision = select(func.max(Event.created_at)).where(Event.case_id == Case.id,
            Event.event_type == 'STATUS_CHANGED').correlate(Case).scalar_subquery()
        query = select(Case, Vehicle.plate, Vehicle.brand, Vehicle.model,
            FuelSupply.id.label('live_source_id'),
            FuelSupply.supplied_at.label('source_occurred_at'),
            (Case.last_evaluated_at > last_decision).label('reappeared')).select_from(Case).outerjoin(
            FuelSupply, FuelSupply.id == Case.source_id).outerjoin(Vehicle, Vehicle.id == Case.vehicle_id)
        if role(user) != 'SUPERUSER':
            query = query.where(FuelSupply.id.is_not(None), Case.organization_id.is_not(None),
                FuelSupply.vehicle_id == Case.vehicle_id, FuelSupply.driver_id.is_not_distinct_from(Case.driver_id))
        if scope is not None:
            query = query.where(responsible_to(FuelSupply, FuelSupply.supplied_at, scope))
        return query

    def _present(self, row, user):
        case = row[0]
        envelope = case.latest_evidence
        context = envelope.get('evaluation_context', {})
        visible = evidence_visible(user, context)
        return jsonable_encoder({
            'id': case.id, 'source_type': case.source_type, 'source_id': case.source_id,
            'rule_key': case.rule_key, 'rule_version': case.rule_version,
            'status': case.status, 'severity': case.severity, 'version': case.version,
            'vehicle_id': case.vehicle_id,
            'driver_id': case.driver_id if permitted(user, 'drivers') else None,
            'plate': row.plate or envelope.get('plate'), 'brand': row.brand, 'model': row.model,
            'organization_id': case.organization_id,
            'source_available': row.live_source_id is not None,
            'source_occurred_at': row.source_occurred_at or envelope.get('supplied_at'),
            'first_detected_at': case.first_detected_at, 'last_detected_at': case.last_detected_at,
            'evaluation_count': case.evaluation_count, 'reappeared_after_decision': bool(row.reappeared)
                and case.status in ('RESOLVED', 'IGNORED'),
            'evidence': {key: value for key, value in envelope.items() if key != 'evaluation_context'} if visible else None,
            'evaluation_context': context if visible else None,
            'evidence_unavailable': not visible,
            'allowed_states': TRANSITIONS[case.status] if permitted(user, 'analytics', 'edit')
                and role(user) in ('SUPERUSER', 'ADMIN', 'PRODUCAO') else [],
            'can_view_vehicle': permitted(user, 'vehicles'),
        })

    async def _case(self, user, case_id, *, lock=False):
        query = self._statement(user).where(Case.id == case_id)
        if lock:
            # Match reconciliation's source -> case lock order. Recheck scope after
            # acquiring the source lock so attribution edits cannot race a decision.
            candidate = (await self.db.execute(query)).first()
            if candidate is None:
                raise HTTPException(404, 'Caso não encontrado')
            await self.db.execute(select(FuelSupply.id).where(FuelSupply.id == candidate[0].source_id).with_for_update())
            query = query.with_for_update(of=Case)
        row = (await self.db.execute(query.execution_options(populate_existing=True))).first()
        if row is None:
            raise HTTPException(404, 'Caso não encontrado')
        return row

    def _event_scope(self, user):
        if role(user) in ('ADMIN', 'PRODUCAO'):
            return Event.evaluation_context['organization'].astext == str(effective_scope(user))
        return text('true')

    async def list(self, user, *, filters, status=None, severity=None, rule_key=None, offset=0, limit=50):
        authorize(user)
        query = self._statement(user, filters.organization)
        period, _ = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        occurred = func.coalesce(FuelSupply.supplied_at, cast(Case.latest_evidence['supplied_at'].astext, DateTime(timezone=True)))
        query = query.where(occurred >= period.start_at, occurred < period.end_exclusive,
            Case.status == status if status else Case.status.in_(('NEW', 'IN_REVIEW')))
        if severity:
            query = query.where(Case.severity == severity)
        if rule_key:
            query = query.where(Case.rule_key == rule_key)
        if filters.vehicle_id:
            query = query.where(Case.vehicle_id == filters.vehicle_id)
        if filters.vehicle_type:
            query = query.where(Vehicle.vehicle_type == filters.vehicle_type)
        total = (await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = (await self.db.execute(query.order_by(Case.last_detected_at.desc(), Case.id).offset(offset).limit(limit))).all()
        return {'items': [self._present(row, user) for row in rows], 'total': total, 'offset': offset, 'limit': limit,
            'filters': jsonable_encoder(filters.model_copy(update={'organization': effective_scope(user, filters.organization)})),
            'coverage': 'Casos persistidos por reconciliação explícita; não representa todas as anomalias ou flags operacionais.'}

    async def detail(self, user, case_id):
        authorize(user)
        row = await self._case(user, case_id)
        result = self._present(row, user)
        original = (await self.db.execute(select(Event).where(Event.case_id == case_id,
            Event.event_type == 'DETECTED', self._event_scope(user)).order_by(Event.created_at, Event.id).limit(1))).scalar_one_or_none()
        result['original_evidence'] = original.evidence if original else None
        result['original_context'] = original.evaluation_context if original else None
        # A compatible older evaluation is explicitly identified; never disguise it as the latest global one.
        if result['evidence_unavailable']:
            compatible = (await self.db.execute(select(Event).where(Event.case_id == case_id,
                Event.event_type.in_(('DETECTED', 'REEVALUATED')), self._event_scope(user))
                .order_by(Event.created_at.desc(), Event.id).limit(1))).scalar_one_or_none()
            result['compatible_evidence'] = compatible.evidence if compatible else None
            result['compatible_context'] = compatible.evaluation_context if compatible else None
        return result

    async def events(self, user, case_id, *, offset=0, limit=50):
        authorize(user)
        await self._case(user, case_id)
        query = select(Event).where(Event.case_id == case_id, self._event_scope(user))
        total = (await self.db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
        rows = (await self.db.execute(query.order_by(Event.created_at.desc(), Event.id).offset(offset).limit(limit))).scalars().all()
        return jsonable_encoder({'items': [{key: getattr(event, key) for key in (
            'id', 'event_type', 'from_status', 'to_status', 'actor_label', 'reason', 'rule_version',
            'evidence', 'evaluation_context', 'created_at')} for event in rows], 'total': total, 'offset': offset, 'limit': limit})

    async def _request(self, user, operation, key, payload):
        encoded = json.dumps(jsonable_encoder(payload), sort_keys=True, separators=(',', ':'))
        digest = hashlib.sha256(encoded.encode()).hexdigest()
        lock = int.from_bytes(hashlib.sha256(f'{user.id}|{operation}|{key}'.encode()).digest()[:8], 'big', signed=True)
        await self.db.execute(select(func.pg_advisory_xact_lock(lock)))
        existing = (await self.db.execute(select(SavedRequest).where(SavedRequest.actor_user_id == user.id,
            SavedRequest.operation == operation, SavedRequest.idempotency_key == key))).scalar_one_or_none()
        if existing and existing.request_hash != digest:
            raise HTTPException(409, 'Chave idempotente já usada para outro pedido')
        return existing, digest

    async def _save_request(self, user, operation, key, digest, result):
        self.db.add(SavedRequest(actor_user_id=user.id, operation=operation, idempotency_key=key,
            request_hash=digest, response_json=jsonable_encoder(result)))
        await self.db.commit()

    async def _load_detection(self, filters):
        period, previous = equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        rows = (await self.db.execute(fuel_statement(filters, previous.start_at, period.end_exclusive)
            .order_by(FuelSupply.id).with_for_update(of=FuelSupply))).mappings().all()
        anomalies, _, _ = detect_anomalies(rows, period)
        ids = {item.supply_id for item in anomalies}
        sources = {}
        if ids:
            field = getattr(FuelSupply, 'responsible_organization_id', FuelSupply.organization_id)
            resolved = func.coalesce(cast(field, String), historical_organization(FuelSupply.vehicle_id, FuelSupply.supplied_at))
            facts = (await self.db.execute(select(FuelSupply.id, FuelSupply.driver_id,
                resolved.label('organization')).where(FuelSupply.id.in_(ids)).with_for_update())).mappings().all()
            sources = {row['id']: row for row in facts}
        context = {**filters.model_dump(mode='json'), 'timezone': 'America/Bahia',
            'history_date_from': previous.date_from.isoformat(), 'history_date_to': previous.date_to.isoformat(),
            'history_limit': 'Período anterior equivalente; preço limitado a 90 dias anteriores.'}
        return anomalies, sources, context, sum(row['supplied_at'] >= period.start_at for row in rows)

    async def reconcile(self, user, filters, key):
        authorize(user, mutation=True, reconcile=True)
        mutation_headers(key)
        # Validate civil dates even when replaying; replay never expands today's permission.
        try:
            equivalent_periods(filters.date_from, filters.date_to, now=datetime.now(timezone.utc))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        existing, digest = await self._request(user, 'RECONCILE', key, {'route': 'POST /alerts/reconcile', 'filters': filters})
        if existing:
            await self.db.commit()
            return existing.response_json
        anomalies, sources, context, evaluated = await self._load_detection(filters)
        created = revisited = skipped = 0
        # Stable lock order also prevents deadlock across concurrent recuts.
        for item in sorted(anomalies, key=lambda anomaly: fingerprint(anomaly.supply_id, anomaly.kind)):
            source = sources.get(item.supply_id)
            if source is None:
                skipped += 1
                continue
            now = datetime.now(timezone.utc)
            evidence = item.model_dump(mode='json')
            values = dict(fingerprint=fingerprint(item.supply_id, item.kind), fingerprint_version=1,
                source_type='fuel_supply', source_id=item.supply_id, rule_key=item.kind, rule_version=RULE_VERSION,
                vehicle_id=item.vehicle_id, driver_id=source['driver_id'],
                organization_id=UUID(source['organization']) if source['organization'] else None,
                severity='HIGH' if item.kind == 'odometer' else 'MEDIUM', status='NEW',
                first_detected_at=now, last_detected_at=now, last_evaluated_at=now,
                evaluation_count=1, version=1, latest_evidence={**evidence, 'evaluation_context': context})
            case_id = (await self.db.execute(insert(Case).values(**values).on_conflict_do_nothing(
                index_elements=[Case.fingerprint]).returning(Case.id))).scalar_one_or_none()
            is_new = case_id is not None
            case = (await self.db.execute(select(Case).where(Case.fingerprint == values['fingerprint'])
                .with_for_update().execution_options(populate_existing=True))).scalar_one()
            if not is_new:
                case.last_detected_at = case.last_evaluated_at = case.updated_at = now
                case.evaluation_count += 1
                case.version += 1
                case.latest_evidence = values['latest_evidence']
                case.rule_version = RULE_VERSION
                case.organization_id, case.vehicle_id, case.driver_id = values['organization_id'], item.vehicle_id, source['driver_id']
            created += int(is_new)
            revisited += int(not is_new)
            self.db.add(Event(case_id=case.id, event_type='DETECTED' if is_new else 'REEVALUATED',
                actor_user_id=user.id, actor_label=user.name, rule_version=RULE_VERSION,
                evidence=evidence, evaluation_context=context, created_at=now))
            await AuditService(self.db).record(actor=user, action='CREATE' if is_new else 'UPDATE',
                entity_type='ANALYTICS_ALERT', entity_id=case.id, entity_label=item.label,
                details={'operation': 'DETECTED' if is_new else 'REEVALUATED', 'rule_key': item.kind,
                    'version': case.version, 'status': case.status, 'evaluation_context': context})
        result = {'evaluated': evaluated, 'detected': len(anomalies), 'created': created,
            'revisited': revisited, 'skipped': skipped, 'filters': filters.model_dump(mode='json'), 'rule_version': RULE_VERSION}
        await self._save_request(user, 'RECONCILE', key, digest, result)
        return result

    async def change_status(self, user, case_id, change, key, etag):
        authorize(user, mutation=True)
        expected = mutation_headers(key, etag, status_change=True)
        existing, digest = await self._request(user, 'STATUS_CHANGE', key,
            {'route': f'PATCH /alerts/{case_id}/status', 'body': change, 'if_match': expected})
        row = await self._case(user, case_id, lock=True)  # Revalidate source/scope before cached response.
        if existing:
            await self.db.commit()
            # Return only a minimal persisted receipt; no old evidence after scope changes.
            return existing.response_json
        case = row[0]
        if case.version != expected:
            raise HTTPException(409, 'Caso atualizado por outra operação; recarregue antes de decidir')
        require_transition(case.status, change.status, change.reason)
        before = case.status
        now = datetime.now(timezone.utc)
        case.status = change.status
        case.version += 1
        case.updated_at = now
        context = {'organization': str(effective_scope(user)) if effective_scope(user) else None}
        envelope = case.latest_evidence
        visible = evidence_visible(user, envelope.get('evaluation_context', {}))
        self.db.add(Event(case_id=case.id, event_type='STATUS_CHANGED', from_status=before,
            to_status=case.status, reason=change.reason, actor_user_id=user.id, actor_label=user.name,
            rule_version=case.rule_version, evidence={key: value for key, value in envelope.items()
                if key != 'evaluation_context'} if visible else {}, evaluation_context=context, created_at=now))
        await AuditService(self.db).record(actor=user, action='UPDATE', entity_type='ANALYTICS_ALERT',
            entity_id=case.id, entity_label=case.rule_key, details={'operation': 'STATUS_CHANGED',
                'from_status': before, 'to_status': case.status, 'reason': change.reason, 'version': case.version})
        result = {'id': str(case.id), 'status': case.status, 'version': case.version}
        await self._save_request(user, 'STATUS_CHANGE', key, digest, result)
        return result
