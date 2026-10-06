"""Unified corrections exercised on disposable PostgreSQL, never on working records."""
import asyncio
from datetime import datetime, timedelta, timezone
import os
import psycopg
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.security import create_access_token
from test_vehicle_loan_api import api, workflow_database

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Isolated cluster required')]


async def request(api, method, path, data=None, actor='origin', json=None, files=None):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://localhost:8000',
            cookies={'access_token': create_access_token(api.actors[actor], 'PRODUCAO'), 'csrf_token': 'test'},
            headers={'Origin': 'http://localhost:8000', 'X-CSRF-Token': 'test'}) as client:
        return await client.request(method, '/api/possession/' + path, data=data, json=json, files=files)


def seed(api):
    start = datetime.now(timezone.utc) - timedelta(hours=12)
    with psycopg.connect(**api.db) as db:
        row = db.execute("INSERT INTO vehicle_possession(vehicle_id,driver_name,start_date,start_odometer_km,responsible_organization_id) VALUES (%s,'Condutor anterior',%s,100,%s) RETURNING id", (api.ids['vehicle'], start, api.ids['origin'])).fetchone()
    return str(row[0]), start


async def closed(api):
    pid, start = seed(api)
    result = await request(api, 'PUT', pid + '/end', json={'end_date': (start + timedelta(hours=2)).isoformat(),
        'end_odometer_km': 120, 'vehicle_condition_notes': 'Sem avarias', 'declaration_accepted': True})
    assert result.status_code == 200, result.text
    return pid, start


async def form(api, pid):
    result = await request(api, 'GET', pid + '/rectification-context')
    assert result.status_code == 200, result.text
    ctx = result.json()
    record = ctx['possession']
    body = {key: str(record[key]) for key in ('driver_name', 'start_date', 'end_date', 'start_odometer_km', 'end_odometer_km') if record[key] is not None}
    body.update(expected_revision=str(record['revision']), edit_reason='Correção integral após conferência',
        vehicle_condition_notes='Condições corrigidas', declaration_accepted='true')
    return body, ctx


async def test_joint_correction_with_later_possession_preserves_versions_and_documents(api):
    pid, start = await closed(api)
    with psycopg.connect(**api.db) as db:
        next_id = db.execute("INSERT INTO vehicle_possession(vehicle_id,driver_name,start_date,start_odometer_km,responsible_organization_id) VALUES (%s,'Próximo condutor',%s,150,%s) RETURNING id",
            (api.ids['vehicle'], start + timedelta(hours=3), api.ids['origin'])).fetchone()[0]
        old_confirmation = db.execute('SELECT id,canonical_payload_hash,final_odometer_km FROM vehicle_possession_return_confirmation WHERE possession_id=%s', (pid,)).fetchone()
    body, ctx = await form(api, pid)
    body.update(driver_name='Nome corrigido', start_date=(start + timedelta(minutes=5)).isoformat(),
        end_date=(start + timedelta(hours=3)).isoformat(), start_odometer_km='105', end_odometer_km='145')
    result = await request(api, 'PUT', pid, data=body)
    assert result.status_code == 200, result.text
    assert result.json()['revision'] == ctx['possession']['revision'] + 1
    assert result.json()['return_confirmation_version'] == 2
    _, current = await form(api, pid)
    assert current['return_context']['current_confirmation']['version'] == 2
    revision = current['revisions'][0]
    assert revision['before']['driver_name'] == 'Condutor anterior'
    assert revision['after']['driver_name'] == 'Nome corrigido'
    assert revision['before']['end_odometer_km'] == 120
    assert revision['after']['end_odometer_km'] == 145
    assert 'document_path' not in revision['before']
    with psycopg.connect(**api.db) as db:
        previous = db.execute('SELECT canonical_payload_hash,final_odometer_km,is_current FROM vehicle_possession_return_confirmation WHERE id=%s', (old_confirmation[0],)).fetchone()
        assert previous == (old_confirmation[1], old_confirmation[2], False)
        assert db.execute('SELECT driver_name,start_odometer_km,end_date FROM vehicle_possession WHERE id=%s', (next_id,)).fetchone() == ('Próximo condutor', 150, None)
        with pytest.raises(psycopg.errors.RaiseException), db.transaction():
            db.execute("UPDATE possession_revisions SET reason='alteração indevida' WHERE possession_id=%s", (pid,))


async def test_conflicts_and_invalid_return_roll_back_entire_revision(api):
    pid, start = await closed(api)
    with psycopg.connect(**api.db) as db:
        db.execute("INSERT INTO vehicle_possession(vehicle_id,driver_name,start_date,responsible_organization_id) VALUES (%s,'Seguinte',%s,%s)",
            (api.ids['vehicle'], start + timedelta(hours=3), api.ids['origin']))
    body, _ = await form(api, pid)
    result = await request(api, 'PUT', pid, data={**body, 'driver_name': 'Não deve gravar', 'end_date': (start + timedelta(hours=4)).isoformat()})
    assert result.status_code == 409, result.text
    result = await request(api, 'PUT', pid, data={**body, 'start_odometer_km': '200'})
    assert result.status_code == 422
    result = await request(api, 'PUT', pid, data={**body, 'declaration_accepted': 'false'})
    assert result.status_code == 422
    result = await request(api, 'PUT', pid, data={key: value for key, value in body.items() if key != 'end_date'})
    assert result.status_code == 409
    _, current = await form(api, pid)
    assert current['revisions'] == []
    assert current['possession']['driver_name'] == 'Condutor anterior'
    assert current['return_context']['current_confirmation']['version'] == 1


