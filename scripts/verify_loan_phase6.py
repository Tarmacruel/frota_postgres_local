"""Verify phase 6 on the isolated deployment; no regularization is persisted."""
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import runpy
import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
previous = runpy.run_path(str(ROOT / 'scripts/verify_loan_phase4.py'))
report = previous['report']
assert report['migration'] == '0047_loan_regularization'
login = json.loads((ROOT / 'storage/loan-tests/test-login.json').read_text())
credentials = json.loads((ROOT / 'storage/loan-tests/database.json').read_text())
with psycopg.connect(**credentials, dbname='frota_emprestimos_testes') as connection:
    connection.execute('SET TRANSACTION READ ONLY')
    before = connection.execute('SELECT count(*) FROM vehicle_loans WHERE regularized_at IS NOT NULL').fetchone()[0]
report['phase6'] = {}
for base in ('http://localhost:6969', 'https://testefrota.sirel.com.br'):
    with httpx.Client(base_url=base, timeout=30) as client:
        assert client.post('/api/auth/login', json=login, headers={'Origin': base}).status_code == 200
        response = client.get('/api/vehicle-loans/regularization/catalog')
        assert response.status_code == 200
        catalog = response.json()
        vehicle = next(row for row in catalog['vehicles'] if row['owner_organization_id'] and any(
            item['organization_id'] == row['owner_organization_id'] for item in catalog['allocations']))
        origin = next(item for item in catalog['allocations'] if item['organization_id'] == vehicle['owner_organization_id'])
        destination = next(item for item in catalog['allocations'] if item['organization_id'] != origin['organization_id'])
        now = datetime.now(timezone.utc)
        body = {'vehicle_id': vehicle['id'], 'origin_allocation_id': origin['id'], 'destination_allocation_id': destination['id'],
                'started_at': (now - timedelta(days=3650)).isoformat(), 'returned_at': (now - timedelta(days=3649)).isoformat(),
                'return_allocation_id': origin['id'], 'delivery_odometer_km': 0, 'return_odometer_km': 0,
                'delivery_condition': 'Consulta de validação sem gravação', 'return_condition': 'Consulta de validação sem gravação',
                'reason': 'Verificação técnica de prévia sem gravação', 'justification': 'Verificação técnica de prévia sem gravação',
                'document_reference': 'VERIFICAÇÃO TÉCNICA - NÃO CONFIRMAR'}
        csrf_response = client.get('/api/auth/csrf')
        assert csrf_response.status_code == 200
        csrf = csrf_response.json()['csrf_token']
        response = client.post('/api/vehicle-loans/regularization/preview', json=body,
            headers={'Origin': base, 'X-CSRF-Token': csrf})
        assert response.status_code == 200, response.status_code
        assert len(response.json()['preview_token']) == 64
        report['phase6'][base] = {'catalog': 200, 'preview': 200, 'confirmation_sent': False}
with psycopg.connect(**credentials, dbname='frota_emprestimos_testes') as connection:
    connection.execute('SET TRANSACTION READ ONLY')
    after = connection.execute('SELECT count(*) FROM vehicle_loans WHERE regularized_at IS NOT NULL').fetchone()[0]
report['phase6']['regularizations_before'] = before
report['phase6']['regularizations_after'] = after
assert before == after
(ROOT / 'storage/loan-tests/phase6-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('Phase 6 catalog and preview verified locally and through tunnel; no confirmation submitted.')
