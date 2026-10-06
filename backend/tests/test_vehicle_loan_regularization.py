"""Retroactive registration is tested only on disposable PostgreSQL databases."""
import asyncio
from datetime import datetime, timedelta, timezone
import os
from pathlib import Path
import psycopg
import pytest
from test_vehicle_loan_api import api, workflow_database

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Isolated cluster required')]


def proposal(api, *, ended=True):
    now = datetime.now(timezone.utc)
    return {'vehicle_id': api.ids['vehicle'], 'origin_allocation_id': api.ids['origin_allocation'],
            'destination_allocation_id': api.ids['recipient_allocation'],
            'started_at': (now - timedelta(days=10)).isoformat(),
            'returned_at': (now - timedelta(days=5)).isoformat() if ended else None,
            'return_allocation_id': api.ids['origin_allocation'] if ended else None,
            'delivery_odometer_km': '0', 'return_odometer_km': '50' if ended else None,
            'delivery_condition': 'Conforme registro original', 'return_condition': 'Sem avarias' if ended else None,
            'reason': 'Atendimento das atividades da secretaria',
            'justification': 'Registro anterior ao fluxo eletrônico de empréstimos',
            'document_reference': 'Processo administrativo TESTE 001/2026'}


async def preview(api, body, actor='admin'):
    response = await api.request(actor, 'POST', '/regularization/preview', body)
    assert response.status_code == 200, response.text
    return response.json()


async def create(api, body, inspection=None, actor='admin'):
    inspection = inspection or await preview(api, body, actor)
    return await api.request(actor, 'POST', '/regularization', {**body, 'preview_token': inspection['preview_token']})


async def test_closed_registration_preserves_locations_operational_links_and_dates(api):
    body = proposal(api)
    with psycopg.connect(**api.db) as conn:
        pid = conn.execute("INSERT INTO vehicle_possession(vehicle_id,driver_name,start_date,end_date,start_odometer_km,end_odometer_km,responsible_organization_id) VALUES (%s,'Histórico',%s,%s,10,40,%s) RETURNING id",
            (api.ids['vehicle'], datetime.fromisoformat(body['started_at']) + timedelta(days=1), datetime.fromisoformat(body['returned_at']) - timedelta(days=1), api.ids['origin'])).fetchone()[0]
        before = conn.execute('SELECT id,allocation_id,start_date,end_date FROM location_history WHERE vehicle_id=%s', (api.ids['vehicle'],)).fetchall()
    check = await preview(api, body)
    assert check['can_confirm'] and not check['location_change']
    possession = next(item for item in check['impact'] if item['module'] == 'Posses')
    assert possession['records'] == 1 and possession['other_responsibility'] == 1
    response = await create(api, body, check)
    assert response.status_code == 201, response.text
    loan = response.json()
    assert loan['status'] == 'RETURNED' and loan['regularized_at']
    assert loan['origin_representative_id'] is None and loan['recipient_representative_id'] is None
    assert datetime.fromisoformat(loan['created_at'].replace('Z', '+00:00')) > datetime.fromisoformat(body['returned_at'])
    assert (await api.request('origin', 'GET', f"/{loan['id']}/documents")).json() == []
    events = (await api.request('recipient', 'GET', f"/{loan['id']}/events")).json()
    assert [item['event_type'] for item in events] == ['REGULARIZED']
    assert events[0]['details']['operational_records_reassigned'] is False
    with psycopg.connect(**api.db) as conn:
        assert conn.execute('SELECT id,allocation_id,start_date,end_date FROM location_history WHERE vehicle_id=%s', (api.ids['vehicle'],)).fetchall() == before
        row = conn.execute('SELECT responsible_organization_id,vehicle_loan_id FROM vehicle_possession WHERE id=%s', (pid,)).fetchone()
        assert str(row[0]) == api.ids['origin'] and row[1] is None
    assert (await api.request('outsider', 'GET', '/' + loan['id'])).status_code == 404


