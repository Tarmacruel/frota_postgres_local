"""Read-only deployment check. Never creates or signs working-copy records."""
import json
from pathlib import Path
import runpy
import httpx

ROOT = Path(__file__).resolve().parents[1]
previous = runpy.run_path(str(ROOT / 'scripts/verify_loan_phase4.py'))
report = previous['report']
from app.core.config import settings
assert settings.CANONICAL_DOCUMENT_ARTIFACTS_ENABLED
assert not settings.CERTIFICATE_SIGNING_ENABLED and not settings.SIGNATURE_AGENT_ENABLED
assert report['migration'] == '0046_loan_terms'
report['phase5'] = {'canonical_pdfs': True, 'external_signing': False}
for base in ('http://localhost:6969', 'https://testefrota.sirel.com.br'):
    with httpx.Client(base_url=base, timeout=30) as client:
        login = json.loads((ROOT / 'storage/loan-tests/test-login.json').read_text())
        assert client.post('/api/auth/login', json=login, headers={'Origin': base}).status_code == 200
        response = client.get('/api/vehicle-loans')
        assert response.status_code == 200
        for loan in response.json()['data']:
            response = client.get(f"/api/vehicle-loans/{loan['id']}/documents")
            assert response.status_code == 200
        response = client.get('/api/document-signatures/pending')
        assert response.status_code == 200
        report['phase5'][base] = {'documents': 'ok', 'pending_signatures': response.status_code}
(ROOT / 'storage/loan-tests/phase5-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('Phase 5 migration, document reads and pending signatures verified locally and through tunnel.')
