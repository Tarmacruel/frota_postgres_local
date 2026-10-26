"""One-time HML release: verified production copy, staging migrations, API and frontend."""
import argparse
import importlib.util
import json
from pathlib import Path
import subprocess

ROOT = Path(r'D:\FROTAS\frota_emprestimos_testes')
CONTROL = Path(r'D:\FROTAS\02-HOMOLOGACAO\sincronizacao')
EVIDENCE = ROOT/'storage/backups/20261022-contract-balances'
spec = importlib.util.spec_from_file_location('refresh_release', CONTROL/'refresh_data.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
assert refresh.digest(CONTROL/'refresh_data.py') == refresh.digest(ROOT/'scripts/homologation/refresh_data.py')
cfg = refresh.config()
from dotenv import dotenv_values
assert refresh.flag(dotenv_values(ROOT/'backend/.env').get('CONTRACT_BALANCE_ENABLED')), 'HML feature must be explicitly enabled'
assert (EVIDENCE/'refresh-failure-test.json').is_file(), 'Staging failure test evidence is required'
parser = argparse.ArgumentParser()
parser.add_argument('--refresh-run-id', help='Finish frontend/health verification for an already completed, identified refresh')
args = parser.parse_args()
state = refresh.read(refresh.RUNTIME/'last-success.json') if args.refresh_run_id else refresh.refresh()
if args.refresh_run_id:
    assert state['run_id'] == args.refresh_run_id, 'Refresh identity differs from the completed run'
assert state['status'] == 'complete' and state['business_fingerprints_match']
assert state['source_schema'] == '0055_vehicle_tag_delete' and state['target_schema'] == '0057_funding_request_keys'
with refresh.target_connection(cfg) as db:
    assert db.execute('SELECT count(*) FROM contract_controls').fetchone()[0] == 0
    assert db.execute('SELECT count(*) FROM contract_movements').fetchone()[0] == 0
with (EVIDENCE/'publication.log').open('wb') as log:
    result = subprocess.run(['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', str(ROOT/'scripts/publish-homologation-frontend.ps1')], stdout=log, stderr=subprocess.STDOUT,
        timeout=150, creationflags=subprocess.CREATE_NO_WINDOW)
refresh.require(result.returncode == 0, 'HML frontend publication failed; inspect publication.log')
refresh.verify_ready(cfg)
refresh.assert_configs(cfg)
assert refresh.digest(ROOT/'frontend/dist/index.html') == refresh.digest(ROOT/'storage/hml-frontend-build/index.html')
refresh.save(EVIDENCE/'publication-verification.json', dict(status='complete', refresh_run_id=state['run_id'],
    source_schema=state['source_schema'], target_schema=state['target_schema'], legacy_data_preserved=True,
    no_automatic_openings=True, production_read_only=True))
print('HML release complete: staging upgraded and validated, API ready, frontend published, no automatic opening balances.')
