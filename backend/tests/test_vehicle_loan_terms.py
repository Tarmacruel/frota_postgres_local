"""Phase 5: real transactions and signatures in disposable databases only."""
import asyncio
import os
from pathlib import Path

import psycopg
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash
from app.services.vehicle_loan_pdf_service import VehicleLoanPdfService
from test_vehicle_loan_api import api, workflow_database

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Isolated cluster required')]
PASSWORD = 'Only-test-password-928!'


async def document_request(api, actor, method, path, body=None):
    import logging
    logging.getLogger('app.main').disabled = False
    token = create_access_token(api.actors[actor], 'ADMIN' if actor.startswith('admin') else 'PRODUCAO')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://localhost:8000',
        cookies={'access_token': token, 'csrf_token': 'loan-csrf'},
        headers={'Origin': 'http://localhost:8000', 'X-CSRF-Token': 'loan-csrf'}) as client:
        return await client.request(method, '/api/document-signatures' + path, json=body)


def enable_passwords(api):
    hashed = get_password_hash(PASSWORD)
    with psycopg.connect(**api.db) as connection:
        for actor in api.actors.values():
            from uuid import UUID
            digits = [int(char) for char in str(UUID(actor).int % 1000000000).zfill(9)]
            for size in (10, 11):
                remainder = sum(a * b for a, b in zip(digits, range(size, 1, -1))) % 11
                digits.append(0 if remainder < 2 else 11 - remainder)
            connection.execute('UPDATE users SET password_hash=%s,cpf=%s WHERE id=%s',
                               (hashed, ''.join(map(str, digits)), actor))


async def terms(api, loan, actor='origin'):
    response = await api.request(actor, 'GET', f"/{loan['id']}/documents")
    assert response.status_code == 200, response.text
    return response.json()


async def test_terms_follow_effective_accepts_and_frozen_delivery_survives_return(api):
    draft = await api.draft()
    assert await terms(api, draft) == []
    rejected = await document_request(api, 'origin', 'POST', '/documents',
        {'document_type': 'VEHICLE_LOAN_DELIVERY_TERM', 'source_id': draft['id']})
    assert rejected.status_code == 409
    submitted = (await api.action(draft, 'submit', 'origin', 'origin')).json()
    assert await terms(api, submitted) == []
    active = (await api.action(submitted, 'accept', 'recipient', 'recipient')).json()
    original = (await terms(api, active))[0]
    assert original['required_signatures'] == 2 and original['signed_count'] == 0
    assert len(original['requests']) == 2
    repeated = await document_request(api, 'origin', 'POST', '/documents',
        {'document_type': 'VEHICLE_LOAN_DELIVERY_TERM', 'source_id': active['id']})
    assert repeated.json()['document_id'] == original['document_id']
    pending = (await api.action(active, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '130', 'return_condition': 'Sem avarias'})).json()
    assert len(await terms(api, pending)) == 1
    returned = (await api.action(pending, 'accept-return', 'origin', 'origin')).json()
    documents = await terms(api, returned, 'recipient')
    assert len(documents) == 2
    assert documents[0]['snapshot'] == original['snapshot']
    assert documents[0]['content_hash'] == original['content_hash']
    assert documents[1]['snapshot']['loan']['return_odometer_km'] == 130.0
    with psycopg.connect(**api.db) as connection:
        connection.execute('UPDATE vehicles SET plate=%s WHERE id=%s', ('CHANGED', api.ids['vehicle']))
    assert (await terms(api, returned))[0]['snapshot'] == original['snapshot']
    assert (await api.action(pending, 'accept-return', 'origin', 'origin')).status_code == 409
    assert len(await terms(api, returned)) == 2


async def test_two_required_signatures_passwords_scope_and_duplicate_control(api):
    enable_passwords(api)
    active = await api.active()
    term = (await terms(api, active))[0]
    path = '/documents/' + term['document_id']
    assert (await document_request(api, 'outsider', 'GET', path)).status_code == 404
    assert (await document_request(api, 'standard', 'GET', path)).status_code == 403
    assert (await document_request(api, 'admin', 'POST', path + '/sign', {'current_password': PASSWORD})).status_code == 403
    assert (await document_request(api, 'origin', 'POST', path + '/sign', {'current_password': 'wrong-password'})).status_code == 401
    responses = await asyncio.gather(*(document_request(api, 'origin', 'POST', path + '/sign', {'current_password': PASSWORD}) for _ in range(2)))
    assert sorted(response.status_code for response in responses) == [200, 409]
    partial = (await document_request(api, 'origin', 'GET', path)).json()
    assert partial['status'] == 'PENDING' and partial['signed_count'] == 1
    completed = await document_request(api, 'recipient', 'POST', path + '/sign', {'current_password': PASSWORD})
    assert completed.status_code == 200, completed.text
    assert completed.json()['status'] == 'COMPLETED'
    assert completed.json()['required_signatures'] == 2
    pending = await document_request(api, 'recipient', 'GET', '/pending')
    assert pending.json() == []


async def test_required_signers_cannot_be_removed_or_replaced(api):
    active = await api.active()
    term = (await terms(api, active))[0]
    path = '/documents/' + term['document_id']
    assert (await document_request(api, 'admin', 'POST', path + '/requests', {'requested_signer_user_id': api.actors['admin2']})).status_code == 409
    for request in term['requests']:
        assert (await document_request(api, 'admin', 'DELETE', '/requests/' + request['id'])).status_code == 409
        actor = 'origin' if request['requested_signer_user_id'] == api.actors['origin'] else 'recipient'
        assert (await document_request(api, actor, 'POST', '/requests/' + request['id'] + '/decline')).status_code == 409
    pending = (await document_request(api, 'origin', 'GET', '/pending')).json()
    assert pending[0]['document']['source_id'] == active['id']


