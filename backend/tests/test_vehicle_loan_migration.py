"""Integration checks only on a disposable DB inside the dedicated test cluster."""
import json
import os
from pathlib import Path
from uuid import uuid4

from alembic import command
from alembic.config import Config
import psycopg
from psycopg import sql
import pytest

from app.core.config import settings

pytestmark = pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Requires isolated loan cluster')
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture(scope='module')
def migrated_database():
    assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes')
    credentials = json.loads((ROOT / 'storage/loan-tests/database.json').read_text())
    assert credentials['host'] == '127.0.0.1' and credentials['port'] == 5441
    database = 'loan_migration_' + uuid4().hex[:12]
    config = Config(str(ROOT / 'backend/alembic.ini'))
    previous_url = settings.DATABASE_URL
    with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as admin:
        assert Path(admin.execute('SHOW data_directory').fetchone()[0]).resolve() == (ROOT / 'storage/loan-tests/cluster').resolve()
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
    try:
        settings.DATABASE_URL = f"postgresql+psycopg://{credentials['user']}:{credentials['password']}@127.0.0.1:5441/{database}"
        command.upgrade(config, '0043_certificate_foundation')
        with psycopg.connect(**credentials, dbname=database) as connection:
            origin = connection.execute("INSERT INTO master_organizations(name) VALUES ('Origem teste') RETURNING id").fetchone()[0]
            recipient = connection.execute("INSERT INTO master_organizations(name) VALUES ('Destino teste') RETURNING id").fetchone()[0]
            department = connection.execute("INSERT INTO master_departments(organization_id,name) VALUES (%s,'Departamento') RETURNING id", (origin,)).fetchone()[0]
            allocation = connection.execute("INSERT INTO master_allocations(department_id,name) VALUES (%s,'Garagem') RETURNING id", (department,)).fetchone()[0]
            vehicle = connection.execute("INSERT INTO vehicles(plate,brand,model) VALUES ('TST1A01','Teste','Teste') RETURNING id").fetchone()[0]
            unknown = connection.execute("INSERT INTO vehicles(plate,brand,model) VALUES ('TST1A02','Teste','Teste') RETURNING id").fetchone()[0]
            connection.execute("INSERT INTO location_history(vehicle_id,allocation_id,department) VALUES (%s,%s,'Garagem')", (vehicle, allocation))
            actor = connection.execute("INSERT INTO users(name,email,password_hash) VALUES ('Operador teste','loan-test@example.test','not-a-password') RETURNING id").fetchone()[0]
        command.upgrade(config, 'head')
        yield credentials, database, (origin, recipient, vehicle, unknown, actor)
        command.downgrade(config, '0043_certificate_foundation')
        command.upgrade(config, 'head')
        command.check(config)
    finally:
        settings.DATABASE_URL = previous_url
        with psycopg.connect(**credentials, dbname='postgres', autocommit=True) as admin:
            assert database.startswith('loan_migration_')
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(database)))


@pytest.fixture
def database(migrated_database):
    credentials, name, ids = migrated_database
    connection = psycopg.connect(**credentials, dbname=name)
    try:
        yield connection, ids
    finally:
        connection.rollback()
        connection.close()


def test_owner_backfill_and_nullable_attribution(database):
    connection, (origin, _, vehicle, unknown, _) = database
    assert connection.execute('SELECT owner_organization_id FROM vehicles WHERE id=%s', (vehicle,)).fetchone()[0] == origin
    assert connection.execute('SELECT owner_organization_id FROM vehicles WHERE id=%s', (unknown,)).fetchone()[0] is None
    columns = connection.execute("SELECT table_name,column_name,is_nullable FROM information_schema.columns WHERE column_name IN ('vehicle_loan_id','responsible_organization_id') AND table_schema='public'").fetchall()
    assert len(columns) == 10
    assert all(row[2] == 'YES' for row in columns)


def insert_loan(connection, ids, **overrides):
    origin, recipient, vehicle, _, actor = ids
    values = dict(vehicle_id=vehicle, origin_organization_id=origin, recipient_organization_id=recipient,
                  created_by_user_id=actor, reason='Teste', status='AWAITING_RECEIPT')
    values.update(overrides)
    query = sql.SQL('INSERT INTO vehicle_loans ({}) VALUES ({}) RETURNING id').format(
        sql.SQL(',').join(map(sql.Identifier, values)), sql.SQL(',').join(sql.Placeholder() for _ in values))
    return connection.execute(query, list(values.values())).fetchone()[0]


def test_constraints_and_unique_concurrent_loan(database):
    connection, ids = database
    loan_id = insert_loan(connection, ids)
    with pytest.raises(psycopg.errors.UniqueViolation), connection.transaction():
        insert_loan(connection, ids)
    insert_loan(connection, ids, status='DRAFT')
    with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
        insert_loan(connection, ids, status='DRAFT', recipient_organization_id=ids[0])
    with pytest.raises(psycopg.errors.ForeignKeyViolation), connection.transaction():
        insert_loan(connection, ids, status='DRAFT', recipient_organization_id=uuid4())
    with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
        connection.execute("UPDATE vehicle_loans SET status='ACTIVE' WHERE id=%s", (loan_id,))
    with pytest.raises(psycopg.errors.CheckViolation), connection.transaction():
        insert_loan(connection, ids, status='DRAFT', delivery_odometer_km=-1)


def test_events_are_append_only_and_links_are_protected(database):
    connection, ids = database
    loan_id = insert_loan(connection, ids)
    event_id = connection.execute("INSERT INTO vehicle_loan_events(loan_id,event_type,actor_user_id,represented_organization_id) VALUES (%s,'SUBMITTED',%s,%s) RETURNING id", (loan_id, ids[4], ids[0])).fetchone()[0]
    for query in ('UPDATE vehicle_loan_events SET justification=\'changed\' WHERE id=%s', 'DELETE FROM vehicle_loan_events WHERE id=%s'):
        with pytest.raises(psycopg.errors.RaiseException), connection.transaction():
            connection.execute(query, (event_id,))
    with pytest.raises(psycopg.errors.ForeignKeyViolation), connection.transaction():
        connection.execute('DELETE FROM vehicle_loans WHERE id=%s', (loan_id,))
    with pytest.raises(psycopg.errors.ForeignKeyViolation), connection.transaction():
        connection.execute('DELETE FROM vehicles WHERE id=%s', (ids[2],))
