"""Validate local boundaries before starting the API or applying migrations."""
import json
import os
from pathlib import Path
import sys

from dotenv import load_dotenv
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes'), 'Unexpected test root'
load_dotenv(ROOT / 'backend' / '.env', override=True)
sys.path.insert(0, str(ROOT / 'backend'))
os.chdir(ROOT / 'backend')
from app.core.config import settings  # noqa: E402

url = make_url(settings.DATABASE_URL)
assert (url.host, url.port, url.database, url.username) == ('127.0.0.1', 5441, 'frota_emprestimos_testes', 'loan_test_app')
assert settings.APP_ENV == 'homologation'
assert settings.COOKIE_NAME == 'loan_test_access_token' and settings.CSRF_COOKIE_NAME == 'loan_test_csrf_token'
for path in (settings.STORAGE_DIR, settings.DIGITAL_DOCUMENT_ARTIFACTS_DIR, settings.SIGNATURE_PREPARED_STATE_DIR):
    assert path and path.resolve().is_relative_to(ROOT), 'Storage must be inside the test copy'
assert not settings.CERTIFICATE_SIGNING_ENABLED and not settings.SIGNATURE_AGENT_ENABLED
assert not settings.SIGNATURE_ALLOW_NETWORK_FETCHING
assert set(settings.CORS_ORIGINS) == {'http://localhost:6969', 'http://127.0.0.1:6969', 'https://testefrota.sirel.com.br'}
assert set(settings.CSRF_TRUSTED_ORIGINS) == set(settings.CORS_ORIGINS)
assert set(settings.TRUSTED_HOSTS) == {'localhost', '127.0.0.1', 'test', 'testserver', 'testefrota.sirel.com.br'}


def check_cluster():
    import psycopg
    credentials = json.loads((ROOT / 'storage/loan-tests/database.json').read_text())
    assert credentials['host'] == '127.0.0.1' and credentials['port'] == 5441
    with psycopg.connect(**credentials, dbname='postgres') as connection:
        directory = Path(connection.execute('SHOW data_directory').fetchone()[0]).resolve()
        assert directory == (ROOT / 'storage/loan-tests/cluster').resolve()
    return credentials


if __name__ == '__main__':
    command = sys.argv[1] if len(sys.argv) > 1 else 'validate'
    if command == 'validate':
        print('Test environment configuration validated.')
    elif command == 'run':
        check_cluster()
        import uvicorn
        uvicorn.run('app.main:app', host='127.0.0.1', port=6969, access_log=False)
    elif command == 'migrate':
        credentials = check_cluster()
        from alembic import command as alembic_command
        from alembic.config import Config
        # DDL credentials are loaded only into this maintenance process.
        settings.DATABASE_URL = url.set(username=credentials['user'], password=credentials['password']).render_as_string(hide_password=False)
        alembic_command.upgrade(Config(str(ROOT / 'backend/alembic.ini')), 'head')
    else:
        raise SystemExit('Use validate, run or migrate')
