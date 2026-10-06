"""Real PostgreSQL/HTTP workflow tests, never using the restored working database."""
import asyncio
import json
import os
from pathlib import Path
from uuid import UUID, uuid4

from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
import psycopg
from psycopg import sql
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy import text

from app.core.config import settings
from app.core.security import create_access_token
from app.db.session import get_db_session
from app.main import app
from app.core.vehicle_handoff import lock_vehicle_handoff, ensure_order_handoff_scope, prevent_loan_location_bypass
from fastapi import HTTPException

pytestmark = pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Requires isolated loan cluster')
ROOT = Path(__file__).resolve().parents[2]
PREFIX = '/api/vehicle-loans'


@pytest.fixture(scope='module')
def workflow_database():
    assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes')
    credentials = json.loads((ROOT / 'storage/loan-tests/database.json').read_text())
    assert credentials['host'] == '127.0.0.1' and credentials['port'] == 5441
    database = 'loan_workflow_' + uuid4().hex[:12]
    with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as admin:
        assert Path(admin.execute('SHOW data_directory').fetchone()[0]).resolve() == (ROOT / 'storage/loan-tests/cluster').resolve()
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
    previous = settings.DATABASE_URL
    try:
        settings.DATABASE_URL = f"postgresql+psycopg://{credentials['user']}:{credentials['password']}@127.0.0.1:5441/{database}"
        command.upgrade(Config(str(ROOT / 'backend/alembic.ini')), 'head')
        settings.DATABASE_URL = previous
        yield {**credentials, 'dbname': database}
    finally:
        settings.DATABASE_URL = previous
        with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as admin:
            assert database.startswith('loan_workflow_')
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(database)))


@pytest_asyncio.fixture
async def api(workflow_database):
    db = workflow_database
    suffix = uuid4().hex[:10]
    with psycopg.connect(**db) as connection:
        ids = {}
        for side in ('origin', 'recipient', 'outsider'):
            org = connection.execute('INSERT INTO master_organizations(name) VALUES (%s) RETURNING id', (side + suffix,)).fetchone()[0]
            department = connection.execute("INSERT INTO master_departments(organization_id,name) VALUES (%s,'Departamento') RETURNING id", (org,)).fetchone()[0]
            allocation = connection.execute("INSERT INTO master_allocations(department_id,name) VALUES (%s,'Garagem') RETURNING id", (department,)).fetchone()[0]
            ids[side] = str(org)
            ids[side + '_allocation'] = str(allocation)
        actors = {}
        for role_name, role, org in [('origin', 'PRODUCAO', ids['origin']), ('recipient', 'PRODUCAO', ids['recipient']),
                                     ('outsider', 'PRODUCAO', ids['outsider']), ('admin', 'ADMIN', None), ('admin2', 'ADMIN', None),
                                     ('standard', 'PADRAO', ids['origin']), ('station', 'POSTO', ids['origin'])]:
            uid = connection.execute("INSERT INTO users(name,email,password_hash,role,organization_id,cpf,must_change_password) VALUES (%s,%s,'unused',%s,%s,%s,false) RETURNING id",
                (role_name, f'{role_name}-{suffix}@example.test', role, org, str(uuid4().int % 100000000000).zfill(11))).fetchone()[0]
            actors[role_name] = str(uid)
        vehicle = connection.execute("INSERT INTO vehicles(plate,brand,model,owner_organization_id) VALUES (%s,'Teste','Teste',%s) RETURNING id", (suffix, ids['origin'])).fetchone()[0]
        ids['vehicle'] = str(vehicle)
        connection.execute("INSERT INTO location_history(vehicle_id,allocation_id,department,start_date) VALUES (%s,%s,'Origem',NOW()-INTERVAL '1 day')", (vehicle, ids['origin_allocation']))
    engine = create_async_engine(f"postgresql+asyncpg://{db['user']}:{db['password']}@127.0.0.1:5441/{db['dbname']}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)

    async def dependency():
        async with sessions() as session:
            yield session
    previous = app.dependency_overrides.get(get_db_session)
    app.dependency_overrides[get_db_session] = dependency

    class API:
        def __init__(self):
            self.ids, self.actors, self.db, self.sessions = ids, actors, db, sessions

        async def request(self, actor, method, path='', body=None):
            token = create_access_token(actors[actor], 'ADMIN' if actor.startswith('admin') else 'PRODUCAO')
            async with AsyncClient(transport=ASGITransport(app=app), base_url='http://localhost:8000',
                cookies={'access_token': token, 'csrf_token': 'loan-csrf'},
                headers={'Origin': 'http://localhost:8000', 'X-CSRF-Token': 'loan-csrf'}) as client:
                return await client.request(method, PREFIX + path, json=body)

        def proposal(self):
            return {'vehicle_id': ids['vehicle'], 'acting_organization_id': ids['origin'],
                    'destination_allocation_id': ids['recipient_allocation'], 'reason': 'Uso temporário de teste',
                    'delivery_odometer_km': '100.0', 'delivery_condition': 'Sem ressalvas'}

        async def draft(self):
            response = await self.request('origin', 'POST', body=self.proposal())
            assert response.status_code == 201, response.text
            return response.json()

        async def action(self, loan, operation, actor, side, extra=None):
            return await self.request(actor, 'POST', f"/{loan['id']}/{operation}",
                {'expected_version': loan['version'], 'acting_organization_id': ids[side], **(extra or {})})

        async def active(self):
            draft = await self.draft()
            submitted = await self.action(draft, 'submit', 'origin', 'origin')
            assert submitted.status_code == 200, submitted.text
            accepted = await self.action(submitted.json(), 'accept', 'recipient', 'recipient')
            assert accepted.status_code == 200, accepted.text
            return accepted.json()

        def current_allocation(self):
            with psycopg.connect(**db) as connection:
                return str(connection.execute('SELECT allocation_id FROM location_history WHERE vehicle_id=%s AND end_date IS NULL', (ids['vehicle'],)).fetchone()[0])

    try:
        yield API()
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db_session, None)
        else:
            app.dependency_overrides[get_db_session] = previous
        await engine.dispose()