async def test_ongoing_registration_moves_only_current_location_and_returns_normally(api):
    body = proposal(api, ended=False)
    check = await preview(api, body)
    assert check['can_confirm'] and check['location_change']
    response = await create(api, body, check)
    assert response.status_code == 201, response.text
    loan = response.json()
    assert loan['status'] == 'ACTIVE' and api.current_allocation() == api.ids['recipient_allocation']
    with psycopg.connect(**api.db) as conn:
        location_start = conn.execute('SELECT start_date FROM location_history WHERE vehicle_id=%s AND end_date IS NULL', (api.ids['vehicle'],)).fetchone()[0]
        assert location_start > datetime.fromisoformat(body['started_at']) + timedelta(days=9)
    pending = await api.action(loan, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '80', 'return_condition': 'Sem avarias'})
    returned = await api.action(pending.json(), 'accept-return', 'origin', 'origin')
    assert returned.status_code == 200, returned.text
    docs = (await api.request('origin', 'GET', f"/{loan['id']}/documents")).json()
    assert len(docs) == 1 and docs[0]['document_type'] == 'VEHICLE_LOAN_RETURN_TERM'
    assert docs[0]['snapshot']['loan']['regularized_at']
    from app.services.vehicle_loan_pdf_service import VehicleLoanPdfService
    content = VehicleLoanPdfService.build(docs[0]['snapshot'], content_hash=docs[0]['content_hash'])
    assert content.startswith(b'%PDF')
    # Visual QA uses only synthetic data from this disposable database.
    output = Path(__file__).resolve().parents[2] / 'storage/loan-tests/pdf-qa'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'return-regularized.pdf').write_bytes(content)


async def test_admin_permissions_and_preview_token_bind_identity_and_data(api):
    body = proposal(api)
    for actor in ('origin', 'recipient', 'outsider', 'standard', 'station'):
        assert (await api.request(actor, 'GET', '/regularization/catalog')).status_code == 403
        assert (await api.request(actor, 'POST', '/regularization/preview', body)).status_code == 403
        assert (await api.request(actor, 'POST', '/regularization', {**body, 'preview_token': '0' * 64})).status_code == 403
    check = await preview(api, body)
    assert (await create(api, body, check, 'admin2')).status_code == 409
    assert (await create(api, {**body, 'reason': 'Outra justificativa de empréstimo'}, check)).status_code == 409
    assert (await create(api, body, {'preview_token': '0' * 64})).status_code == 409


async def test_preview_detects_changed_records_and_double_submission(api):
    body = proposal(api)
    check = await preview(api, body)
    with psycopg.connect(**api.db) as conn:
        conn.execute("INSERT INTO maintenance_records(vehicle_id,start_date,service_description,total_cost,created_by) VALUES (%s,%s,'Inspeção',10,%s)",
            (api.ids['vehicle'], body['started_at'], api.actors['origin']))
    assert (await create(api, body, check)).status_code == 409
    check = await preview(api, body)
    responses = await asyncio.gather(create(api, body, check), create(api, body, check))
    assert sorted(item.status_code for item in responses) == [201, 409]


