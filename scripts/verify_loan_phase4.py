"""Read-only checks for the phase 4 UI and catalog on the isolated environment."""
import json
from pathlib import Path
import runpy

import httpx

ROOT = Path(__file__).resolve().parents[1]
previous = runpy.run_path(str(ROOT / 'scripts/verify_loan_phase3.py'))
report = previous['report']
for base in ('http://localhost:6969', 'https://testefrota.sirel.com.br'):
    with httpx.Client(base_url=base, timeout=30) as client:
        assert client.post('/api/auth/login', json=previous['login'], headers={'Origin': base}).status_code == 200
        for path in ('/emprestimos', '/api/vehicle-loans/catalog', '/api/vehicle-loans?search=ZZZ&status=RETURNED'):
            response = client.get(path)
            assert response.status_code == 200, (base, path, response.status_code)
            report[base][path] = response.status_code
            if path.endswith('/catalog'):
                assert {'vehicles', 'organizations', 'allocations'} <= response.json().keys()
                assert all(row['owner_organization_id'] for row in response.json()['vehicles'])
(ROOT / 'storage/loan-tests/phase4-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('Phase 4 UI, scoped catalog and filtered list: HTTP 200 locally and through tunnel.')