async def test_admin_signatures_record_the_represented_secretaria(api):
    enable_passwords(api)
    draft = (await api.request('admin', 'POST', body={**api.proposal(), 'justification': 'Representação administrativa'})).json()
    submitted = (await api.action(draft, 'submit', 'admin', 'origin', {'justification': 'Representação administrativa'})).json()
    active = (await api.action(submitted, 'accept', 'admin2', 'recipient', {'justification': 'Representação administrativa'})).json()
    term = (await terms(api, active, 'admin'))[0]
    for actor in ('admin', 'admin2'):
        response = await document_request(api, actor, 'POST', '/documents/' + term['document_id'] + '/sign', {'current_password': PASSWORD})
        assert response.status_code == 200, response.text
    assert response.json()['is_complete']
    with psycopg.connect(**api.db) as connection:
        organizations = connection.execute('SELECT signer_organization_id FROM document_signatures WHERE document_id=%s', (term['document_id'],)).fetchall()
        assert {str(row[0]) for row in organizations} == {api.ids['origin'], api.ids['recipient']}


async def test_pdf_artifacts_and_immutable_database_evidence(api, monkeypatch, tmp_path):
    monkeypatch.setattr(settings, 'CANONICAL_DOCUMENT_ARTIFACTS_ENABLED', True)
    monkeypatch.setattr(settings, 'DIGITAL_DOCUMENT_ARTIFACTS_DIR', tmp_path)
    active = await api.active()
    term = (await terms(api, active))[0]
    assert term['canonical_artifact_available']
    original = list(tmp_path.rglob('*.pdf'))
    assert len(original) == 1 and original[0].read_bytes().startswith(b'%PDF')
    content = VehicleLoanPdfService.build(term['snapshot'], content_hash=term['content_hash'])
    assert content == original[0].read_bytes()
    for actor, expected in (('origin', 200), ('recipient', 200), ('outsider', 404), ('station', 403)):
        response = await api.request(actor, 'GET', f"/{active['id']}/documents/{term['document_id']}/pdf")
        assert response.status_code == expected
        if expected == 200:
            assert response.content.startswith(b'%PDF') and 'no-store' in response.headers['cache-control']
    with psycopg.connect(**api.db) as connection:
        for query in ("UPDATE digital_documents SET snapshot='{}' WHERE id=%s", 'DELETE FROM digital_documents WHERE id=%s',
                      'UPDATE digital_documents SET required_signatures=1 WHERE id=%s'):
            with pytest.raises(psycopg.errors.RaiseException), connection.transaction():
                connection.execute(query, (term['document_id'],))
    # QA copies contain only synthetic data from this disposable database.
    output = Path(__file__).resolve().parents[2] / 'storage/loan-tests/pdf-qa'
    output.mkdir(exist_ok=True)
    (output / 'delivery.pdf').write_bytes(content)
    enable_passwords(api)
    await document_request(api, 'origin', 'POST', '/documents/' + term['document_id'] + '/sign', {'current_password': PASSWORD})
    await document_request(api, 'recipient', 'POST', '/documents/' + term['document_id'] + '/sign', {'current_password': PASSWORD})
    evidence = await api.request('recipient', 'GET', f"/{active['id']}/documents/{term['document_id']}/pdf")
    assert evidence.status_code == 200
    (output / 'delivery-signed.pdf').write_bytes(evidence.content)
    assert original[0].read_bytes() == content
    pending = (await api.action(active, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '150',
        'return_condition': 'Devolvido sem avarias. Verificação dos pneus, equipamentos e documentação concluída.'})).json()
    returned = (await api.action(pending, 'accept-return', 'origin', 'origin')).json()
    final = (await terms(api, returned))[-1]
    assert final['document_type'] == 'VEHICLE_LOAN_RETURN_TERM'
    evidence = await api.request('origin', 'GET', f"/{active['id']}/documents/{final['document_id']}/pdf")
    (output / 'return.pdf').write_bytes(evidence.content)
    long_snapshot = {**final['snapshot'], 'loan': {**final['snapshot']['loan'], 'return_condition': 'Inspeção detalhada: condições conferidas e registradas. ' * 170}}
    (output / 'return-long.pdf').write_bytes(VehicleLoanPdfService.build(long_snapshot, content_hash=final['content_hash']))


async def test_document_failure_rolls_back_the_handoff(api, monkeypatch):
    from app.services.document_artifact_service import DocumentArtifactService
    monkeypatch.setattr(settings, 'CANONICAL_DOCUMENT_ARTIFACTS_ENABLED', True)
    async def fail(*args, **kwargs):
        from fastapi import HTTPException
        raise HTTPException(503, 'PDF unavailable')
    monkeypatch.setattr(DocumentArtifactService, 'ensure_canonical_artifact', fail)
    draft = await api.draft()
    pending = (await api.action(draft, 'submit', 'origin', 'origin')).json()
    response = await api.action(pending, 'accept', 'recipient', 'recipient')
    assert response.status_code == 503
    assert api.current_allocation() == api.ids['origin_allocation']
    assert await terms(api, pending) == []
    current = (await api.request('origin', 'GET', '/' + pending['id'])).json()
    assert current['version'] == pending['version'] and current['status'] == 'AWAITING_RECEIPT'
