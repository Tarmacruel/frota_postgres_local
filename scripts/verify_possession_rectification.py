"""Read-only verification of the deployed unified possession correction screen."""
import json
from pathlib import Path
import runpy
import httpx
import psycopg

ROOT = Path(__file__).resolve().parents[1]
previous = runpy.run_path(str(ROOT / 'scripts/verify_loan_phase3.py'))
report = previous['report']
assert report['migration'] == '0048_possession_rectification'
credentials = previous['credentials']

def fingerprint():
    with psycopg.connect(**credentials, dbname='frota_emprestimos_testes') as connection:
        connection.execute('SET TRANSACTION READ ONLY')
        return connection.execute('''SELECT
            (SELECT md5(string_agg(row_to_json(p)::text, ',' ORDER BY p.id)) FROM vehicle_possession p),
            (SELECT count(*) FROM possession_revisions),
            (SELECT count(*) FROM vehicle_possession_return_confirmation)''').fetchone()

before = fingerprint()
report['rectification'] = {}
for base in ('http://localhost:6969', 'https://testefrota.sirel.com.br'):
    with httpx.Client(base_url=base, timeout=30) as client:
        assert client.post('/api/auth/login', json=previous['login'], headers={'Origin': base}).status_code == 200
        response = client.get('/api/possession', params={'active': 'false'})
        assert response.status_code == 200
        rows = response.json()
        assert rows, 'A closed possession is needed for the read-only check'
        response = client.get(f"/api/possession/{rows[0]['id']}/rectification-context")
        assert response.status_code == 200, (base, response.status_code)
        context = response.json()
        assert context['possession']['revision'] >= 1
        assert context['possession']['end_date']
        assert context['return_context']['declaration']['text']
        assert isinstance(context['revisions'], list)
        assert client.get('/posses').status_code == 200
        report['rectification'][base] = {'context': 200, 'screen': 200, 'mutation_submitted': False}
after = fingerprint()
assert before == after, 'Possession records changed during read-only checks; investigate concurrent usage'
report['rectification']['working_records_unchanged'] = True
(ROOT / 'storage/loan-tests/unified-rectification-smoke.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print('Unified rectification verified locally and through tunnel; working records unchanged.')
