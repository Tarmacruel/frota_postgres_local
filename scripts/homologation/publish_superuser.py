"""Guarded HML-only release, with a database/source/frontend rollback package.

Production is inspected only for unchanged Git/config/process fingerprints.
No production database connection is opened by this script.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
from uuid import uuid4

import psycopg
from psycopg import sql

ROOT = Path(r'D:\FROTAS\frota_emprestimos_testes')
PROD = Path(r'D:\FROTAS\frota_certificado_homologacao')
CONTROL = Path(r'D:\FROTAS\02-HOMOLOGACAO\sincronizacao')
FOLDER = ROOT / 'storage/backups/20261029-superuser-settings/release'
CANDIDATE = FOLDER.parent / 'frontend-candidate'
PG = Path(r'C:\Program Files\PostgreSQL\16\bin')
BASE = 'dde414d'
DATABASE = 'frota_emprestimos_testes'


def require(ok, message):
    if not ok: raise RuntimeError(message)


def save(name, value):
    path = FOLDER / name
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.next')
    temporary.write_text(json.dumps(value, indent=2, default=str), encoding='utf-8')
    temporary.replace(path)


def read(name): return json.loads((FOLDER / name).read_text(encoding='utf-8'))
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args, log, *, env=None, cwd=ROOT):
    with (FOLDER / log).open('wb') as output:
        result = subprocess.run([str(arg) for arg in args], cwd=cwd, env=env, stdout=output,
            stderr=subprocess.STDOUT, timeout=300, creationflags=subprocess.CREATE_NO_WINDOW)
    require(result.returncode == 0, f'{log}: inspect the private release log.')


def runtime():
    require(ROOT.resolve() == ROOT and FOLDER.resolve().is_relative_to(ROOT), 'Unexpected HML workspace.')
    spec = importlib.util.spec_from_file_location('release_hml_runtime', ROOT / 'scripts/loan_test_runtime.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    credentials = module.check_cluster()
    require(module.url.database == DATABASE and module.url.port == 5441, 'Only HML may be released.')
    overlay_spec = importlib.util.spec_from_file_location('release_admin_overlay', ROOT / 'scripts/homologation/admin_overlay.py')
    overlay = importlib.util.module_from_spec(overlay_spec); overlay_spec.loader.exec_module(overlay)
    return module, credentials, overlay


def production_fingerprint():
    head = subprocess.check_output(['git', '-C', str(PROD), 'rev-parse', 'HEAD'], text=True).strip()
    status = subprocess.check_output(['git', '-C', str(PROD), 'status', '--porcelain'], text=True)
    return dict(head=head, status=status, env_sha256=sha(PROD / 'backend/.env'), frontend_sha256=sha(PROD / 'frontend/dist/index.html'))


def db_env(credentials):
    return {**os.environ, 'PGPASSWORD': credentials['password']}


def dump(credentials, name='database.dump'):
    run([PG / 'pg_dump.exe', '-h', '127.0.0.1', '-p', '5441', '-U', credentials['user'],
        '-d', DATABASE, '-Fc', '-f', FOLDER / name], 'backup.log', env=db_env(credentials))
    require((FOLDER / name).stat().st_size > 1000, 'HML backup is empty.')
    run([PG / 'pg_restore.exe', '-l', FOLDER / name], 'backup-contents.log')


def migrate(module, credentials, database):
    require(database == DATABASE or database.startswith('frota_contract_tests_'), 'Unexpected migration destination.')
    from alembic import command
    from alembic.config import Config
    previous = module.settings.DATABASE_URL
    try:
        module.settings.DATABASE_URL = module.url.set(database=database, username=credentials['user'], password=credentials['password']).render_as_string(hide_password=False)
        command.upgrade(Config(str(ROOT / 'backend/alembic.ini')), 'head')
    finally:
        module.settings.DATABASE_URL = previous


def prepare():
    module, credentials, overlay = runtime()
    require(not (FOLDER / 'state.json').exists(), 'A release package already exists. Review its state before preparing another one.')
    FOLDER.mkdir(parents=True, exist_ok=True)
    require((CANDIDATE / 'index.html').is_file(), 'Build the reviewed frontend candidate first.')
    save('production-before.json', production_fingerprint())
    shutil.copytree(ROOT / 'frontend/dist', FOLDER / 'frontend-before')
    shutil.copy2(CONTROL / 'refresh_data.py', FOLDER / 'refresh-before.py')
    run(['git', 'archive', BASE, '-o', FOLDER / 'source-before.tar', 'backend', 'frontend/src', 'scripts'], 'source-backup.log')
    with psycopg.connect(**credentials, dbname=DATABASE) as db:
        require(db.execute('SELECT version_num FROM alembic_version').fetchone()[0] == '0062_items_network_merge', 'Unexpected starting HML schema.')
        preserved = overlay.capture(db)
        require(len(preserved['principals']) == 1 and preserved['principals'][0]['login'] == 'jonatas@sousa', 'Only the authorized initial superuser may be promoted.')
    save('admin-overlay.json', preserved)
    dump(credentials)
    # Restore this HML snapshot into a disposable database and rehearse the DDL.
    rehearsal = 'frota_contract_tests_release_' + uuid4().hex[:12]
    with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as db:
        db.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(rehearsal)))
    try:
        run([PG / 'pg_restore.exe', '-h', '127.0.0.1', '-p', '5441', '-U', credentials['user'],
            '-d', rehearsal, '--no-owner', '--no-acl', FOLDER / 'database.dump'], 'restore-rehearsal.log', env=db_env(credentials))
        migrate(module, credentials, rehearsal)
        with psycopg.connect(**credentials, dbname=rehearsal) as db:
            applied = overlay.apply(db, preserved, database_name=rehearsal)
            overlay.validate(db, applied)
            require(db.execute('SELECT version_num FROM alembic_version').fetchone()[0] == '0063_superuser_settings', 'Rehearsal schema failed.')
            require(db.execute("SELECT count(*) FROM users WHERE role::text='SUPERUSER'").fetchone()[0] == 1, 'Rehearsal role count failed.')
    finally:
        with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as db:
            require(rehearsal.startswith('frota_contract_tests_release_'), 'Unexpected disposable database.')
            db.execute(sql.SQL('DROP DATABASE IF EXISTS {} WITH (FORCE)').format(sql.Identifier(rehearsal)))
    require(production_fingerprint() == read('production-before.json'), 'Production changed externally during preparation; reconcile before release.')
    save('state.json', dict(status='prepared', prepared_at=datetime.now().astimezone().isoformat(),
        backup_sha256=sha(FOLDER / 'database.dump'), candidate_sha256=sha(CANDIDATE / 'index.html'), initial_role_count=1,
        rehearsal='HML snapshot restored, migrated and authorized role verified in a disposable database'))
    print('HML release prepared; backup restoration and migration rehearsal passed.')


def api(action):
    run(['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', CONTROL / 'manage_api.ps1', '-Action', action], 'api-' + action.lower() + '.log')


def publish_frontend(source):
    destination = ROOT / 'frontend/dist'
    for path in source.rglob('*'):
        if not path.is_file() or path.relative_to(source) == Path('index.html'): continue
        target = destination / path.relative_to(source)
        require(target.resolve().is_relative_to(destination.resolve()), 'Unexpected asset destination.')
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
    temporary = destination / 'index.html.next'
    shutil.copyfile(source / 'index.html', temporary)
    temporary.replace(destination / 'index.html')


def ready():
    for _ in range(20):
        try:
            with urllib.request.urlopen('http://127.0.0.1:6969/api/health/ready', timeout=3) as response:
                if json.load(response).get('database') == 'ok': return
        except OSError: pass
        time.sleep(1)
    raise RuntimeError('HML API readiness failed.')


def rollback(module, credentials):
    state = read('state.json')
    api('Stop')
    restored = 'frota_contract_tests_rollback_' + uuid4().hex[:12]
    failed = 'frota_hml_failed_superuser_' + uuid4().hex[:12]
    with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as db:
        db.execute(sql.SQL('CREATE DATABASE {} TEMPLATE template0').format(sql.Identifier(restored)))
    run([PG / 'pg_restore.exe', '-h', '127.0.0.1', '-p', '5441', '-U', credentials['user'], '-d', restored,
        '--no-owner', '--no-acl', FOLDER / 'database.dump'], 'rollback-restore.log', env=db_env(credentials))
    with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as db:
        db.execute(sql.SQL('ALTER DATABASE {} ALLOW_CONNECTIONS false').format(sql.Identifier(DATABASE)))
        db.execute('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid<>pg_backend_pid()', (DATABASE,))
        db.execute(sql.SQL('ALTER DATABASE {} RENAME TO {}').format(sql.Identifier(DATABASE), sql.Identifier(failed)))
        db.execute(sql.SQL('ALTER DATABASE {} RENAME TO {}').format(sql.Identifier(restored), sql.Identifier(DATABASE)))
        db.execute(sql.SQL('ALTER DATABASE {} OWNER TO loan_test_admin').format(sql.Identifier(DATABASE)))
        db.execute(sql.SQL('ALTER DATABASE {} ALLOW_CONNECTIONS true').format(sql.Identifier(DATABASE)))
    with psycopg.connect(**credentials, dbname=DATABASE) as db:
        db.execute('GRANT USAGE ON SCHEMA public TO loan_test_app')
        db.execute('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO loan_test_app')
        db.execute('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO loan_test_app')
    with tarfile.open(FOLDER / 'source-before.tar') as archive:
        require(all((ROOT / item.name).resolve().is_relative_to(ROOT) for item in archive.getmembers()), 'Unexpected source archive path.')
        archive.extractall(ROOT, filter='data')
    publish_frontend(FOLDER / 'frontend-before')
    shutil.copy2(FOLDER / 'refresh-before.py', CONTROL / 'refresh_data.py')
    api('Start'); ready()
    state.update(status='rolled-back', finished_at=datetime.now().astimezone().isoformat(), failed_database=failed)
    save('state.json', state)


def activate():
    module, credentials, overlay = runtime()
    state = read('state.json')
    require(state['status'] == 'prepared', 'This release is not ready to activate.')
    require(sha(CANDIDATE / 'index.html') == state['candidate_sha256'], 'Frontend changed after the rehearsal.')
    require(production_fingerprint() == read('production-before.json'), 'Production changed externally; review before activation.')
    # No mutation happens before the guarded, HML-only stop succeeds.
    api('Stop')
    try:
        dump(credentials)  # Fresh backup while the API is stopped, retaining every latest HML write.
        state.update(status='activating', backup_sha256=sha(FOLDER / 'database.dump'))
        save('state.json', state)
        migrate(module, credentials, DATABASE)
        with psycopg.connect(**credentials, dbname=DATABASE) as db:
            db.execute('GRANT SELECT,INSERT,UPDATE,DELETE ON system_settings,record_controls TO loan_test_app')
            db.execute('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO loan_test_app')
            applied = overlay.apply(db, read('admin-overlay.json'), database_name=DATABASE)
            require(db.execute("SELECT count(*) FROM users WHERE role::text='SUPERUSER'").fetchone()[0] == 1, 'Only the authorized user may be superuser initially.')
            overlay.validate(db, applied)
        publish_frontend(CANDIDATE)
        shutil.copy2(ROOT / 'scripts/homologation/refresh_entrypoint.py', CONTROL / 'refresh_data.py')
        api('Start'); ready()
        require(production_fingerprint() == read('production-before.json'), 'Production changed externally during activation.')
        with urllib.request.urlopen('http://127.0.0.1:6969/api/system-settings/public', timeout=5) as response:
            require('identity' in json.load(response)['values'], 'Published settings API failed.')
        state.update(status='complete', finished_at=datetime.now().astimezone().isoformat(),
            target_schema='0063_superuser_settings', superusers=1, frontend_sha256=sha(ROOT / 'frontend/dist/index.html'))
        save('state.json', state)
        print('HML release completed and verified. Production unchanged.')
    except Exception:
        rollback(module, credentials)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare', 'activate', 'rollback'])
    action = parser.parse_args().action
    FOLDER.mkdir(parents=True, exist_ok=True)
    # The daily wrapper holds this same Windows file with FileShare.None.
    with (ROOT / 'storage/production-refresh/refresh.lock').open('a+b'):
        if action == 'prepare': prepare()
        elif action == 'activate': activate()
        else:
            module, credentials, _overlay = runtime()
            rollback(module, credentials)
