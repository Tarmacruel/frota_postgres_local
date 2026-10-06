"""One-time, explicit production snapshot into the isolated loan test environment."""
from __future__ import annotations

import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess

from dotenv import dotenv_values
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = Path(r'D:\FROTAS\frota_emprestimos_testes')
SOURCE = Path(r'D:\FROTAS\frota_certificado_homologacao')
PG = Path(r'C:\Program Files\PostgreSQL\16\bin')
STATE = ROOT / 'storage' / 'loan-tests'
DB_NAME = 'frota_emprestimos_testes'


def run_pg(name, arguments, env=None):
    subprocess.run([str(PG / (name + '.exe')), *arguments], check=True, env=env)


def provision():
    assert ROOT == EXPECTED and ROOT != SOURCE
    assert not (STATE / 'cluster').exists(), 'Existing cluster: setup refuses to overwrite it.'
    for port in (5441, 6969):
        with socket.socket() as probe:
            assert probe.connect_ex(('127.0.0.1', port)) != 0, f'Port {port} already occupied'
    STATE.mkdir(parents=True, exist_ok=True)
    values = dotenv_values(SOURCE / 'backend' / '.env', encoding='utf-8-sig')
    source_url = make_url(values['DATABASE_URL'])
    assert source_url.port != 5441 and source_url.database != DB_NAME
    password = secrets.token_urlsafe(36)
    credentials = {'host': '127.0.0.1', 'port': 5441, 'user': 'loan_test_admin', 'password': password}
    (STATE / 'database.json').write_text(json.dumps(credentials), encoding='utf-8')
    pwfile = STATE / 'init-password.txt'
    pwfile.write_text(password, encoding='utf-8')
    try:
        run_pg('initdb', ['-D', str(STATE / 'cluster'), '-U', credentials['user'], '--pwfile', str(pwfile), '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C'])
    finally:
        pwfile.unlink(missing_ok=True)
    with (STATE / 'cluster' / 'postgresql.conf').open('a', encoding='utf-8') as config:
        config.write("\nlisten_addresses = '127.0.0.1'\nport = 5441\n")
    run_pg('pg_ctl', ['-D', str(STATE / 'cluster'), '-l', str(STATE / 'postgres.log'), '-w', 'start'])
    with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as target:
        target.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(DB_NAME)))
    source_credentials = dict(host=source_url.host, port=source_url.port or 5432,
                              user=source_url.username, password=source_url.password, dbname=source_url.database)
    dump = STATE / 'source-snapshot.dump'
    dump_env = {**os.environ, 'PGPASSWORD': source_url.password or ''}
    with psycopg.connect(**source_credentials) as source:
        source.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
        snapshot = source.execute('SELECT pg_export_snapshot()').fetchone()[0]
        tables = [r[0] for r in source.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")]
        counts = {table: source.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table))).fetchone()[0] for table in tables}
        run_pg('pg_dump', ['-h', source_url.host, '-p', str(source_url.port or 5432), '-U', source_url.username,
                          '-d', source_url.database, '-Fc', '--no-owner', '--no-acl', '--snapshot', snapshot, '-f', str(dump)], dump_env)
    target_env = {**os.environ, 'PGPASSWORD': password}
    run_pg('pg_restore', ['-h', '127.0.0.1', '-p', '5441', '-U', credentials['user'], '-d', DB_NAME,
                         '--no-owner', '--no-acl', '--exit-on-error', str(dump)], target_env)
    source_storage = Path(values.get('STORAGE_DIR') or SOURCE / 'backend' / 'storage').resolve()
    target_storage = ROOT / 'data' / 'uploads'
    assert source_storage != target_storage.resolve()
    shutil.copytree(source_storage, target_storage, dirs_exist_ok=True)
    if values.get('DIGITAL_DOCUMENT_ARTIFACTS_DIR'):
        shutil.copytree(Path(values['DIGITAL_DOCUMENT_ARTIFACTS_DIR']), target_storage / 'digital_document_artifacts', dirs_exist_ok=True)
    # Remap only storage references, never signed snapshots or audit payloads.
    with psycopg.connect(**credentials, dbname=DB_NAME) as target:
        actual = {table: target.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table))).fetchone()[0] for table in tables}
        assert actual == counts, 'Restore row counts do not match the exported snapshot'
        columns = target.execute("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying') AND (column_name LIKE '%path' OR column_name LIKE '%_path_%')").fetchall()
        remapped = 0
        missing = []
        checked = 0
        for table, column in columns:
            if column == 'public_validation_path':
                continue
            query = sql.SQL('SELECT DISTINCT {} FROM {} WHERE {} IS NOT NULL').format(sql.Identifier(column), sql.Identifier(table), sql.Identifier(column))
            for (value,) in target.execute(query).fetchall():
                if not value or value.startswith(('http:', 'https:')):
                    continue
                path = Path(value)
                if path.is_absolute():
                    if path.is_relative_to(source_storage):
                        replacement = str(target_storage / path.relative_to(source_storage))
                    elif path.is_relative_to(SOURCE):
                        relative = path.relative_to(SOURCE)
                        destination = ROOT / relative
                        if path.is_file():
                            destination.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(path, destination)
                        replacement = str(destination)
                    else:
                        raise RuntimeError(f'External file reference requires review: {table}.{column}')
                    target.execute(sql.SQL('UPDATE {} SET {}=%s WHERE {}=%s').format(sql.Identifier(table), sql.Identifier(column), sql.Identifier(column)), (replacement, value))
                    path = Path(replacement)
                    remapped += 1
                else:
                    base = target_storage / 'digital_document_artifacts' if table == 'digital_document_artifacts' else target_storage
                    path = base / path
                checked += 1
                if not path.is_file():
                    missing.append({'table': table, 'column': column, 'path': str(path)})
        target.execute(sql.SQL('CREATE ROLE loan_test_app LOGIN PASSWORD {}').format(sql.Literal(password)))
        target.execute('GRANT CONNECT ON DATABASE frota_emprestimos_testes TO loan_test_app')
        target.execute('GRANT USAGE ON SCHEMA public TO loan_test_app')
        target.execute('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO loan_test_app')
        target.execute('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO loan_test_app')
        target.execute('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO loan_test_app')
        target.execute('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO loan_test_app')
    origins = json.dumps(['http://localhost:6969', 'http://127.0.0.1:6969', 'https://testefrota.sirel.com.br'])
    environment = {
        'DATABASE_URL': f'postgresql+asyncpg://loan_test_app:{password}@127.0.0.1:5441/{DB_NAME}',
        'SECRET_KEY': secrets.token_urlsafe(48), 'SIGNATURE_EVIDENCE_SECRET': secrets.token_urlsafe(48),
        'APP_ENV': 'homologation', 'STORAGE_DIR': target_storage.as_posix(),
        'DIGITAL_DOCUMENT_ARTIFACTS_DIR': (target_storage / 'digital_document_artifacts').as_posix(),
        'SIGNATURE_PREPARED_STATE_DIR': (STATE / 'prepared').as_posix(),
        'COOKIE_NAME': 'loan_test_access_token', 'CSRF_COOKIE_NAME': 'loan_test_csrf_token', 'COOKIE_SECURE': 'false',
        'CORS_ORIGINS': origins, 'CSRF_TRUSTED_ORIGINS': origins,
        'TRUSTED_HOSTS': json.dumps(['localhost', '127.0.0.1', 'test', 'testserver', 'testefrota.sirel.com.br']),
        'CERTIFICATE_SIGNING_ENABLED': 'false', 'SIGNATURE_AGENT_ENABLED': 'false',
        'CANONICAL_DOCUMENT_ARTIFACTS_ENABLED': 'false', 'SIGNATURE_ALLOW_NETWORK_FETCHING': 'false',
        'SIGNATURE_BACKEND_BASE_URL': 'http://localhost:6969',
    }
    (ROOT / 'backend' / '.env').write_text(''.join(f'{key}={value}\n' for key, value in environment.items()), encoding='utf-8')
    (ROOT / 'frontend' / '.env.production.local').write_text('VITE_API_BASE_URL=/api\nVITE_APP_ENV=homologation\nVITE_HOMOLOGATION=true\nVITE_CERTIFICATE_SIGNING_ENABLED=false\n', encoding='utf-8')
    report = {'source_counts': counts, 'restored_counts': actual, 'remapped_paths': remapped, 'checked_paths': checked, 'missing_files': missing}
    (STATE / 'restore-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'tables_verified': len(counts), 'remapped_paths': remapped, 'checked_paths': checked, 'missing_files': len(missing)}))


if __name__ == '__main__':
    provision()
