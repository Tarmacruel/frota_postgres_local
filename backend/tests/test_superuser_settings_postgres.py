"""Run only on an explicitly disposable HML database. Never uses the live DB."""
import base64
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import os
from types import SimpleNamespace
from uuid import UUID, uuid4
import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from starlette.requests import Request
from app.core.settings_catalog import DEFAULT_SETTINGS
from app.core import record_visibility
from app.db.base import Base
from app.models import Organization, User, UserRole, Driver, Vehicle, MaintenanceRecord
from app.models.audit_log import AuditLog
from app.models.contract_balance import ContractControl, ContractMovement, ContractOperation
from app.models.payment_process import PaymentContract, PaymentSupplier, PaymentProcessKind
from app.models.system_settings import SystemSettings, RecordControl
from app.schemas.system_settings import SettingsUpdate, RecordAction
from app.services.system_settings_service import SystemSettingsService, publish_runtime
from app.services.record_admin_service import RecordAdminService
from app.services.contract_balance_service import ContractBalanceService
from app.services.user_service import UserService

URL = os.getenv('SUPERUSER_TEST_DATABASE_URL')
pytestmark = pytest.mark.skipif(not URL, reason='Requires an explicitly disposable HML database')


@pytest_asyncio.fixture
async def context():
    url = make_url(URL)
    assert url.host == '127.0.0.1' and url.port == 5441 and url.database.startswith('frota_contract_tests_')
    engine = create_async_engine(URL)
    async with engine.begin() as connection:
        await connection.execute(text('TRUNCATE ' + ','.join('\"' + name + '\"' for name in Base.metadata.tables) + ' CASCADE'))
    async with AsyncSession(engine, expire_on_commit=False) as db:
        own, other = Organization(name='Secretaria A'), Organization(name='Secretaria B')
        db.add_all([own, other]); await db.flush()
        admin = User(name='Admin A', email='admin_a@test.local', organization_id=own.id, password_hash='test-only', role=UserRole.ADMIN)
        foreign = User(name='Admin B', email='admin_b@test.local', organization_id=other.id, password_hash='test-only', role=UserRole.ADMIN)
        superuser = User(name='Super Teste', email='jonatas@sousa', organization_id=own.id, password_hash='test-only', role=UserRole.SUPERUSER)
        db.add_all([admin, foreign, superuser]); await db.commit()
        db.info.update(visibility_role='SUPERUSER', actor_id=superuser.id)
        yield SimpleNamespace(db=db, own=own, other=other, admin=admin, foreign=foreign, superuser=superuser)
    publish_runtime(DEFAULT_SETTINGS)
    await engine.dispose()


@pytest.mark.asyncio
async def test_users_and_all_summary_counts_are_scoped_even_with_forged_filter(context):
    c = context
    rows, total, summary = await UserService(c.db).list_paginated(current_user=c.admin, page=1, limit=20, organization_id=c.other.id)
    assert [user.id for user in rows] == [c.admin.id]
    assert total == 1 and summary['ADMIN'] == 1
    assert 'SUPERUSER' not in summary
    rows, total, _ = await UserService(c.db).list_paginated(current_user=c.superuser, page=1, limit=20)
    assert total == 3
    missing = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN, organization_id=None)
    assert await UserService(c.db).list_paginated(current_user=missing, page=1, limit=20) == ([], 0, {})


@pytest.mark.asyncio
async def test_settings_review_is_versioned_audited_and_does_not_drop_data_on_stale_save(context):
    c = context; service = SystemSettingsService(c.db)
    values = deepcopy(DEFAULT_SETTINGS); values['identity']['systemName'] = 'Frota de teste'
    response = await service.update(SettingsUpdate(expected_revision=0, values=values, justification='Identidade fictícia para validar configuração'), c.superuser)
    assert response['revision'] == 1 and response['values']['identity']['systemName'] == 'Frota de teste'
    with pytest.raises(HTTPException) as conflict:
        await service.update(SettingsUpdate(expected_revision=0, values=DEFAULT_SETTINGS, justification='Rascunho atrasado de outra sessão'), c.superuser)
    assert conflict.value.status_code == 409
    await c.db.rollback()
    assert (await service.get())['values']['identity']['systemName'] == 'Frota de teste'
    assert await c.db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.entity_type == 'SYSTEM_SETTINGS')) == 1


@pytest.mark.asyncio
async def test_last_global_user_cannot_be_demoted(context):
    c = context
    await c.db.refresh(c.superuser)
    service = UserService(c.db)
    with pytest.raises(HTTPException) as conflict:
        await service.update(c.superuser.id, SimpleNamespace(model_dump=lambda **_: {'role': UserRole.ADMIN}), c.superuser)
    assert conflict.value.status_code == 409
    await c.db.rollback()


