"""Opt-in: writes only to a fresh QA schema in the pinned isolated HML cluster."""
import asyncio
import importlib.util
import json
import os
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
import pytest_asyncio
from alembic.migration import MigrationContext
from alembic.operations import Operations
from dotenv import dotenv_values
from fastapi import HTTPException
from sqlalchemy import create_engine, event, func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.exc import DBAPIError

from app.models.analytics_alert import AnalyticsAlertCase as Case, AnalyticsAlertEvent as Event, AnalyticsAlertRequest as SavedRequest
from app.models.audit_log import AuditLog
from app.models.user import UserRole
from app.schemas.analytics_alert import AlertStatusChange
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_alerts import AnalyticsAlerts
from app.services.audit_service import AuditService

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.getenv('ANALYTICS_ALERT_POSTGRES_TESTS') != '1', reason='Isolated PostgreSQL workflow opt-in')]
ROOT = Path(__file__).resolve().parents[2]
FILTERS = AnalyticsV2Filter(date_from='2026-09-11', date_to='2026-10-10')


@pytest_asyncio.fixture
async def qa():
    assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes')
    url = make_url(dotenv_values(ROOT / 'backend/.env')['DATABASE_URL'])
    assert (url.host, url.port, url.database, url.username) == ('127.0.0.1', 5441, 'frota_emprestimos_testes', 'loan_test_app')
    credentials = json.loads((ROOT / 'storage/loan-tests/database.json').read_text())
    assert credentials['host'] == '127.0.0.1' and credentials['port'] == 5441
    owner_url = url.set(drivername='postgresql+psycopg', username=credentials['user'], password=credentials['password'])
    owner = create_engine(owner_url)
    schema = 'analytics_alert_qa_' + uuid4().hex
    spec = importlib.util.spec_from_file_location('qa_alert_migration', ROOT / 'backend/alembic/versions/0052_analytics_alert_workflow.py')
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    try:
        with owner.begin() as conn:
            assert Path(conn.execute(text('SHOW data_directory')).scalar_one()).resolve() == (ROOT / 'storage/loan-tests/cluster').resolve()
            assert conn.execute(text('SELECT gen_random_uuid()')).scalar_one()
            actor_id = conn.execute(text("SELECT id FROM public.users WHERE role = 'ADMIN' LIMIT 1")).scalar_one()
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
            conn.execute(text(f'ALTER DEFAULT PRIVILEGES IN SCHEMA "{schema}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loan_test_app'))
            conn.execute(text(f'SET LOCAL search_path TO "{schema}", public'))
            with Operations.context(MigrationContext.configure(conn)):
                migration.upgrade()
            conn.execute(text('CREATE TABLE audit_logs (LIKE public.audit_logs INCLUDING ALL)'))
            conn.execute(text(f'GRANT USAGE ON SCHEMA "{schema}" TO loan_test_app'))
            conn.execute(text('GRANT SELECT, INSERT, UPDATE, DELETE ON analytics_alert_cases, analytics_alert_requests, audit_logs TO loan_test_app'))
            conn.execute(text('GRANT SELECT, INSERT ON analytics_alert_events TO loan_test_app'))
        engine = create_async_engine(url, connect_args={'server_settings': {'search_path': f'{schema},public', 'statement_timeout': '15000'}})
        def guard_writes(_conn, _cursor, statement, _params, _context, _many):
            words = statement.lstrip().lower().split()
            if words and words[0] in ('insert', 'update', 'delete'):
                target = words[2] if words[0] in ('insert', 'delete') else words[1]
                assert target in {'analytics_alert_cases','analytics_alert_events','analytics_alert_requests','audit_logs'}, statement
        event.listen(engine.sync_engine, 'before_cursor_execute', guard_writes)
        factory = async_sessionmaker(engine, expire_on_commit=False)
        actor = SimpleNamespace(id=actor_id, role=UserRole.ADMIN, organization_id=None, name='Operador QA', email='qa@example.invalid',
            permissions={'analytics': {'can_view': True, 'can_edit': True}, 'fuel_supplies': {'can_view': True},
                'vehicles': {'can_view': True}, 'drivers': {'can_view': True}})
        yield SimpleNamespace(factory=factory, actor=actor, owner=owner, schema=schema, migration=migration)
        await engine.dispose()
    finally:
        with owner.begin() as conn:
            # Only this exact generated schema is ever dropped, never public or operational tables.
            assert schema.startswith('analytics_alert_qa_') and len(schema) == 51
            conn.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        owner.dispose()


async def counts(db):
    return [int((await db.execute(select(func.count()).select_from(model))).scalar_one()) for model in (Case, Event, SavedRequest, AuditLog)]


async def seeded(qa):
    async with qa.factory() as db:
        receipt = await AnalyticsAlerts(db).reconcile(qa.actor, FILTERS, 'initial')
        assert receipt['created'] > 0
        case = (await db.execute(select(Case).where(Case.organization_id.is_not(None)).order_by(Case.id))).scalars().first()
        assert case is not None
        return case.id, receipt


