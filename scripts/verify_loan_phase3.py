"""Read-only smoke checks for the isolated copy and its public tunnel."""
import json
from pathlib import Path
import runpy

import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
runpy.run_path(str(ROOT / 'scripts/loan_test_runtime.py'))
login = json.loads((ROOT / 'storage/loan-tests/test-login.json').read_text())
credentials = json.loads((ROOT / 'storage/loan-tests/database.json').read_text())
assert credentials['host'] == '127.0.0.1' and credentials['port'] == 5441
report = {}
with psycopg.connect(**credentials, dbname='frota_emprestimos_testes') as connection:
    connection.execute('SET TRANSACTION READ ONLY')
    assert Path(connection.execute('SHOW data_directory').fetchone()[0]).resolve() == (ROOT / 'storage/loan-tests/cluster').resolve()
    report['migration'] = connection.execute('SELECT version_num FROM alembic_version').fetchone()[0]
    report['working_copy_loans'] = connection.execute('SELECT count(*) FROM vehicle_loans').fetchone()[0]
    report['vehicles'] = connection.execute('SELECT count(*) FROM vehicles').fetchone()[0]

for base in ('http://localhost:6969', 'https://testefrota.sirel.com.br'):
    statuses = {}
    with httpx.Client(base_url=base, timeout=30) as client:
        response = client.post('/api/auth/login', json=login, headers={'Origin': base})
        assert response.status_code == 200, ('login', response.status_code)
        assert 'loan_test_access_token' in client.cookies
        for path in ('/api/health/ready', '/api/auth/me', '/api/vehicles/paginated?limit=2',
                     '/api/possession/paginated?limit=2', '/api/maintenance/paginated?limit=2',
                     '/api/fuel-supplies?limit=2', '/api/fuel-supply-orders?limit=2',
                     '/api/claims?limit=2', '/api/fines?limit=2', '/api/vehicle-loans',
                     '/api/analytics/costs/trend?months=3'):
            response = client.get(path)
            statuses[path] = response.status_code
            assert response.status_code == 200, (base, path, response.status_code)
            if path.startswith('/api/vehicles/'):
                assert all('owner_organization_id' in row and 'can_operate_vehicle' in row for row in response.json()['data'])
    report[base] = statuses
report['production_health'] = httpx.get('https://frota.sirel.com.br/api/health/ready', timeout=20).status_code
assert report['production_health'] == 200
(ROOT / 'storage/loan-tests/phase3-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