async def seed_driver(c, suffix, org):
    row = Driver(nome_completo='Condutor ' + suffix, documento='DOC-' + suffix, matricula=suffix,
                 organization_id=org, cnh_categoria='B', contato='Contato de teste')
    c.db.add(row); await c.db.commit()
    return row


@pytest.mark.asyncio
async def test_archive_filters_rows_counts_and_aliases_for_normal_users_and_reactivation_restores(context):
    c = context
    first = await seed_driver(c, 'um', c.own.id)
    second = await seed_driver(c, 'dois', c.other.id)
    service = RecordAdminService(c.db)
    result = await service.change('drivers', first.id, RecordAction(expected_revision=0, inactive=True,
        changes={'contato': None}, justification='Registro de teste inativado após conferência'), c.superuser)
    assert result['inactive'] and result['values']['contato'] is None
    c.db.info.update(visibility_role='ADMIN', presentation_read=True)
    assert await c.db.scalar(select(func.count()).select_from(Driver)) == 1
    assert (await c.db.scalars(select(Driver.id))).all() == [second.id]
    from sqlalchemy.orm import aliased
    alias = aliased(Driver)
    assert (await c.db.scalars(select(alias.id))).all() == [second.id]
    c.db.info['visibility_role'] = 'SUPERUSER'
    assert await c.db.scalar(select(func.count()).select_from(Driver)) == 2
    await service.change('drivers', first.id, RecordAction(expected_revision=1, inactive=False,
        justification='Reativação de teste após correção cadastral'), c.superuser)
    c.db.info['visibility_role'] = 'ADMIN'
    assert await c.db.scalar(select(func.count()).select_from(Driver)) == 2


@pytest.mark.asyncio
async def test_inactive_ids_cannot_be_used_by_forged_write(context):
    c = context; row = await seed_driver(c, 'privado', c.own.id)
    c.db.add(RecordControl(module='drivers', record_id=row.id, inactive=True, custom_fields={}, lifecycle_effects={}, revision=1)); await c.db.commit()
    async def receive(): return {'type': 'http.request', 'body': json.dumps({'driver_id': str(row.id)}).encode()}
    request = Request({'type': 'http', 'method': 'POST', 'path': '/api/possession', 'headers': [(b'content-type', b'application/json')], 'query_string': b'', 'path_params': {}}, receive)
    with pytest.raises(HTTPException) as missing:
        await record_visibility.guard_inactive_inputs(c.db, request, c.admin)
    assert missing.value.status_code == 404


@pytest.mark.asyncio
async def test_custom_values_commit_atomically_with_new_entity(context):
    c = context
    values = deepcopy(DEFAULT_SETTINGS)
    values['forms']['drivers'] = {'fields': {}, 'custom': [{'key': 'turno', 'label': 'Turno', 'type': 'text', 'required': True, 'active': True}]}
    publish_runtime(values)
    from app.core.custom_fields import capture_submission
    encoded = base64.b64encode(json.dumps({'module': 'drivers', 'values': {'turno': 'Manhã'}}).encode()).decode()
    request = Request({'type': 'http', 'method': 'POST', 'path': '/api/drivers', 'headers': [(b'x-form-fields', encoded.encode())], 'query_string': b''})
    await capture_submission(c.db, request)
    c.db.info['audit_actor'] = c.superuser
    row = Driver(nome_completo='Condutor adicional', documento='DOCUMENTO-UNICO', organization_id=c.own.id, cnh_categoria='B')
    c.db.add(row); await c.db.commit()
    assert (await c.db.get(RecordControl, ('drivers', row.id))).custom_fields == {'turno': 'Manhã'}
    assert await c.db.scalar(select(func.count()).select_from(Driver)) == 1
    from app.models.audit_log import AuditLog
    assert await c.db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.action == 'FORM_FIELDS')) == 1