async def test_overlaps_block_but_adjacent_history_is_allowed(api):
    body = proposal(api)
    first = await create(api, body)
    assert first.status_code == 201, first.text
    assert not (await preview(api, body))['can_confirm']
    second = {**body, 'started_at': body['returned_at'],
              'returned_at': (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
              'delivery_odometer_km': '50', 'return_odometer_km': '80'}
    response = await create(api, second)
    assert response.status_code == 201, response.text
    with psycopg.connect(**api.db) as conn:
        with pytest.raises(psycopg.errors.CheckViolation), conn.transaction():
            conn.execute('UPDATE vehicle_loans SET started_at=%s WHERE id=%s', (body['started_at'], response.json()['id']))


async def test_origin_correction_is_explicit_and_audited(api):
    body = proposal(api, ended=False)
    with psycopg.connect(**api.db) as conn:
        conn.execute('UPDATE vehicles SET owner_organization_id=%s WHERE id=%s', (api.ids['recipient'], api.ids['vehicle']))
        conn.execute('UPDATE location_history SET allocation_id=%s WHERE vehicle_id=%s', (api.ids['recipient_allocation'], api.ids['vehicle']))
    check = await preview(api, body)
    assert check['owner_change'] and not check['can_confirm']
    body['correct_owner'] = True
    check = await preview(api, body)
    assert check['can_confirm'] and not check['location_change']
    response = await create(api, body, check)
    assert response.status_code == 201, response.text
    events = (await api.request('admin', 'GET', f"/{response.json()['id']}/events")).json()
    assert events[0]['details']['before']['owner_organization_id'] == api.ids['recipient']
    with psycopg.connect(**api.db) as conn:
        assert str(conn.execute('SELECT owner_organization_id FROM vehicles WHERE id=%s', (api.ids['vehicle'],)).fetchone()[0]) == api.ids['origin']


async def test_crossing_possessions_open_operations_and_odometer_review(api):
    body = proposal(api)
    with psycopg.connect(**api.db) as conn:
        pid = conn.execute("INSERT INTO vehicle_possession(vehicle_id,driver_name,start_date,start_odometer_km) VALUES (%s,'Teste',%s,100) RETURNING id",
            (api.ids['vehicle'], datetime.fromisoformat(body['started_at']) - timedelta(days=1))).fetchone()[0]
    check = await preview(api, body)
    assert not check['can_confirm'] and any('atravessa' in value for value in check['blockers'])
    ongoing = await preview(api, proposal(api, ended=False))
    assert not ongoing['can_confirm'] and ongoing['open_operations']['open_possessions'] == 1
    with psycopg.connect(**api.db) as conn:
        conn.execute('UPDATE vehicle_possession SET end_date=%s,end_odometer_km=120 WHERE id=%s',
            (datetime.fromisoformat(body['started_at']) - timedelta(hours=1), pid))
    check = await preview(api, body)
    assert not check['can_confirm'] and any('Odômetro de entrega inferior' in value for value in check['blockers'])


async def test_future_dates_missing_timezone_and_incomplete_returns(api):
    body = proposal(api)
    future = {**body, 'returned_at': (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()}
    assert not (await preview(api, future))['can_confirm']
    for updates in ({'started_at': '2026-01-01T08:00:00'}, {'return_odometer_km': None}, {'returned_at': body['started_at']}, {'document_reference': 'x'}):
        response = await api.request('admin', 'POST', '/regularization/preview', {**body, **updates})
        assert response.status_code == 422


async def test_historical_registration_does_not_disturb_current_active_loan(api):
    current = await api.active()
    body = proposal(api)
    response = await create(api, body)
    assert response.status_code == 201, response.text
    assert api.current_allocation() == api.ids['recipient_allocation']
    active = (await api.request('admin', 'GET', '/' + current['id'])).json()
    assert active['version'] == current['version'] and active['status'] == 'ACTIVE'
    original_documents = (await api.request('admin', 'GET', f"/{current['id']}/documents")).json()
    assert len(original_documents) == 1


async def test_unknown_origin_requires_explicit_correction_and_pending_loan_blocks_open_registration(api):
    body = proposal(api)
    with psycopg.connect(**api.db) as conn:
        conn.execute('UPDATE vehicles SET owner_organization_id=NULL WHERE id=%s', (api.ids['vehicle'],))
    assert not (await preview(api, body))['can_confirm']
    assert (await create(api, {**body, 'correct_owner': True})).status_code == 201
    draft = await api.draft()
    sent = await api.action(draft, 'submit', 'origin', 'origin')
    assert sent.status_code == 200, sent.text
    ongoing = proposal(api, ended=False)
    ongoing['started_at'] = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    check = await preview(api, ongoing)
    assert not check['can_confirm'] and any('proposta enviada' in value for value in check['blockers'])
