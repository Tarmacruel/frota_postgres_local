"""Exercise a real restore/migration failure before activation; preserve the live HML."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(r'D:\FROTAS\frota_emprestimos_testes')
CONTROL = Path(r'D:\FROTAS\02-HOMOLOGACAO\sincronizacao')
spec = importlib.util.spec_from_file_location('refresh_under_test', CONTROL/'refresh_data.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)
cfg = refresh.config()
with refresh.target_connection(cfg) as db:
    before = refresh.fingerprints(db)
refresh.verify_ready(cfg)
observed = {}


def failing_migration(config, stage, revision, folder):
    observed.update(refresh.migrate_stage(config, stage, revision, folder))
    raise RuntimeError('Controlled staging migration failure: activation must not occur')


try:
    refresh.refresh(migrate=failing_migration)
    raise AssertionError('Expected the controlled migration failure')
except RuntimeError as error:
    assert str(error).startswith('Controlled staging migration failure'), str(error)
with refresh.target_connection(cfg) as db:
    assert refresh.fingerprints(db) == before, 'Active HML data changed'
refresh.verify_ready(cfg)
state = refresh.read(refresh.RUNTIME/'last-attempt.json')
assert state['status'] == 'failed'
folder = refresh.BACKUPS/state['run_id']
assert not (folder/'api-stop.log').exists(), 'API was stopped before staging validation'
result = dict(status='passed', active_hml_unchanged=True, active_hml_ready=True,
    staging_migration=observed, failure_run_id=state['run_id'], production_read_only=True)
refresh.save(ROOT/'storage/backups/20261022-contract-balances/refresh-failure-test.json', result)
print(json.dumps(result))