async def funded_maintenance(c):
    now = datetime.now(timezone.utc)
    vehicle = Vehicle(plate='TST0001', brand='Teste', model='Teste', owner_organization_id=c.own.id)
    supplier = PaymentSupplier(name='Prestador fictício')
    c.db.add_all([vehicle, supplier]); await c.db.flush()
    contract = PaymentContract(supplier_id=supplier.id, number='TESTE-SALDO', kind=PaymentProcessKind.MAINTENANCE,
                               valid_from=date.today() - timedelta(days=10), valid_until=date.today() + timedelta(days=300))
    c.db.add(contract); await c.db.flush()
    c.db.add(ContractControl(contract_id=contract.id, opening_balance=1000, opening_date=date.today(), opened_by=c.superuser.id, justification='Abertura fictícia para teste'))
    record = MaintenanceRecord(vehicle_id=vehicle.id, start_date=now-timedelta(hours=1), end_date=now,
        service_description='Serviço fictício', total_cost=100, created_by=c.superuser.id, responsible_organization_id=c.own.id)
    c.db.add(record); await c.db.flush()
    operation = ContractOperation(contract_id=contract.id, source_type='MAINTENANCE', source_id=record.id,
        amount=100, occurred_at=now, organization_id=c.own.id, vehicle_id=vehicle.id)
    c.db.add(operation); await c.db.flush()
    balance = ContractBalanceService(c.db)
    await balance.movement(event_key='test-opening-' + str(contract.id), contract_id=contract.id, movement_type='OPENING', actor=c.superuser,
        balance_delta=1000, source_type='OPENING', source_id=contract.id)
    await balance.movement(event_key='test-consumption-' + str(contract.id), contract_id=contract.id, movement_type='CONSUMPTION', actor=c.superuser,
        balance_delta=-100, consumed_delta=100, operation_id=operation.id, source_type='MAINTENANCE', source_id=record.id,
        vehicle_id=vehicle.id, organization_id=c.own.id)
    await c.db.commit()
    return record, operation, contract, balance


@pytest.mark.asyncio
async def test_expense_inactivation_reverses_once_and_reactivation_restores_exact_cost(context):
    c = context; record, operation, contract, balance = await funded_maintenance(c)
    service = RecordAdminService(c.db)
    plan = (await service.detail('maintenance', record.id))['lifecycle']
    assert plan['can_confirm'] and Decimal(plan['amount']) == 100
    payload = RecordAction(expected_revision=0, inactive=True, effect_action='reverse', expected_effect_token=plan['token'], justification='Anulação de lançamento fictício para teste')
    await service.change('maintenance', record.id, payload, c.superuser)
    assert (await balance.balances(contract.id))['available_balance'] == 1000
    record_id, contract_id = record.id, contract.id
    with pytest.raises(HTTPException): await service.change('maintenance', record_id, payload, c.superuser)
    await c.db.rollback()
    await c.db.refresh(c.superuser)
    plan = (await service.detail('maintenance', record_id))['lifecycle']
    assert plan['restoring']
    await service.change('maintenance', record_id, RecordAction(expected_revision=1, inactive=False, effect_action='restore',
        expected_effect_token=plan['token'], justification='Restabelecimento fictício para teste'), c.superuser)
    result = await balance.balances(contract_id)
    assert result['available_balance'] == 900 and result['consumed_since_opening'] == 100
    assert await c.db.scalar(select(func.count()).select_from(ContractMovement).where(ContractMovement.contract_id == contract_id)) == 4


@pytest.mark.asyncio
async def test_active_handoff_blocks_archiving_and_gives_the_resolution_link(context):
    from app.services.record_lifecycle_service import RecordLifecycleService
    loan = SimpleNamespace(id=uuid4(), status='ACTIVE')
    plan = await RecordLifecycleService(context.db).plan('vehicle_loans', loan)
    assert not plan['can_confirm'] and plan['steps'][0]['href'] == f'/emprestimos?id={loan.id}'


@pytest.mark.asyncio
async def test_paid_invoice_must_be_cancelled_before_unlinking_and_reversing(context):
    from app.models.payment_process import PaymentProcess, PaymentProcessStage
    from app.services.record_lifecycle_service import RecordLifecycleService
    c = context; record, operation, contract, balance = await funded_maintenance(c)
    invoice = PaymentProcess(import_key='test-' + uuid4().hex, process_number='FATURA-TESTE', kind=PaymentProcessKind.MAINTENANCE, stage=PaymentProcessStage.PAID,
        amount=100, contract_id=contract.id, organization_id=c.own.id, created_by_user_id=c.superuser.id, updated_by_user_id=c.superuser.id)
    c.db.add(invoice); await c.db.flush(); operation.invoice_process_id = invoice.id; await c.db.commit()
    service = RecordAdminService(c.db)
    detail = await service.detail('maintenance', record.id)
    assert not detail['lifecycle']['can_confirm']
    record_id, invoice_id, contract_id = record.id, invoice.id, contract.id
    with pytest.raises(HTTPException):
        await service.change('maintenance', record_id, RecordAction(expected_revision=0, inactive=True, justification='Teste bloqueado antes de cancelar fatura'), c.superuser)
    await c.db.rollback()
    await c.db.refresh(c.superuser)
    invoice = await c.db.get(PaymentProcess, invoice_id); invoice.stage = PaymentProcessStage.CANCELLED; await c.db.commit()
    detail = await service.detail('maintenance', record_id)
    assert detail['lifecycle']['steps'][0]['can_release_invoice']
    record = await c.db.get(MaintenanceRecord, record_id)
    await RecordLifecycleService(c.db).release_cancelled_invoice('maintenance', record, None,
        RecordAction(expected_revision=0, expected_effect_token=detail['lifecycle']['token'], justification='Fatura cancelada e serviço a estornar'), c.superuser)
    assert (await service.detail('maintenance', record.id))['lifecycle']['can_confirm']
    assert (await balance.balances(contract_id))['available_balance'] == 900  # Unlinking never refunds the service.