@pytest.mark.asyncio
async def test_delivery_and_return_are_atomic_and_audited(api):
    draft = await api.draft()
    submitted = (await api.action(draft, 'submit', 'origin', 'origin')).json()
    assert api.current_allocation() == api.ids['origin_allocation']
    response = await api.action(submitted, 'accept', 'recipient', 'recipient')
    assert response.status_code == 200, response.text
    active = response.json()
    assert active['status'] == 'ACTIVE' and active['started_at']
    assert active['expected_return_at'] is None
    assert api.current_allocation() == api.ids['recipient_allocation']
    response = await api.action(active, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '120', 'return_condition': 'Sem avarias'})
    assert response.status_code == 200, response.text
    pending = response.json()
    assert api.current_allocation() == api.ids['recipient_allocation']
    response = await api.action(pending, 'accept-return', 'origin', 'origin')
    assert response.status_code == 200, response.text
    assert response.json()['status'] == 'RETURNED' and response.json()['returned_at']
    assert api.current_allocation() == api.ids['origin_allocation']
    events = (await api.request('origin', 'GET', f"/{draft['id']}/events")).json()
    assert [event['event_type'] for event in events] == ['CREATED', 'SUBMITTED', 'RECEIPT_ACCEPTED', 'RETURN_SUBMITTED', 'RETURN_ACCEPTED']
    with psycopg.connect(**api.db) as connection:
        assert str(connection.execute('SELECT owner_organization_id FROM vehicles WHERE id=%s', (api.ids['vehicle'],)).fetchone()[0]) == api.ids['origin']
        assert connection.execute("SELECT count(*) FROM audit_logs WHERE entity_type='VEHICLE_LOAN' AND entity_id=%s", (draft['id'],)).fetchone()[0] == 5
    assert (await api.action(pending, 'accept-return', 'origin', 'origin')).status_code == 409


@pytest.mark.asyncio
async def test_read_metadata_uses_registered_type_without_vehicle_catalog_access(api):
    with psycopg.connect(**api.db) as connection:
        connection.execute("UPDATE vehicles SET vehicle_type='MOTOCICLETA' WHERE id=%s", (api.ids['vehicle'],))
    draft = await api.draft()
    assert draft['vehicle_type'] == 'MOTOCICLETA'
    response = await api.request('origin', 'GET', f"/{draft['id']}")
    assert response.status_code == 200 and response.json()['vehicle_type'] == 'MOTOCICLETA'
    listing = await api.request('origin', 'GET')
    assert listing.status_code == 200
    assert next(row for row in listing.json()['data'] if row['id'] == draft['id'])['vehicle_type'] == 'MOTOCICLETA'
    assert (await api.request('outsider', 'GET', f"/{draft['id']}")).status_code == 404


