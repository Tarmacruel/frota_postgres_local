"""Copy production data into the isolated local HML cluster; never write to production."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from zoneinfo import ZoneInfo

import psycopg
from psycopg import sql
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

PROD = Path(r'D:\FROTAS\frota_certificado_homologacao')
HML = Path(r'D:\FROTAS\frota_emprestimos_testes')
CONTROL = Path(r'D:\FROTAS\02-HOMOLOGACAO\sincronizacao')
PG = Path(r'C:\Program Files\PostgreSQL\16\bin')
BACKUPS = HML / 'storage/backups/sincronizacao-producao'
RUNTIME = HML / 'storage/production-refresh'
DB = 'frota_emprestimos_testes'
TZ = ZoneInfo('America/Sao_Paulo')
RUN_RE = re.compile(r'^\d{8}-\d{6}-[0-9a-f]{6}$')
FILE_COLUMN_SQL = """SELECT table_name,column_name FROM information_schema.columns
 WHERE table_schema='public' AND data_type IN ('text','character varying')
 AND (column_name LIKE '%path' OR column_name LIKE '%_path_%')
 AND column_name <> 'public_validation_path' ORDER BY table_name,column_name"""


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def within(path: Path, parent: Path):
    require(path.resolve().is_relative_to(parent.resolve()) and path.resolve() != parent.resolve(), 'Path is outside its allowed directory.')
    return path


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.next')
    temporary.write_text(json.dumps(value, indent=2, default=str), encoding='utf-8')
    temporary.replace(path)


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def flag(value):
    return str(value or '').strip().lower() in {'1', 'true', 'on', 'yes'}


def config():
    require(HML.resolve() != PROD.resolve() and not HML.resolve().is_relative_to(PROD.resolve()), 'HML root aliases production.')
    require(BACKUPS.resolve().is_relative_to(HML.resolve()) and RUNTIME.resolve().is_relative_to(HML.resolve()), 'Refresh state or backup path escapes HML.')
    prod = dotenv_values(PROD / 'backend/.env', encoding='utf-8-sig')
    hml = dotenv_values(HML / 'backend/.env', encoding='utf-8-sig')
    source = make_url(prod['DATABASE_URL'])
    target = make_url(hml['DATABASE_URL'])
    require(prod.get('APP_ENV') == 'production', 'Unexpected production environment.')
    require((source.host, source.port, source.database) == ('127.0.0.1', 5432, 'frota_db'), 'Unexpected production database.')
    require((target.host, target.port, target.database, target.username) == ('127.0.0.1', 5441, DB, 'loan_test_app'), 'Refusing non-HML database destination.')
    require(hml.get('APP_ENV') == 'homologation', 'HML marker is missing.')
    require(hml.get('COOKIE_NAME') == 'loan_test_access_token' and hml.get('CSRF_COOKIE_NAME') == 'loan_test_csrf_token', 'HML cookies are not isolated.')
    require(hml.get('SECRET_KEY') and hml.get('SECRET_KEY') != prod.get('SECRET_KEY'), 'HML session secret must be isolated.')
    for key in ['CERTIFICATE_SIGNING_ENABLED', 'SIGNATURE_AGENT_ENABLED', 'SIGNATURE_ALLOW_NETWORK_FETCHING']:
        require(not flag(hml.get(key)), 'HML signing/external fetching must remain disabled.')
    for key in ['DIGITAL_DOCUMENT_ARTIFACTS_DIR', 'SIGNATURE_PREPARED_STATE_DIR']:
        require(hml.get(key) and Path(hml[key]).resolve().is_relative_to(HML.resolve()), 'Document artifacts or prepared states escape HML.')
    source_storage = Path(prod['STORAGE_DIR']).resolve()
    target_storage = Path(hml['STORAGE_DIR']).resolve()
    require(source_storage.is_relative_to(PROD.resolve()) and target_storage == (HML / 'data/uploads').resolve(), 'Storage boundaries changed.')
    require(Path(hml['DIGITAL_DOCUMENT_ARTIFACTS_DIR']).resolve() == (target_storage / 'digital_document_artifacts').resolve(), 'HML artifact storage layout changed.')
    if prod.get('DIGITAL_DOCUMENT_ARTIFACTS_DIR'):
        require(Path(prod['DIGITAL_DOCUMENT_ARTIFACTS_DIR']).resolve() == (source_storage / 'digital_document_artifacts').resolve(), 'Production artifact storage layout changed; review the copy mapping.')
    require(not target_storage.is_relative_to(PROD.resolve()), 'Target storage points at production.')
    require(not target_storage.is_symlink() and not os.path.isjunction(target_storage), 'Active HML uploads must be a physical directory.')
    credentials = read(HML / 'storage/loan-tests/database.json')
    require((credentials.get('host'), credentials.get('port'), credentials.get('user')) == ('127.0.0.1', 5441, 'loan_test_admin'), 'Unexpected HML maintenance identity.')
    with psycopg.connect(**credentials, dbname='postgres') as db:
        require(Path(db.execute('SHOW data_directory').fetchone()[0]).resolve() == (HML / 'storage/loan-tests/cluster').resolve(), 'Cluster data directory does not match HML.')
    paths = [HML / 'backend/.env', PROD / 'backend/.env', *sorted((HML / 'frontend').glob('.env*'))]
    hashes = {str(path): digest(path) for path in paths if path.is_file()}
    return {'source': source, 'target': target, 'credentials': credentials, 'source_storage': source_storage, 'target_storage': target_storage, 'hashes': hashes}


def assert_configs(cfg):
    require(all(digest(Path(name)) == value for name, value in cfg['hashes'].items()), 'An environment configuration changed during refresh.')


def source_connection(cfg):
    source = cfg['source']
    return psycopg.connect(host=source.host, port=source.port, user=source.username, password=source.password, dbname=source.database,
                           options='-c default_transaction_read_only=on -c timezone=UTC')


def target_connection(cfg, database=DB, **kwargs):
    require(database == DB or database == 'postgres' or re.fullmatch(r'frota_hml_(incoming|previous|failed)_\d{8}_\d{6}_[0-9a-f]{6}', database), 'Unsafe target database name.')
    return psycopg.connect(**cfg['credentials'], dbname=database, options='-c timezone=UTC', **kwargs)


def pg_tool(cfg, command, database, destination, log, source=False, snapshot=None):
    if source:
        require(command == 'pg_dump' and database == 'frota_db', 'Production access is export-only.')
        endpoint = cfg['source']
        host, port, user, password = endpoint.host, endpoint.port, endpoint.username, endpoint.password
    else:
        require(database == DB or re.fullmatch(r'frota_hml_incoming_\d{8}_\d{6}_[0-9a-f]{6}', database), 'Unsafe restore database name.')
        host, port, user, password = (cfg['credentials'][key] for key in ['host', 'port', 'user', 'password'])
        require(port == 5441, 'Restore port must be HML 5441.')
    args = [str(PG / (command + '.exe')), '-h', host, '-p', str(port), '-U', user, '-d', database, '--no-owner', '--no-acl']
    if command == 'pg_dump':
        args += ['-Fc', '-f', str(destination)]
        if snapshot: args += ['--snapshot', snapshot]
    else:
        require(not source and database.startswith('frota_hml_incoming_'), 'Restore is allowed only into a new staging database.')
        args += ['--exit-on-error', '--single-transaction', str(destination)]
    env = {**os.environ, 'PGPASSWORD': password or '', 'PGOPTIONS': '-c default_transaction_read_only=on' if source else '-c statement_timeout=600000'}
    process = subprocess.run(args, env=env, capture_output=True, timeout=900)
    log.write_bytes(process.stdout + b'\n' + process.stderr)
    require(process.returncode == 0, command + ' failed; inspect the private run log.')


def tables(db):
    return [row[0] for row in db.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]


def fingerprints(db, names=None, excluded=None):
    result = {}
    for table in names or tables(db):
        exclude = (excluded or {}).get(table, [])
        query = sql.SQL('SELECT payload FROM (SELECT (to_jsonb(t) - %s::text[])::text AS payload FROM {} AS t) AS rows ORDER BY payload COLLATE "C"').format(sql.Identifier(table))
        checksum = hashlib.sha256(); count = 0
        with db.cursor() as cursor:
            cursor.execute(query, (exclude,))
            for (payload,) in cursor:
                checksum.update(payload.encode('utf-8')); checksum.update(b'\n'); count += 1
        result[table] = {'count': count, 'sha256': checksum.hexdigest()}
    return result


def column_inventory(db):
    result = {}
    for table, column in db.execute("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"):
        result.setdefault(table, []).append(column)
    return result


def migration_preflight(source_revision):
    result = subprocess.run([str(HML / 'backend/.venv/Scripts/python.exe'), str(HML / 'scripts/migrate-hml-refresh.py'),
        '--source-revision', source_revision, '--check'], capture_output=True, text=True, timeout=45,
        creationflags=subprocess.CREATE_NO_WINDOW)
    require(result.returncode == 0, 'Production schema is not an ancestor of the available HML migrations; current HML was retained.')
    return json.loads(result.stdout.strip().splitlines()[-1])


def migrate_stage(cfg, database, source_revision, folder):
    require(re.fullmatch(r'frota_hml_incoming_\d{8}_\d{6}_[0-9a-f]{6}', database), 'Only incoming HML databases may be migrated.')
    result = subprocess.run([str(HML / 'backend/.venv/Scripts/python.exe'), str(HML / 'scripts/migrate-hml-refresh.py'),
        '--source-revision', source_revision, '--database', database], capture_output=True, text=True,
        timeout=180, creationflags=subprocess.CREATE_NO_WINDOW)
    (folder / 'migration.log').write_text(result.stdout + result.stderr, encoding='utf-8')
    require(result.returncode == 0, 'Staging migration failed; current HML was retained. Inspect migration.log.')
    return json.loads(result.stdout.strip().splitlines()[-1])


def projected_business_fingerprints(db, original, source_columns, excluded):
    current_columns = column_inventory(db)
    names = [name for name in original if name != 'alembic_version']
    require(set(names).issubset(current_columns), 'A migration removed source business tables; refresh refused.')
    projected_exclusions = {}
    for name in names:
        require(set(source_columns[name]).issubset(current_columns[name]), 'A migration removed source columns; refresh requires review.')
        projected_exclusions[name] = list(set(excluded.get(name, [])) | (set(current_columns[name])-set(source_columns[name])))
    return fingerprints(db, names=names, excluded=projected_exclusions)


def copy_files(source, destination):
    require(source.resolve() != destination.resolve(), 'Copy source equals destination.')
    destination.mkdir(parents=True, exist_ok=False)
    manifest = {}
    for path in source.rglob('*'):
        require(not path.is_symlink() and not os.path.isjunction(path), 'Attachment tree contains a reparse point.')
        if not path.is_file(): continue
        relative = path.relative_to(source)
        target = within(destination / relative, destination)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        manifest[relative.as_posix()] = {'bytes': target.stat().st_size, 'sha256': digest(target)}
    return manifest


def rewrite_paths(cfg, db, staged):
    columns = db.execute(FILE_COLUMN_SQL).fetchall()
    checked = 0; changed = 0
    for table, column in columns:
        values = db.execute(sql.SQL('SELECT DISTINCT {} FROM {} WHERE {} IS NOT NULL').format(sql.Identifier(column), sql.Identifier(table), sql.Identifier(column))).fetchall()
        for (value,) in values:
            if not value or value.startswith(('https:', 'http:')): continue
            path = Path(value)
            if path.is_absolute():
                require(path.resolve().is_relative_to(cfg['source_storage']), 'An absolute attachment path is outside production uploads; review before refreshing.')
                relative = path.resolve().relative_to(cfg['source_storage'])
                replacement = str(cfg['target_storage'] / relative)
                db.execute(sql.SQL('UPDATE {} SET {}=%s WHERE {}=%s').format(sql.Identifier(table), sql.Identifier(column), sql.Identifier(column)), (replacement, value))
                changed += 1
            else:
                require(not value.startswith(('\\', '/')) and '..' not in path.parts, 'Unsafe relative attachment path.')
                relative = Path('digital_document_artifacts') / path if table == 'digital_document_artifacts' else path
            target = within(staged / relative, staged)
            require(target.is_file(), f'An attachment referenced by {table}.{column} is missing; current HML remains preserved.')
            checked += 1
    return {'checked': checked, 'remapped_absolute_paths': changed}


def api(action, folder):
    # Background API descendants must not inherit a PIPE that communicate() waits on.
    # A real log file also keeps diagnostics available during a startup timeout.
    with (folder / ('api-' + action.lower() + '.log')).open('wb') as log:
        result = subprocess.run(['powershell.exe', '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', str(CONTROL / 'manage_api.ps1'), '-Action', action], stdout=log, stderr=subprocess.STDOUT, timeout=100, creationflags=subprocess.CREATE_NO_WINDOW)
    require(result.returncode == 0, 'HML API ' + action + ' failed; inspect private log.')


def database_exists(db, name):
    return bool(db.execute('SELECT 1 FROM pg_database WHERE datname=%s', (name,)).fetchone())


def disconnect(db, name):
    require(name == DB or name.startswith('frota_hml_incoming_'), 'Connection shutdown is restricted to HML.')
    db.execute(sql.SQL('ALTER DATABASE {} ALLOW_CONNECTIONS false').format(sql.Identifier(name)))
    db.execute('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=%s AND pid <> pg_backend_pid()', (name,))


def verify_ready(cfg):
    import urllib.request
    with urllib.request.urlopen('http://127.0.0.1:6969/api/health/ready', timeout=8) as response:
        require(json.load(response).get('database') == 'ok', 'HML readiness failed.')
    with target_connection(cfg) as db:
        require(db.execute('SELECT current_database()').fetchone()[0] == DB, 'Unexpected active database.')


def rollback(cfg, folder, state):
    api('Stop', folder)
    with target_connection(cfg, 'postgres', autocommit=True) as db:
        if database_exists(db, state['previous_database']):
            if database_exists(db, DB):
                disconnect(db, DB)
                db.execute(sql.SQL('ALTER DATABASE {} RENAME TO {}').format(sql.Identifier(DB), sql.Identifier(state['failed_database'])))
            db.execute(sql.SQL('ALTER DATABASE {} RENAME TO {}').format(sql.Identifier(state['previous_database']), sql.Identifier(DB)))
            db.execute(sql.SQL('ALTER DATABASE {} ALLOW_CONNECTIONS true').format(sql.Identifier(DB)))
        elif database_exists(db, DB):
            db.execute(sql.SQL('ALTER DATABASE {} ALLOW_CONNECTIONS true').format(sql.Identifier(DB)))
    previous_files = within(folder / 'previous-files', BACKUPS)
    if previous_files.exists():
        if cfg['target_storage'].exists():
            cfg['target_storage'].rename(within(folder / 'failed-files', BACKUPS))
        previous_files.rename(cfg['target_storage'])
    api('Start', folder); verify_ready(cfg)
    state.update(status='rolled-back', finished_at=datetime.now(TZ).isoformat())
    save(folder / 'state.json', state)


def prune(cfg, current_run):
    # Only this routine's marked snapshots and database prefixes are eligible.
    cutoff = datetime.now(TZ) - timedelta(days=7)
    for folder in BACKUPS.iterdir():
        if not folder.is_dir() or not RUN_RE.fullmatch(folder.name) or folder.name == current_run: continue
        state_file = folder / 'state.json'
        if not state_file.is_file(): continue
        state = read(state_file)
        if state.get('status') != 'complete' or datetime.fromisoformat(state['finished_at']) >= cutoff: continue
        within(folder, BACKUPS)
        name = state.get('previous_database', '')
        require(re.fullmatch(r'frota_hml_previous_\d{8}_\d{6}_[0-9a-f]{6}', name), 'Retention encountered an unexpected database.')
        with target_connection(cfg, 'postgres', autocommit=True) as db:
            if database_exists(db, name):
                count = db.execute('SELECT count(*) FROM pg_stat_activity WHERE datname=%s', (name,)).fetchone()[0]
                require(count == 0, 'Previous snapshot is in use; retention deferred.')
                db.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(name)))
        shutil.rmtree(folder)


def refresh(daily=False, migrate=None):
    now = datetime.now(TZ)
    require(BACKUPS.resolve().is_relative_to(HML.resolve()) and RUNTIME.resolve().is_relative_to(HML.resolve()), 'Refresh directories must stay inside HML.')
    RUNTIME.mkdir(parents=True, exist_ok=True); BACKUPS.mkdir(parents=True, exist_ok=True)
    if daily and now.hour < 6:
        return {'status': 'skipped', 'reason': 'before_06h'}
    success = RUNTIME / 'last-success.json'
    if daily and success.is_file() and datetime.fromisoformat(read(success)['finished_at']).date() == now.date():
        return {'status': 'skipped', 'reason': 'already_updated_today', 'run_id': read(success)['run_id']}
    api('EnsureDatabase', RUNTIME)
    cfg = config()
    require(shutil.disk_usage(HML).free > 3 * 1024**3, 'Less than 3 GB free; refresh refused.')
    # Recover an interrupted activation before starting another run.
    for previous in sorted(BACKUPS.glob('*/state.json')):
        previous_state = read(previous)
        if previous_state.get('status') in {'activating', 'rollback-failed'}: rollback(cfg, previous.parent, previous_state)
    run_id = now.strftime('%Y%m%d-%H%M%S-') + os.urandom(3).hex()
    folder = within(BACKUPS / run_id, BACKUPS); folder.mkdir()
    suffix = run_id.replace('-', '_')
    stage_name = 'frota_hml_incoming_' + suffix
    state = {'run_id': run_id, 'status': 'preparing', 'started_at': now.isoformat(), 'source': '127.0.0.1:5432/frota_db', 'target': '127.0.0.1:5441/' + DB, 'staging_database': stage_name, 'previous_database': 'frota_hml_previous_' + suffix, 'failed_database': 'frota_hml_failed_' + suffix}
    save(folder / 'state.json', state); save(RUNTIME / 'last-attempt.json', state)
    activated = False
    try:
        with source_connection(cfg) as source:
            source.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            require(source.execute('SHOW transaction_read_only').fetchone()[0] == 'on', 'Production connection is not read-only.')
            source.execute("SET TIME ZONE 'UTC'")
            revision = source.execute('SELECT version_num FROM alembic_version').fetchone()[0]
            migration_preflight(revision)
            source_columns = column_inventory(source)
            excluded = {}
            for table, column in source.execute(FILE_COLUMN_SQL): excluded.setdefault(table, []).append(column)
            snapshot = source.execute('SELECT pg_export_snapshot()').fetchone()[0]
            original = fingerprints(source)
            non_file = fingerprints(source, excluded=excluded)
            pg_tool(cfg, 'pg_dump', 'frota_db', folder / 'source.dump', folder / 'source-dump.log', source=True, snapshot=snapshot)
            files = copy_files(cfg['source_storage'], folder / 'source-files')
        save(folder / 'source-manifest.json', {'schema': revision, 'tables': original, 'non_file_tables': non_file, 'files': files, 'dump_sha256': digest(folder / 'source.dump')})
        with target_connection(cfg, 'postgres', autocommit=True) as db:
            db.execute(sql.SQL('CREATE DATABASE {} OWNER loan_test_admin TEMPLATE template0 ENCODING \'UTF8\'').format(sql.Identifier(stage_name)))
        pg_tool(cfg, 'pg_restore', stage_name, folder / 'source.dump', folder / 'restore.log')
        shutil.copytree(folder / 'source-files', folder / 'new-storage')
        with target_connection(cfg, stage_name) as db:
            require(fingerprints(db) == original, 'Restored tables do not match the consistent production snapshot.')
            path_result = rewrite_paths(cfg, db, folder / 'new-storage')
            require(fingerprints(db, excluded=excluded) == non_file, 'Business data changed outside attachment path remapping.')
            db.execute('GRANT USAGE ON SCHEMA public TO loan_test_app')
            db.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loan_test_app')
            db.execute('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loan_test_app')
            db.execute('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loan_test_app')
            db.execute('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO loan_test_app')
        migration_result = (migrate or migrate_stage)(cfg, stage_name, revision, folder)
        expected_business = {name: value for name, value in non_file.items() if name != 'alembic_version'}
        with target_connection(cfg, stage_name) as db:
            require(projected_business_fingerprints(db, original, source_columns, excluded) == expected_business,
                    'Source business data changed during staging migrations; active HML was retained.')
            require(db.execute('SELECT version_num FROM alembic_version').fetchone()[0] == migration_result['target_revision'],
                    'Staging did not reach the expected HML schema.')
            db.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loan_test_app')
            db.execute('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loan_test_app')
        assert_configs(cfg)
        state.update(source_schema=revision, target_schema=migration_result['target_revision'], migrations=migration_result,
                     schema=migration_result['target_revision'], tables_verified=len(original), files_copied=len(files), paths=path_result, counts={name: original[name]['count'] for name in ['vehicles', 'drivers', 'vehicle_possession', 'users', 'vehicle_tags']})
        state['status'] = 'activating'; save(folder / 'state.json', state)
        activated = True
        api('Stop', folder)
        pg_tool(cfg, 'pg_dump', DB, folder / 'previous.dump', folder / 'previous-dump.log')
        with target_connection(cfg) as db:
            save(folder / 'previous-fingerprints.json', fingerprints(db))
        with target_connection(cfg, 'postgres', autocommit=True) as db:
            disconnect(db, DB)
            db.execute(sql.SQL('ALTER DATABASE {} RENAME TO {}').format(sql.Identifier(DB), sql.Identifier(state['previous_database'])))
            db.execute(sql.SQL('ALTER DATABASE {} RENAME TO {}').format(sql.Identifier(stage_name), sql.Identifier(DB)))
        cfg['target_storage'].rename(within(folder / 'previous-files', BACKUPS))
        within(folder / 'new-storage', BACKUPS).rename(cfg['target_storage'])
        api('Start', folder); verify_ready(cfg)
        with target_connection(cfg) as db:
            require(projected_business_fingerprints(db, original, source_columns, excluded) == expected_business, 'Post-activation data integrity failed.')
            require(db.execute('SELECT version_num FROM alembic_version').fetchone()[0] == migration_result['target_revision'], 'Active HML schema differs from the verified staging schema.')
        assert_configs(cfg)
        state.update(status='complete', finished_at=datetime.now(TZ).isoformat(), production_read_only=True, business_fingerprints_match=True, configuration_preserved=True, backup_dump_sha256=digest(folder / 'previous.dump'))
        save(folder / 'state.json', state); save(success, state); save(RUNTIME / 'last-attempt.json', state)
        try: prune(cfg, run_id)
        except Exception as error: save(folder / 'retention-warning.json', {'error_type': type(error).__name__, 'message': str(error)})
        return state
    except Exception as error:
        state['error'] = str(error)
        if activated:
            try: rollback(cfg, folder, state)
            except Exception as rollback_error:
                state.update(status='rollback-failed', rollback_error=str(rollback_error)); save(folder / 'state.json', state)
        else:
            state.update(status='failed', finished_at=datetime.now(TZ).isoformat()); save(folder / 'state.json', state)
        save(RUNTIME / 'last-attempt.json', state)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--daily', action='store_true')
    parser.add_argument('--preflight', action='store_true')
    args = parser.parse_args()
    try:
        if args.preflight:
            cfg = config(); print(json.dumps({'status': 'validated', 'production_export_only': True, 'target': '127.0.0.1:5441/' + DB})); sys.exit(0)
        print(json.dumps(refresh(args.daily), default=str))
    except Exception as error:
        print(json.dumps({'status': 'failed', 'error_type': type(error).__name__, 'message': str(error)}))
        sys.exit(1)