@pytest.mark.asyncio
async def test_quantity_reversal_and_reactivation_follow_the_same_immutable_item_ledger(context):
    from app.models.contract_item import ContractItem, ContractQuantityControl
    from app.services.contract_item_service import ContractItemService
    c = context; record, operation, contract, balance = await funded_maintenance(c)
    item = ContractItem(contract_id=contract.id, code='SER', original_number='1', description='Serviço fictício', category='SERVICE', unit='SER',
        original_quantity=10, original_unit_price=10, reference_unit_price=10, opening_quantity=10, historical_added_quantity=0)
    c.db.add(item)
    c.db.add(ContractQuantityControl(contract_id=contract.id, adjudication='ITEM', justification='Abertura fictícia dos itens',
        document_reference='Teste', request_key=uuid4(), request_fingerprint='a'*64, opened_by=c.superuser.id))
    await c.db.flush()
    quantities = ContractItemService(c.db)
    await quantities.movement(contract.id, item.id, 'test-item-opening-' + str(item.id), 'OPENING', c.superuser, quantity_delta=10)
    await quantities.realize(operation, [dict(item_id=item.id, quantity=10, unit_price=10, amount=100)], c.superuser)
    await c.db.commit()
    service = RecordAdminService(c.db)
    assert (await quantities.balances(contract.id))[item.id]['available'] == 0
    plan = (await service.detail('maintenance', record.id))['lifecycle']
    assert Decimal(plan['quantities'][0]['quantity']) == 10
    await service.change('maintenance', record.id, RecordAction(expected_revision=0, inactive=True, effect_action='reverse',
        expected_effect_token=plan['token'], justification='Estorno fictício de quantidade e valor'), c.superuser)
    assert (await quantities.balances(contract.id))[item.id]['available'] == 10
    plan = (await service.detail('maintenance', record.id))['lifecycle']
    await service.change('maintenance', record.id, RecordAction(expected_revision=1, inactive=False, effect_action='restore',
        expected_effect_token=plan['token'], justification='Restabelecimento fictício das quantidades'), c.superuser)
    assert (await quantities.balances(contract.id))[item.id]['available'] == 0
    assert (await balance.balances(contract.id))['consumed_since_opening'] == 100


@pytest.mark.asyncio
async def test_executed_child_must_be_reactivated_through_its_archived_order(context):
    from app.models.contract_balance import ContractProvider, MaintenanceOrder
    c = context; record, operation, contract, balance = await funded_maintenance(c)
    provider = ContractProvider(contract_id=contract.id, supplier_id=contract.supplier_id)
    c.db.add(provider); await c.db.flush()
    order = MaintenanceOrder(contract_id=contract.id, provider_id=provider.id, vehicle_id=record.vehicle_id,
        status='COMPLETED', service_description='Pedido fictício', estimated_cost=100,
        request_key=uuid4(), maintenance_record_id=record.id, created_by=c.superuser.id)
    c.db.add(order); await c.db.commit()
    service = RecordAdminService(c.db)
    plan = (await service.detail('maintenance_orders', order.id))['lifecycle']
    await service.change('maintenance_orders', order.id, RecordAction(expected_revision=0, inactive=True,
        effect_action='reverse', expected_effect_token=plan['token'], justification='Inativação de pedido fictício e seu serviço'), c.superuser)
    child = await service.detail('maintenance', record.id)
    assert child['inactive'] and not child['lifecycle']['can_confirm']
    assert child['lifecycle']['steps'][0]['key'] == 'managed-parent'
    assert (await balance.balances(contract.id))['available_balance'] == 1000
    plan = (await service.detail('maintenance_orders', order.id))['lifecycle']
    await service.change('maintenance_orders', order.id, RecordAction(expected_revision=1, inactive=False,
        effect_action='restore', expected_effect_token=plan['token'], justification='Reativação conjunta de pedido e serviço'), c.superuser)
    assert not (await service.detail('maintenance', record.id))['inactive']
    assert (await balance.balances(contract.id))['available_balance'] == 900


