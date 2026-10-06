"""Real PostgreSQL transactions and HTTP account isolation; disposable database only."""
import asyncio
import os
from datetime import datetime, timedelta, timezone
from itertools import count
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.security import create_access_token
from app.main import app
from app.models.audit_log import AuditLog
from app.models.justification_suggestion import JustificationSuggestion as Suggestion
from app.models.user import User
from app.services.audit_service import AuditService
from app.services.justification_suggestions import CONTEXTS, PRESETS, remember
from test_vehicle_loan_api import api, workflow_database  # noqa: F401

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Isolated PostgreSQL required')]


async def request(api, actor='admin', context='vehicle_edit', method='GET', id=None):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://localhost:8000',
        cookies={'access_token': create_access_token(api.actors[actor], 'ADMIN'), 'csrf_token': 'suggestions'},
        headers={'Origin': 'http://localhost:8000', 'X-CSRF-Token': 'suggestions'}) as client:
        return await client.request(method, '/api/justification-suggestions' + (f'/{id}' if id else ''), params={'context': context})


async def test_catalog_and_permissions(api):
    assert set(CONTEXTS) == set(PRESETS)
    for context, (_, _, minimum, maximum, _) in CONTEXTS.items():
        response = await request(api, context=context)
        assert response.status_code == 200, response.text
        assert 'no-store' in response.headers['cache-control']
        assert response.json()['history'] == []
        assert all(minimum <= len(p['text']) <= maximum for p in response.json()['presets'])
    assert (await request(api, context='unknown')).status_code == 422
    assert (await request(api, 'standard')).status_code == 403
    assert (await request(api, 'station', 'order_extend')).status_code == 403
    assert (await request(api, 'origin', 'loan_regularization')).status_code == 403
    async with api.sessions() as db:
        from app.models.user_permission import UserPermission
        db.add(UserPermission(user_id=UUID(api.actors['origin']), module='vehicles', can_view=True, can_create=False, can_edit=False, can_delete=False))
        await db.commit()
    assert (await request(api, 'origin')).status_code == 403


async def test_rank_normalization_isolation_forget_and_limit(api, monkeypatch):
    ticks = count()
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr('app.services.justification_suggestions.datetime',
        SimpleNamespace(now=lambda tz: start + timedelta(seconds=next(ticks))))
    uid = UUID(api.actors['admin'])
    async with api.sessions() as db:
        await remember(db, uid, 'vehicle_edit', 'Correção  do cadastro')
        await remember(db, uid, 'vehicle_edit', 'Outra correção de cadastro')
        await remember(db, uid, 'vehicle_edit', ' CORREÇÃO do cadastro ')
        await remember(db, uid, 'possession', 'Correção do cadastro')
        await db.commit()
    result = (await request(api)).json()['history']
    assert len(result) == 2 and result[0]['count'] == 2 and result[0]['text'] == 'CORREÇÃO do cadastro'
    assert (await request(api, 'admin2')).json()['history'] == []
    assert len((await request(api, context='possession')).json()['history']) == 1
    assert (await request(api, 'admin2', method='DELETE', id=result[0]['id'])).status_code == 404
    assert (await request(api, method='DELETE', id=result[0]['id'])).status_code == 204
    async with api.sessions() as db:
        await remember(db, uid, 'vehicle_edit', 'CORREÇÃO do cadastro')
        for n in range(55):
            await remember(db, uid, 'vehicle_edit', f'Correção de cadastro número {n}')
        await remember(db, uid, 'vehicle_edit', 'x' * 501)
        await remember(db, uid, 'vehicle_edit', 'curta')
        await db.commit()
    rows = (await request(api)).json()['history']
    assert len(rows) == 50 and rows[0]['text'] == 'Correção de cadastro número 54'
    assert rows[-1]['text'] == 'Correção de cadastro número 5'


async def test_concurrent_increment_and_pruning(api):
    uid = UUID(api.actors['admin'])
    async def use(value):
        async with api.sessions() as db:
            await remember(db, uid, 'vehicle_edit', value)
            await db.commit()
    await asyncio.gather(*(use('Correção concorrente do cadastro') for _ in range(12)))
    result = (await request(api)).json()['history']
    assert len(result) == 1 and result[0]['count'] == 12
    await asyncio.gather(*(use(f'Correção concorrente de campo {n}') for n in range(55)))
    result = (await request(api)).json()['history']
    assert len(result) == 50 and result[0]['count'] == 12


async def test_normalization_does_not_change_saved_text_length_validation(api):
    async with api.sessions() as db:
        await remember(db, UUID(api.actors['admin']), 'vehicle_edit', 'a      b')
        await remember(db, UUID(api.actors['admin']), 'vehicle_edit', 'A      B')
        await db.commit()
    rows = (await request(api)).json()['history']
    assert len(rows) == 1 and rows[0]['count'] == 2
    assert rows[0]['text'] == 'A      B'


async def test_audit_and_usage_share_transaction_and_forget_keeps_audit(api):
    uid = UUID(api.actors['admin'])
    entity_id = uuid4()
    async def record(db):
        user = await db.get(User, uid)
        await AuditService(db).record(actor=user, action='UPDATE', entity_type='VEHICLE', entity_id=entity_id,
            entity_label='Veículo fictício', details={'reason': 'Texto final revisado'},
            suggestion_context='vehicle_edit', suggestion_text='Texto final revisado')
    async with api.sessions() as db:
        await record(db)
        await db.rollback()
    assert (await request(api)).json()['history'] == []
    async with api.sessions() as db:
        assert await db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_id == entity_id)) == 0
        await record(db)
        await db.commit()
    row = (await request(api)).json()['history'][0]
    assert row['text'] == 'Texto final revisado'
    assert (await request(api, method='DELETE', id=row['id'])).status_code == 204
    async with api.sessions() as db:
        audit = await db.scalar(select(AuditLog).where(AuditLog.entity_id == entity_id))
        assert audit.details['reason'] == 'Texto final revisado'


async def test_real_loan_success_failed_attempt_and_retry(api):
    reason = 'Representação administrativa revisada pelo operador'
    response = await api.request('admin', 'POST', body={**api.proposal(), 'justification': reason})
    assert response.status_code == 201, response.text
    draft = response.json()
    assert (await request(api, context='loan_create')).json()['history'][0]['count'] == 1
    assert (await request(api, context='loan_proposal')).json()['history'] == []
    assert (await api.action(draft, 'submit', 'admin', 'origin', {'justification': reason})).status_code == 200
    assert (await api.action(draft, 'submit', 'admin', 'origin', {'justification': reason})).status_code == 409
    assert (await request(api, context='loan_submit')).json()['history'][0]['count'] == 1
    events = (await api.request('admin', 'GET', f"/{draft['id']}/events")).json()
    assert all(event['justification'] == reason for event in events)


async def test_unified_possession_and_return_count_only_once(api):
    from test_possession_unified_rectification import closed, form, request as possession_request
    pid, _ = await closed(api)
    body, _ = await form(api, pid)
    body['driver_name'] = 'Condutor fictício corrigido'
    response = await possession_request(api, 'PUT', pid, data=body)
    assert response.status_code == 200, response.text
    history = (await request(api, 'origin', 'possession')).json()['history']
    assert len(history) == 1 and history[0]['count'] == 1
    assert history[0]['text'] == body['edit_reason']
    assert (await request(api, 'origin', 'possession_return')).json()['history'] == []
    assert (await possession_request(api, 'PUT', pid, data=body)).status_code == 409
    assert (await request(api, 'origin', 'possession')).json()['history'][0]['count'] == 1
