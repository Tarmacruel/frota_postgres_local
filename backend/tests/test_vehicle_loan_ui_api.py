"""Presentation endpoints run against disposable PostgreSQL, with real permissions."""
import os
import psycopg
import pytest
from test_vehicle_loan_api import api, workflow_database
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.security import create_access_token

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Isolated cluster required')]


async def test_session_exposes_organization_for_production_receipt(api):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://localhost:8000',
            cookies={'access_token': create_access_token(api.actors['recipient'], 'PRODUCAO')}) as client:
        response = await client.get('/api/auth/me')
    assert response.status_code == 200, response.text
    session = response.json()
    assert session['organization_id'] == api.ids['recipient']
    assert session['role'] == 'PRODUCAO'
    assert session['permissions']['vehicle_loans']['can_edit']
    pending = (await api.action(await api.draft(), 'submit', 'origin', 'origin')).json()
    accepted = await api.action(pending, 'accept', 'recipient', 'recipient')
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()['status'] == 'ACTIVE'


async def test_pending_summary_persists_until_resolution_and_scopes_receiving_side(api):
    async def count(actor):
        response = await api.request(actor, 'GET', '/pending-summary')
        assert response.status_code == 200, response.text
        return response.json()
    pending = (await api.action(await api.draft(), 'submit', 'origin', 'origin')).json()
    assert (await count('recipient')) == {'total': 1, 'receipts': 1, 'returns': 0}
    assert (await count('origin'))['total'] == 0
    assert (await count('outsider'))['total'] == 0
    assert (await count('admin'))['total'] == 0
    await api.request('recipient', 'GET', '/' + pending['id'])
    await api.request('recipient', 'GET', '/' + pending['id'] + '/events')
    assert (await count('recipient'))['total'] == 1
    active = (await api.action(pending, 'accept', 'recipient', 'recipient')).json()
    assert (await count('recipient'))['total'] == 0
    returning = (await api.action(active, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '100', 'return_condition': 'Sem avarias'})).json()
    assert (await count('origin')) == {'total': 1, 'receipts': 0, 'returns': 1}
    assert (await count('recipient'))['total'] == 0
    result = await api.action(returning, 'accept-return', 'origin', 'origin')
    assert result.status_code == 200, result.text
    assert (await count('origin'))['total'] == 0
    for actor in ('standard', 'station'):
        assert (await api.request(actor, 'GET', '/pending-summary')).status_code == 403


@pytest.mark.parametrize('action,actor,side', [('reject', 'recipient', 'recipient'), ('cancel', 'origin', 'origin')])
async def test_rejected_or_cancelled_requests_clear_notification(api, action, actor, side):
    pending = (await api.action(await api.draft(), 'submit', 'origin', 'origin')).json()
    assert (await api.request('recipient', 'GET', '/pending-summary')).json()['total'] == 1
    resolved = await api.action(pending, action, actor, side, {'justification': 'Solicitação resolvida durante teste'})
    assert resolved.status_code == 200, resolved.text
    assert (await api.request('recipient', 'GET', '/pending-summary')).json()['total'] == 0


async def test_catalog_only_offers_owned_available_vehicles(api):
    catalog = (await api.request('origin', 'GET', '/catalog')).json()
    assert [row['id'] for row in catalog['vehicles']] == [api.ids['vehicle']]
    assert catalog['vehicles'][0]['owner_organization_id'] == api.ids['origin']
    assert api.ids['recipient_allocation'] in [row['id'] for row in catalog['allocations']]
    assert (await api.request('recipient', 'GET', '/catalog')).json()['vehicles'] == []
    assert (await api.request('outsider', 'GET', '/catalog')).json()['vehicles'] == []
    for actor in ('standard', 'station'):
        assert (await api.request(actor, 'GET', '/catalog')).status_code == 403
    await api.active()
    assert (await api.request('origin', 'GET', '/catalog')).json()['vehicles'] == []
    assert (await api.request('recipient', 'GET', '/catalog')).json()['vehicles'] == []


async def test_archive_names_search_direction_and_event_actor(api):
    active = await api.active()
    assert active['vehicle_plate']
    assert active['origin_organization_name'].startswith('origin')
    assert active['recipient_organization_name'].startswith('recipient')
    assert active['destination_allocation_name']
    plate = active['vehicle_plate']
    result = await api.request('origin', 'GET', '?search=' + plate + '&direction=sent')
    assert result.status_code == 200, result.text
    assert result.json()['pagination']['total'] == 1
    assert (await api.request('origin', 'GET', '?direction=received')).json()['data'] == []
    assert (await api.request('outsider', 'GET', '?search=' + plate)).json()['data'] == []
    assert (await api.request('origin', 'GET', '?search=%25')).json()['data'] == []
    pending = (await api.action(active, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '100', 'return_condition': 'Sem avarias'})).json()
    response = await api.action(pending, 'accept-return', 'origin', 'origin')
    assert response.status_code == 200, response.text
    archive = await api.request('recipient', 'GET', '?status=RETURNED&search=' + plate)
    assert archive.json()['data'][0]['vehicle_plate'] == plate
    events = (await api.request('recipient', 'GET', f"/{active['id']}/events")).json()
    assert events[-1]['actor_name'] == 'origin'
    assert (await api.request('outsider', 'GET', f"/{active['id']}/events")).status_code == 404


async def test_catalog_does_not_depend_on_master_data_or_vehicle_module(api):
    with psycopg.connect(**api.db) as connection:
        for module in ('vehicles', 'master_data'):
            connection.execute('INSERT INTO user_permissions(user_id,module,can_view,can_create,can_edit,can_delete) VALUES (%s,%s,false,false,false,false)', (api.actors['origin'], module))
    response = await api.request('origin', 'GET', '/catalog')
    assert response.status_code == 200, response.text
    assert response.json()['vehicles'][0]['id'] == api.ids['vehicle']
    with psycopg.connect(**api.db) as connection:
        connection.execute("INSERT INTO user_permissions(user_id,module,can_view,can_create,can_edit,can_delete) VALUES (%s,'vehicle_loans',false,false,false,false)", (api.actors['origin'],))
    assert (await api.request('origin', 'GET', '/catalog')).status_code == 403
