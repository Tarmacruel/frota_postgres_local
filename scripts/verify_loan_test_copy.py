"""Read-only snapshot/file verification and authenticated smoke on the test API."""
import hashlib
import json
from pathlib import Path
import secrets
import sys

import httpx
import psycopg
from psycopg import sql

sys.path.insert(0, str(Path(__file__).resolve().parent))
from loan_test_runtime import ROOT, check_cluster, settings
from app.core.security import get_password_hash


def main():
    credentials = check_cluster()
    state = ROOT / 'storage/loan-tests'
    report_path = state / 'restore-report.json'
    report = json.loads(report_path.read_text())
    login_path = state / 'test-login.json'
    with psycopg.connect(**credentials, dbname='frota_emprestimos_testes') as connection:
        counts = {table: connection.execute(sql.SQL('SELECT count(*) FROM {}').format(sql.Identifier(table))).fetchone()[0] for table in report['source_counts']}
        if not login_path.exists():
            assert counts == report['source_counts'], 'Snapshot counts changed unexpectedly before smoke'
        else:
            for table, count in report['source_counts'].items():
                if table not in ('users', 'audit_logs'):
                    assert counts[table] == count, f'Unexpected count change: {table}'
        columns = connection.execute("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying') AND (column_name LIKE '%path' OR column_name LIKE '%_path_%') AND column_name <> 'public_validation_path'").fetchall()
        missing = []
        checked = 0
        for table, column in columns:
            query = sql.SQL('SELECT DISTINCT {} FROM {} WHERE {} IS NOT NULL').format(sql.Identifier(column), sql.Identifier(table), sql.Identifier(column))
            for (value,) in connection.execute(query).fetchall():
                if not value or value.startswith(('http:', 'https:')):
                    continue
                path = Path(value)
                if not path.is_absolute():
                    base = settings.DIGITAL_DOCUMENT_ARTIFACTS_DIR if table == 'digital_document_artifacts' else settings.STORAGE_DIR
                    path = base / path
                assert path.resolve().is_relative_to(ROOT), f'External file reference: {table}.{column}'
                checked += 1
                if not path.is_file():
                    missing.append({'table': table, 'column': column, 'path': str(path)})
        report['checked_paths'] = checked
        report['missing_files'] = missing
        assert not missing, f'{len(missing)} missing files'
        # Real login with an account created only in the isolated test copy.
        if not login_path.exists():
            base = [secrets.randbelow(10) for _ in range(9)]
            for size in (10, 11):
                digit = (sum(n * (size - i) for i, n in enumerate(base)) * 10 % 11) % 10
                base.append(digit)
            login = {'email': 'emprestimos.teste@example.test', 'password': secrets.token_urlsafe(18)}
            connection.execute("INSERT INTO users(name,email,password_hash,role,cpf,must_change_password) VALUES (%s,%s,%s,'ADMIN',%s,false)",
                               ('Administrador do ambiente de testes', login['email'], get_password_hash(login['password']), ''.join(map(str, base))))
            connection.commit()
            login_path.write_text(json.dumps(login, indent=2), encoding='utf-8')
        else:
            login = json.loads(login_path.read_text())
        report['migration'] = connection.execute('SELECT version_num FROM alembic_version').fetchone()[0]
        report['owners_defined'] = connection.execute('SELECT count(*) FROM vehicles WHERE owner_organization_id IS NOT NULL').fetchone()[0]
        report['owners_pending'] = connection.execute('SELECT count(*) FROM vehicles WHERE owner_organization_id IS NULL').fetchone()[0]
    statuses = {}
    with httpx.Client(base_url='http://localhost:6969', timeout=20) as client:
        response = client.post('/api/auth/login', json=login, headers={'Origin': 'http://localhost:6969'})
        assert response.status_code == 200, f'Login failed: {response.status_code}'
        assert 'loan_test_access_token' in client.cookies
        for path in ('/api/health/ready', '/login', '/api/auth/me', '/api/vehicles/paginated?page=1&limit=2', '/api/possession/paginated?page=1&limit=2', '/api/fuel-supplies?page=1&limit=2'):
            response = client.get(path)
            statuses[path] = response.status_code
            assert response.status_code == 200, f'Smoke failed: {path} {response.status_code}'
    report['smoke'] = statuses
    report['test_account_created'] = True
    report_path.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps({'tables_verified': len(report['source_counts']), 'checked_files': checked, 'missing_files': len(missing),
                      'migration': report['migration'], 'owners_defined': report['owners_defined'], 'owners_pending': report['owners_pending'], 'smoke': statuses}))


if __name__ == '__main__':
    main()