async def test_migration_upgrade_downgrade_in_disposable_empty_schema(qa):
    with qa.owner.begin() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{qa.schema}", public'))
        with Operations.context(MigrationContext.configure(conn)):
            qa.migration.downgrade()
            assert conn.execute(text("SELECT count(*) FROM pg_tables WHERE schemaname=:schema AND tablename LIKE 'analytics_alert_%'"), {'schema': qa.schema}).scalar_one() == 0
            qa.migration.upgrade()
    async with qa.factory() as db:
        assert await counts(db) == [0, 0, 0, 0]
        grants = (await db.execute(text("SELECT has_table_privilege(current_user, 'analytics_alert_events', 'UPDATE'), has_table_privilege(current_user, 'analytics_alert_events', 'DELETE')"))).one()
        assert grants == (False, False)


async def test_dedup_replay_state_and_original_evidence(qa):
    case_id, receipt = await seeded(qa)
    async with qa.factory() as db:
        service = AnalyticsAlerts(db)
        original = (await service.detail(qa.actor, case_id))['original_evidence']
        assert await service.reconcile(qa.actor, FILTERS, 'initial') == receipt
        assert await counts(db) == [receipt['created'], receipt['created'], 1, receipt['created']]
        await service.change_status(qa.actor, case_id, AlertStatusChange(status='IGNORED', reason='Conferido no registro'), 'decision', '"1"')
        again = await service.reconcile(qa.actor, FILTERS, 'different-evaluation')
        assert again['created'] == 0 and again['revisited'] == receipt['created']
        detail = await service.detail(qa.actor, case_id)
        assert detail['status'] == 'IGNORED' and detail['evaluation_count'] == 2
        assert detail['reappeared_after_decision'] and detail['original_evidence'] == original
        assert detail['allowed_states'] == ['IN_REVIEW']
        events = await service.events(qa.actor, case_id)
        assert {event['event_type'] for event in events['items']} == {'DETECTED', 'REEVALUATED', 'STATUS_CHANGED'}


async def test_concurrent_same_reconcile_key_creates_once(qa):
    async def run():
        async with qa.factory() as db:
            return await AnalyticsAlerts(db).reconcile(qa.actor, FILTERS, 'concurrent-same')
    first, second = await asyncio.gather(run(), run())
    assert first == second and first['created'] > 0
    async with qa.factory() as db:
        assert await counts(db) == [first['created'], first['created'], 1, first['created']]


async def test_concurrent_different_recuts_keys_converge_to_same_cases(qa):
    async def run(key):
        async with qa.factory() as db:
            return await AnalyticsAlerts(db).reconcile(qa.actor, FILTERS, key)
    first, second = await asyncio.gather(run('parallel-a'), run('parallel-b'))
    detected = first['detected']
    assert first['created'] + second['created'] == detected
    async with qa.factory() as db:
        assert await counts(db) == [detected, detected * 2, 2, detected * 2]
        assert all(case.evaluation_count == 2 for case in (await db.execute(select(Case))).scalars())


async def test_concurrent_transitions_one_wins_and_status_replay_is_minimal(qa):
    case_id, _ = await seeded(qa)
    change = AlertStatusChange(status='RESOLVED', reason='Ação realizada e conferida')
    async def run(key):
        async with qa.factory() as db:
            try:
                return await AnalyticsAlerts(db).change_status(qa.actor, case_id, change, key, '"1"')
            except HTTPException as exc:
                await db.rollback()
                return exc.status_code
    replies = await asyncio.gather(run('status-a'), run('status-b'))
    assert 409 in replies
    winning = next(item for item in replies if isinstance(item, dict))
    key = 'status-a' if isinstance(replies[0], dict) else 'status-b'
    async with qa.factory() as db:
        assert await AnalyticsAlerts(db).change_status(qa.actor, case_id, change, key, '"1"') == winning
        assert set(winning) == {'id', 'status', 'version'}
        assert (await db.execute(select(func.count()).select_from(Event).where(Event.case_id == case_id, Event.event_type == 'STATUS_CHANGED'))).scalar_one() == 1


async def test_scope_filters_history_and_revalidates_cached_decision(qa):
    case_id, _ = await seeded(qa)
    async with qa.factory() as db:
        case = (await db.execute(select(Case).where(Case.id == case_id))).scalar_one()
        user = SimpleNamespace(**vars(qa.actor))
        user.role, user.organization_id = UserRole.PRODUCAO, case.organization_id
        service = AnalyticsAlerts(db)
        visible = await service.detail(user, case_id)
        assert visible['evidence'] is None and visible['original_evidence'] is None
        assert visible['evidence_unavailable']
        assert (await service.events(user, case_id))['total'] == 0
        listed = await service.list(user, filters=FILTERS.model_copy(update={'organization': uuid4()}))
        assert all(item['organization_id'] == str(user.organization_id) for item in listed['items'])
        decision = AlertStatusChange(status='IN_REVIEW')
        await service.change_status(user, case_id, decision, 'scoped-decision', '"1"')
        scoped_history = await service.events(user, case_id)
        assert scoped_history['total'] == 1 and scoped_history['items'][0]['evidence'] == {}
        user.organization_id = uuid4()
        with pytest.raises(HTTPException) as denied:
            await service.change_status(user, case_id, decision, 'scoped-decision', '"1"')
        assert denied.value.status_code == 404
        await db.rollback()
        user.permissions = {**user.permissions, 'fuel_supplies': {'can_view': False}}
        with pytest.raises(HTTPException) as revoked:
            await service.detail(user, case_id)
        assert revoked.value.status_code == 403