@pytest.mark.asyncio
async def test_scopes_permissions_and_admin_dual_control(api):
    for actor in ('standard', 'station'):
        assert (await api.request(actor, 'GET')).status_code == 403
    assert (await api.request('outsider', 'POST', body=api.proposal())).status_code == 403
    assert (await api.request('admin', 'POST', body=api.proposal())).status_code == 422
    proposal = {**api.proposal(), 'justification': 'Representação administrativa de teste'}
    draft = (await api.request('admin', 'POST', body=proposal)).json()
    assert (await api.request('outsider', 'GET', f"/{draft['id']}")).status_code == 404
    listing = (await api.request('outsider', 'GET', '?vehicle_id=' + api.ids['vehicle'])).json()
    assert listing['pagination']['total'] == 0
    submitted = (await api.action(draft, 'submit', 'admin', 'origin', {'justification': proposal['justification']})).json()
    response = await api.action(submitted, 'accept', 'admin', 'recipient', {'justification': proposal['justification']})
    assert response.status_code == 409
    assert response.json()['detail']['code'] == 'LOAN_DISTINCT_ACCEPTOR_REQUIRED'
    response = await api.action(submitted, 'accept', 'admin2', 'recipient', {'justification': proposal['justification']})
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_edit_invalidates_old_acceptance_and_rejections_need_reasons(api):
    draft = await api.draft()
    submitted = (await api.action(draft, 'submit', 'origin', 'origin')).json()
    proposal = api.proposal()
    proposal.pop('vehicle_id')
    response = await api.request('origin', 'PUT', f"/{draft['id']}", {**proposal, 'expected_version': submitted['version'], 'reason': 'Motivo atualizado para revisão'})
    assert response.status_code == 200, response.text
    updated = response.json()
    assert updated['status'] == 'DRAFT'
    assert (await api.action(submitted, 'accept', 'recipient', 'recipient')).status_code == 409
    submitted = (await api.action(updated, 'submit', 'origin', 'origin')).json()
    assert (await api.action(submitted, 'reject', 'recipient', 'recipient')).status_code == 422
    rejected = await api.action(submitted, 'reject', 'recipient', 'recipient', {'justification': 'Veículo indisponível para recebimento'})
    assert rejected.status_code == 200
    assert rejected.json()['status'] == 'REJECTED'
    new_draft = await api.draft()
    cancelled = await api.action(new_draft, 'cancel', 'origin', 'origin', {'justification': 'Solicitação não será mais necessária'})
    assert cancelled.status_code == 200 and cancelled.json()['status'] == 'CANCELLED'


@pytest.mark.asyncio
@pytest.mark.parametrize('blocker', ['possession', 'order', 'trip'])
async def test_rechecks_operations_created_after_submission(api, blocker):
    draft = await api.draft()
    submitted = (await api.action(draft, 'submit', 'origin', 'origin')).json()
    with psycopg.connect(**api.db) as connection:
        if blocker == 'order':
            connection.execute("INSERT INTO fuel_supply_orders(vehicle_id,organization_id,validation_code,created_by_user_id) VALUES (%s,%s,%s,%s)",
                (api.ids['vehicle'], api.ids['origin'], uuid4().hex[:24], api.actors['origin']))
        else:
            possession = connection.execute("INSERT INTO vehicle_possession(vehicle_id,driver_name,start_date,end_date) VALUES (%s,'Condutor teste',NOW()-INTERVAL '1 hour',%s) RETURNING id",
                (api.ids['vehicle'], None if blocker == 'possession' else '2026-01-01T00:00:00Z')).fetchone()[0]
            if blocker == 'trip':
                connection.execute("INSERT INTO vehicle_possession_trip(possession_id,sequence_number,status,origin,purpose,departure_at,start_odometer_km,created_by_user_id) VALUES (%s,1,'EM_ANDAMENTO','Garagem','Teste',NOW(),100,%s)", (possession, api.actors['origin']))
    response = await api.action(submitted, 'accept', 'recipient', 'recipient')
    assert response.status_code == 409, response.text
    assert response.json()['detail']['code'] == 'LOAN_PENDING_OPERATIONS'
    assert api.current_allocation() == api.ids['origin_allocation']
    current = (await api.request('origin', 'GET', f"/{draft['id']}")).json()
    assert current['version'] == submitted['version']