async def test_concurrent_correction_requires_reload_and_scope_is_enforced(api):
    pid, _ = await closed(api)
    body, _ = await form(api, pid)
    responses = await asyncio.gather(request(api, 'PUT', pid, data=body), request(api, 'PUT', pid, data=body))
    assert sorted(result.status_code for result in responses) == [200, 409]
    conflict = next(result for result in responses if result.status_code == 409)
    assert conflict.json()['detail']['code'] == 'POSSESSION_REVISION_CONFLICT'
    assert (await request(api, 'GET', pid + '/rectification-context', actor='outsider')).status_code == 404
    for actor in ('standard', 'station'):
        assert (await request(api, 'GET', pid + '/rectification-context', actor=actor)).status_code == 403


async def test_active_and_legacy_corrections(api):
    pid, start = seed(api)
    body, _ = await form(api, pid)
    result = await request(api, 'PUT', pid, data={**body, 'observation': 'Observação corrigida'})
    assert result.status_code == 200, result.text
    assert not result.json()['return_confirmation_available']
    with psycopg.connect(**api.db) as db:
        db.execute('UPDATE vehicle_possession SET end_date=%s,end_odometer_km=120 WHERE id=%s', (start + timedelta(hours=2), pid))
    body, _ = await form(api, pid)
    result = await request(api, 'PUT', pid, data=body)
    assert result.status_code == 200, result.text
    _, current = await form(api, pid)
    assert current['return_context']['current_confirmation']['version'] == 1
    assert len(current['revisions']) == 2


async def test_failure_after_staging_confirmation_rolls_back_all_changes(api, monkeypatch):
    pid, _ = await closed(api)
    body, _ = await form(api, pid)
    from app.services.document_signature_service import DocumentSignatureService
    from fastapi import HTTPException
    async def fail(*args, **kwargs):
        raise HTTPException(503, 'Falha temporária de verificação dos documentos')
    monkeypatch.setattr(DocumentSignatureService, 'mark_source_documents_superseded', fail)
    result = await request(api, 'PUT', pid, data={**body, 'driver_name': 'Não pode persistir'})
    assert result.status_code == 503
    with psycopg.connect(**api.db) as db:
        assert db.execute('SELECT driver_name FROM vehicle_possession WHERE id=%s', (pid,)).fetchone()[0] == 'Condutor anterior'
        assert db.execute('SELECT count(*) FROM possession_revisions WHERE possession_id=%s', (pid,)).fetchone()[0] == 0
        assert db.execute('SELECT version,is_current FROM vehicle_possession_return_confirmation WHERE possession_id=%s', (pid,)).fetchall() == [(1, True)]


async def test_retained_trips_must_fit_corrected_dates_and_odometers(api):
    pid, start = seed(api)
    created = await request(api, 'POST', pid + '/trips', json={'departure_at': (start + timedelta(minutes=10)).isoformat(),
        'start_odometer_km': 100, 'origin': 'Garagem', 'purpose': 'Serviço de teste',
        'destinations': [{'description': 'Centro'}]})
    assert created.status_code == 201, created.text
    body, _ = await form(api, pid)
    result = await request(api, 'PUT', pid, data={**body, 'start_date': (start + timedelta(minutes=20)).isoformat()})
    assert result.status_code == 409, result.text
    result = await request(api, 'PUT', pid, data={**body, 'start_odometer_km': '101'})
    assert result.status_code == 409, result.text


async def test_replacing_attachment_preserves_original_and_revision_reference(api, monkeypatch, tmp_path):
    from app.core.config import settings
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    pid, _ = seed(api)
    original = tmp_path / 'possession_documents' / f'{pid}.pdf'
    original.parent.mkdir()
    original.write_bytes(b'%PDF-1.4 original evidence')
    with psycopg.connect(**api.db) as db:
        db.execute('UPDATE vehicle_possession SET document_path=%s,document_name=%s WHERE id=%s',
            (original.relative_to(tmp_path).as_posix(), 'original.pdf', pid))
    body, _ = await form(api, pid)
    result = await request(api, 'PUT', pid, data=body,
        files={'loan_term_document': ('corrected.pdf', b'%PDF-1.4 corrected evidence', 'application/pdf')})
    assert result.status_code == 200, result.text
    assert original.read_bytes() == b'%PDF-1.4 original evidence'
    with psycopg.connect(**api.db) as db:
        before, after = db.execute('SELECT before,after FROM possession_revisions WHERE possession_id=%s', (pid,)).fetchone()
        assert before['document_path'] == original.relative_to(tmp_path).as_posix()
        assert before['document_path'] != after['document_path']
        assert (tmp_path / after['document_path']).read_bytes() == b'%PDF-1.4 corrected evidence'