async def test_history_immutable_and_source_unavailable_preserves_original(qa):
    case_id, _ = await seeded(qa)
    with qa.owner.begin() as conn:
        conn.execute(text(f'SET LOCAL search_path TO "{qa.schema}", public'))
        with pytest.raises(DBAPIError):
            conn.execute(text("UPDATE analytics_alert_events SET actor_label='tampered' WHERE case_id=:id"), {'id': case_id})
    async with qa.factory() as db:
        case = (await db.execute(select(Case).where(Case.id == case_id))).scalar_one()
        case.source_id = uuid4()  # Simulate missing logical source only in the disposable case table.
        await db.commit()
        detail = await AnalyticsAlerts(db).detail(qa.actor, case_id)
        assert not detail['source_available'] and detail['original_evidence']
        user = SimpleNamespace(**vars(qa.actor)); user.role = UserRole.PRODUCAO; user.organization_id = case.organization_id
        with pytest.raises(HTTPException) as exc:
            await AnalyticsAlerts(db).detail(user, case_id)
        assert exc.value.status_code == 404


async def test_audit_failure_rolls_back_case_event_and_request(qa, monkeypatch):
    async def fail(*_args, **_kwargs):
        raise RuntimeError('simulated audit failure')
    monkeypatch.setattr(AuditService, 'record', fail)
    async with qa.factory() as db:
        with pytest.raises(RuntimeError):
            await AnalyticsAlerts(db).reconcile(qa.actor, FILTERS, 'audit-failure')
        await db.rollback()
        assert await counts(db) == [0, 0, 0, 0]


async def test_no_detection_does_not_resolve_existing_case_and_key_collision(qa, monkeypatch):
    case_id, _ = await seeded(qa)
    async with qa.factory() as db:
        service = AnalyticsAlerts(db)
        async def empty(_filters):
            return [], {}, {}, 0
        monkeypatch.setattr(service, '_load_detection', empty)
        receipt = await service.reconcile(qa.actor, FILTERS, 'negative')
        assert receipt['detected'] == 0
        assert (await service.detail(qa.actor, case_id))['status'] == 'NEW'
        with pytest.raises(HTTPException) as collision:
            await service.reconcile(qa.actor, FILTERS.model_copy(update={'date_from': FILTERS.date_from.replace(day=12)}), 'negative')
        assert collision.value.status_code == 409


async def test_unassigned_user_context_changes_and_readonly_replay(qa):
    case_id, _ = await seeded(qa)
    async with qa.factory() as db:
        service = AnalyticsAlerts(db)
        user = SimpleNamespace(**vars(qa.actor)); user.role = UserRole.PRODUCAO; user.organization_id = None
        assert (await service.list(user, filters=FILTERS))['total'] == 0
        with pytest.raises(HTTPException) as missing:
            await service.detail(user, case_id)
        assert missing.value.status_code == 404
        case = (await db.execute(select(Case).where(Case.id == case_id))).scalar_one()
        user.organization_id = case.organization_id
        case.vehicle_id = uuid4()  # Simulate stale snapshot in the QA case, never change the live source.
        await db.commit()
        with pytest.raises(HTTPException) as changed:
            await service.detail(user, case_id)
        assert changed.value.status_code == 404
        qa.actor.permissions = {**qa.actor.permissions, 'analytics': {'can_view': True, 'can_edit': False}}
        with pytest.raises(HTTPException) as revoked:
            await service.reconcile(qa.actor, FILTERS, 'initial')
        assert revoked.value.status_code == 403


async def test_scoped_evaluation_visible_but_global_original_hidden_and_count_scoped(qa):
    case_id, _ = await seeded(qa)
    async with qa.factory() as db:
        case = (await db.execute(select(Case).where(Case.id == case_id))).scalar_one()
        evidence = {key: value for key, value in case.latest_evidence.items() if key != 'evaluation_context'}
        context = {**case.latest_evidence['evaluation_context'], 'organization': str(case.organization_id)}
        case.latest_evidence = {**evidence, 'evaluation_context': context}
        db.add(Event(case_id=case_id, event_type='REEVALUATED', actor_user_id=qa.actor.id,
            actor_label='QA scoped evaluation', rule_version=case.rule_version, evidence=evidence, evaluation_context=context))
        await db.commit()
        user = SimpleNamespace(**vars(qa.actor)); user.role = UserRole.PRODUCAO; user.organization_id = case.organization_id
        service = AnalyticsAlerts(db)
        detail = await service.detail(user, case_id)
        assert detail['evidence'] == evidence and detail['original_evidence'] is None
        history = await service.events(user, case_id, offset=1, limit=1)
        assert history['total'] == 1 and history['items'] == []