@pytest.mark.asyncio
async def test_rejected_return_keeps_recipient_and_rechecks_odometer(api):
    active = await api.active()
    body = {'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '110', 'return_condition': 'Sem ressalvas'}
    assert (await api.action(active, 'request-return', 'recipient', 'recipient', {**body, 'return_odometer_km': '90'})).status_code == 409
    pending = (await api.action(active, 'request-return', 'recipient', 'recipient', body)).json()
    rejected = await api.action(pending, 'reject-return', 'origin', 'origin', {'justification': 'Necessário revisar a vistoria da devolução'})
    assert rejected.status_code == 200 and rejected.json()['status'] == 'ACTIVE'
    assert api.current_allocation() == api.ids['recipient_allocation']
    pending = (await api.action(rejected.json(), 'request-return', 'recipient', 'recipient', body)).json()
    with psycopg.connect(**api.db) as connection:
        connection.execute("INSERT INTO vehicle_possession(vehicle_id,driver_name,start_date,end_date,start_odometer_km,end_odometer_km) VALUES (%s,'Teste',NOW(),NOW(),100,150)", (api.ids['vehicle'],))
    response = await api.action(pending, 'accept-return', 'origin', 'origin')
    assert response.status_code == 409
    assert response.json()['detail']['minimum_odometer_km'] == '150.0'
    assert api.current_allocation() == api.ids['recipient_allocation']


@pytest.mark.asyncio
async def test_concurrent_acceptance_only_moves_vehicle_once(api):
    submitted = (await api.action(await api.draft(), 'submit', 'origin', 'origin')).json()
    results = await asyncio.gather(*(api.action(submitted, 'accept', 'recipient', 'recipient') for _ in range(2)))
    assert sorted(response.status_code for response in results) == [200, 409]
    with psycopg.connect(**api.db) as connection:
        assert connection.execute('SELECT count(*) FROM location_history WHERE vehicle_id=%s', (api.ids['vehicle'],)).fetchone()[0] == 2
        assert connection.execute("SELECT count(*) FROM vehicle_loan_events WHERE loan_id=%s AND event_type='RECEIPT_ACCEPTED'", (submitted['id'],)).fetchone()[0] == 1


@pytest.mark.asyncio
async def test_two_proposals_cannot_both_be_submitted(api):
    first, second = await api.draft(), await api.draft()
    results = await asyncio.gather(api.action(first, 'submit', 'origin', 'origin'), api.action(second, 'submit', 'origin', 'origin'))
    assert sorted(response.status_code for response in results) == [200, 409]


@pytest.mark.asyncio
async def test_invalid_lotation_and_no_backdated_input(api):
    proposal = api.proposal()
    assert (await api.request('origin', 'POST', body={**proposal, 'destination_allocation_id': api.ids['origin_allocation']})).status_code == 422
    assert (await api.request('origin', 'POST', body={**proposal, 'started_at': '2026-01-01T00:00:00Z'})).status_code == 422
    assert (await api.request('origin', 'POST', body={**proposal, 'expected_return_at': '2026-01-01T00:00:00'})).status_code == 422


@pytest.mark.asyncio
async def test_return_cancelled_by_recipient_and_distinct_return_acceptor(api):
    active = await api.active()
    body = {'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '120', 'return_condition': 'Sem ressalvas', 'justification': 'Representação administrativa de teste'}
    pending = (await api.action(active, 'request-return', 'admin', 'recipient', body)).json()
    same_user = await api.action(pending, 'accept-return', 'admin', 'origin', {'justification': body['justification']})
    assert same_user.status_code == 409 and same_user.json()['detail']['code'] == 'LOAN_DISTINCT_ACCEPTOR_REQUIRED'
    cancelled = await api.action(pending, 'cancel-return', 'recipient', 'recipient', {'justification': 'A secretaria ainda precisa utilizar o veículo'})
    assert cancelled.status_code == 200 and cancelled.json()['status'] == 'ACTIVE'
    assert api.current_allocation() == api.ids['recipient_allocation']
    assert (await api.action(pending, 'accept-return', 'origin', 'origin')).status_code == 409


@pytest.mark.asyncio
async def test_open_order_also_blocks_return_acceptance(api):
    active = await api.active()
    pending = (await api.action(active, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '110', 'return_condition': 'Sem ressalvas'})).json()
    with psycopg.connect(**api.db) as connection:
        order = connection.execute("INSERT INTO fuel_supply_orders(vehicle_id,organization_id,validation_code,created_by_user_id) VALUES (%s,%s,%s,%s) RETURNING id",
            (api.ids['vehicle'], api.ids['recipient'], uuid4().hex[:24], api.actors['recipient'])).fetchone()[0]
    response = await api.action(pending, 'accept-return', 'origin', 'origin')
    assert response.status_code == 409 and response.json()['detail']['blockers']['open_fuel_orders'] == 1
    with psycopg.connect(**api.db) as connection:
        connection.execute("UPDATE fuel_supply_orders SET status='CANCELLED' WHERE id=%s", (order,))
    assert (await api.action(pending, 'accept-return', 'origin', 'origin')).status_code == 200


@pytest.mark.asyncio
async def test_handoff_waits_for_order_transaction_and_then_rechecks(api):
    submitted = (await api.action(await api.draft(), 'submit', 'origin', 'origin')).json()
    async with api.sessions() as session:
        await lock_vehicle_handoff(session, api.ids['vehicle'])
        task = asyncio.create_task(api.action(submitted, 'accept', 'recipient', 'recipient'))
        try:
            await asyncio.sleep(0.1)
            assert not task.done(), 'Acceptance must wait for the vehicle lock'
            await session.execute(text("INSERT INTO fuel_supply_orders(vehicle_id,organization_id,validation_code,created_by_user_id) VALUES (:vehicle,:org,:code,:actor)"),
                {'vehicle': api.ids['vehicle'], 'org': api.ids['origin'], 'code': uuid4().hex[:24], 'actor': api.actors['origin']})
            await session.commit()
            response = await asyncio.wait_for(task, 5)
            assert response.status_code == 409
            assert response.json()['detail']['code'] == 'LOAN_PENDING_OPERATIONS'
        finally:
            await session.rollback()
            if not task.done():
                task.cancel()
                await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_after_handoff_old_orders_and_direct_location_changes_are_rejected(api):
    await api.active()
    async with api.sessions() as session:
        await lock_vehicle_handoff(session, api.ids['vehicle'])
        with pytest.raises(HTTPException) as error:
            await ensure_order_handoff_scope(session, UUID(api.ids['vehicle']), UUID(api.ids['origin']))
        assert error.value.detail['code'] == 'LOAN_ORDER_ORGANIZATION_CHANGED'
        await ensure_order_handoff_scope(session, UUID(api.ids['vehicle']), UUID(api.ids['recipient']))
        with pytest.raises(HTTPException) as error:
            await prevent_loan_location_bypass(session, api.ids['vehicle'])
        assert error.value.detail['code'] == 'LOAN_LOCATION_LOCKED'


@pytest.mark.asyncio
async def test_explicit_permission_denial_and_role_ceiling(api):
    with psycopg.connect(**api.db) as connection:
        for actor, allowed in [('origin', False), ('station', True)]:
            connection.execute("INSERT INTO user_permissions(user_id,module,can_view,can_create,can_edit,can_delete) VALUES (%s,'vehicle_loans',%s,%s,%s,%s)",
                (api.actors[actor], allowed, allowed, allowed, allowed))
    assert (await api.request('origin', 'GET')).status_code == 403
    assert (await api.request('origin', 'POST', body=api.proposal())).status_code == 403
    assert (await api.request('station', 'GET')).status_code == 403


@pytest.mark.asyncio
async def test_wrong_party_cannot_accept_or_request_return(api):
    submitted = (await api.action(await api.draft(), 'submit', 'origin', 'origin')).json()
    assert (await api.action(submitted, 'accept', 'origin', 'recipient')).status_code == 403
    active = (await api.action(submitted, 'accept', 'recipient', 'recipient')).json()
    assert (await api.action(active, 'cancel', 'origin', 'origin', {'justification': 'Tentativa de cancelar empréstimo ativo'})).status_code == 409
    assert (await api.action(active, 'request-return', 'origin', 'recipient', {'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '110', 'return_condition': 'Sem ressalvas'})).status_code == 403


@pytest.mark.asyncio
async def test_new_vehicle_inherits_origin_and_can_be_loaned(api):
    from app.models.user import User
    from app.schemas.vehicle import VehicleCreate
    from app.services.vehicle_service import VehicleService

    async with api.sessions() as session:
        user = await session.get(User, UUID(api.actors['origin']))
        vehicle = await VehicleService(session).create(VehicleCreate(
            plate=uuid4().hex[:8].upper(), brand='Teste', model='Teste', vehicle_type='SEDAN',
            allocation_id=UUID(api.ids['origin_allocation'])), user)
        new_id = str(vehicle['id'])
    with psycopg.connect(**api.db) as connection:
        owner = connection.execute('SELECT owner_organization_id FROM vehicles WHERE id=%s', (new_id,)).fetchone()[0]
        assert str(owner) == api.ids['origin']
    response = await api.request('origin', 'POST', body={**api.proposal(), 'vehicle_id': new_id})
    assert response.status_code == 201, response.text
