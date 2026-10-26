"""Run the financial locking suite in a disposable database on the verified HML cluster."""
import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys
from uuid import uuid4

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes')
spec = importlib.util.spec_from_file_location('hml_runtime', ROOT/'scripts/loan_test_runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)
credentials = runtime.check_cluster()
name = 'frota_contract_tests_'+uuid4().hex[:8]
assert re.fullmatch(r'frota_contract_tests_[0-9a-f]{8}', name)
url = runtime.url.set(database=name, username=credentials['user'], password=credentials['password'])
environment = os.environ.copy()
environment['CONTRACT_TEST_DATABASE_URL'] = url.render_as_string(hide_password=False)
environment['CONTRACT_BALANCE_ENABLED'] = 'false'
with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as admin:
    admin.execute(sql.SQL('CREATE DATABASE {} OWNER {} TEMPLATE template0').format(sql.Identifier(name), sql.Identifier(credentials['user'])))
try:
    result = subprocess.run([sys.executable, '-m', 'pytest', 'tests/test_contract_balances_postgres.py', '-q', '--tb=short'],
        cwd=ROOT/'backend', env=environment, text=True, capture_output=True)
    evidence = ROOT/'storage/backups/20261022-contract-balances'
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence/'backend-postgres.log').write_text(result.stdout+result.stderr, encoding='utf-8')
    print(result.stdout[-12000:])
finally:
    with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as admin:
        admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))
raise SystemExit(result.returncode)