@pytest.mark.asyncio
async def test_inactive_user_is_hidden_and_cannot_keep_using_an_existing_session(context):
    c = context
    service = RecordAdminService(c.db)
    await service.change('users', c.foreign.id, RecordAction(expected_revision=0, inactive=True,
        justification='Suspensão fictícia de acesso para teste'), c.superuser)
    request = Request({'type': 'http', 'method': 'GET', 'path': '/api/auth/me', 'headers': [], 'query_string': b'', 'path_params': {}})
    with pytest.raises(HTTPException) as denied:
        await record_visibility.guard_inactive_inputs(c.db, request, c.foreign)
    assert denied.value.status_code == 403
    with pytest.raises(HTTPException):
        await service.change('users', c.superuser.id, RecordAction(expected_revision=0, inactive=True,
            justification='Tentativa de inativar a própria administração'), c.superuser)


@pytest.mark.asyncio
async def test_refresh_overlay_normalizes_only_the_exact_audited_role_delta(context):
    import sys
    from pathlib import Path
    import psycopg
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    import importlib.util
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location('tested_hml_refresh', root / 'scripts/homologation/refresh_data.py')
    refresh = importlib.util.module_from_spec(spec); spec.loader.exec_module(refresh)
    admin_overlay, fingerprints = refresh.overlay_service, refresh.fingerprints
    c = context
    principal_id = c.superuser.id
    await c.db.execute(text("UPDATE users SET role='ADMIN' WHERE id=:id"), {'id': principal_id})
    await c.db.commit()
    url = make_url(URL)
    params = dict(host=url.host, port=url.port, dbname=url.database, user=url.username, password=url.password)
    with psycopg.connect(**params) as db:
        before = fingerprints(db, names=['users', 'audit_logs'])
        overlay = admin_overlay.capture(db)
        assert [row['id'] for row in overlay['principals']] == [str(principal_id)]
        applied = admin_overlay.apply(db, overlay, database_name=url.database)
        assert fingerprints(db, names=['users', 'audit_logs'], admin_overlay=applied) == before
        db.execute("UPDATE users SET name='Mudança externa detectável' WHERE id=%s", (c.admin.id,))
        assert fingerprints(db, names=['users', 'audit_logs'], admin_overlay=applied) != before
        with pytest.raises(RuntimeError):
            admin_overlay.apply(db, {'principals': [{'id': str(uuid4()), 'login': 'missing@test.local'}]}, database_name=url.database)


@pytest.mark.asyncio
@pytest.mark.parametrize('source_has_settings', [False, True])
async def test_refresh_preserves_hml_parameters_when_production_has_the_same_schema(context, source_has_settings):
    import importlib.util
    from pathlib import Path
    import psycopg
    from psycopg.types.json import Jsonb
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location('tested_hml_refresh_config', root / 'scripts/homologation/refresh_data.py')
    refresh = importlib.util.module_from_spec(spec); spec.loader.exec_module(refresh)
    c = context; url = make_url(URL)
    source_values = deepcopy(DEFAULT_SETTINGS)
    source_values['identity']['systemName'] = 'Frota origem fictícia'
    hml_values = deepcopy(DEFAULT_SETTINGS)
    hml_values['identity']['systemName'] = 'Frota homologação fictícia'
    overlay = {'principals': [{'id': str(c.superuser.id), 'login': 'jonatas@sousa'}],
        'settings': {'revision': 5, 'values': hml_values, 'updated_by': str(c.superuser.id), 'updated_at': datetime.now(timezone.utc)}}
    with psycopg.connect(host=url.host, port=url.port, dbname=url.database, user=url.username, password=url.password) as db:
        if source_has_settings:
            db.execute('INSERT INTO system_settings(id,revision,"values") VALUES(1,2,%s)', (Jsonb(source_values),))
        before = refresh.fingerprints(db, names=['system_settings'])
        applied = refresh.overlay_service.apply(db, overlay, database_name=url.database)
        assert db.execute('SELECT "values" FROM system_settings WHERE id=1').fetchone()[0] == hml_values
        assert refresh.fingerprints(db, names=['system_settings'], admin_overlay=applied) == before
        db.execute('INSERT INTO system_settings(id,revision,"values") VALUES(2,1,%s)', (Jsonb(source_values),))
        assert refresh.fingerprints(db, names=['system_settings'], admin_overlay=applied) != before
