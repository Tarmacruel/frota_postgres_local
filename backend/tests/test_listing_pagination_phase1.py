"""Check that list filters, totals and visible rows use the same SQL scope."""

from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects import sqlite

from app.models.vehicle import Vehicle
from app.models.possession import VehiclePossession
from app.repositories.vehicle_repository import VehicleRepository
from app.repositories.possession_repository import PossessionRepository


@pytest.fixture
def listing_db():
    engine = create_engine('sqlite://')
    with engine.connect() as connection:
        connection.exec_driver_sql('CREATE TABLE vehicles (id TEXT, plate TEXT, chassis_number TEXT, brand TEXT, model TEXT, owner_organization_id TEXT, ownership_type TEXT, status TEXT, created_at TEXT, updated_at TEXT)')
        connection.exec_driver_sql('CREATE TABLE location_history (id TEXT, vehicle_id TEXT, allocation_id TEXT, department TEXT, end_date TEXT)')
        connection.exec_driver_sql('CREATE TABLE master_allocations (id TEXT, department_id TEXT, name TEXT)')
        connection.exec_driver_sql('CREATE TABLE master_departments (id TEXT, organization_id TEXT, name TEXT)')
        connection.exec_driver_sql('CREATE TABLE master_organizations (id TEXT, name TEXT)')
        connection.exec_driver_sql('CREATE TABLE vehicle_possession (id TEXT, vehicle_id TEXT, driver_id TEXT, driver_name TEXT, driver_document TEXT, driver_contact TEXT, observation TEXT, public_number INTEGER, start_date TEXT, end_date TEXT, created_at TEXT)')
        connection.exec_driver_sql('CREATE TABLE drivers (id TEXT, matricula TEXT)')
        org = '00000000000000000000000000000001'
        other = '00000000000000000000000000000002'
        connection.exec_driver_sql("INSERT INTO master_organizations VALUES (?, ?), (?, ?)", (org, 'Secretaria de Saúde', other, 'Educação'))
        connection.exec_driver_sql("INSERT INTO master_departments VALUES ('dep', ?, 'Transporte')", (org,))
        connection.exec_driver_sql("INSERT INTO master_allocations VALUES ('alloc', 'dep', 'SAMU')")
        for index, plate, owner, ownership, status in ((1, 'ABC1D23', org, 'PROPRIO', 'ATIVO'), (2, 'XYZ9Z99', other, 'LOCADO', 'INATIVO'), (3, 'DEF4G56', other, 'CEDIDO', 'ATIVO')):
            connection.exec_driver_sql('INSERT INTO vehicles VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)',
                (f'vehicle-{index}', plate, 'Marca', 'Modelo', owner, ownership, status, f'2026-01-0{index}', f'2026-01-0{index}'))
        connection.exec_driver_sql("INSERT INTO location_history VALUES ('loc-1', 'vehicle-1', 'alloc', 'SAMU', NULL)")
        connection.exec_driver_sql("INSERT INTO vehicle_possession VALUES ('pos-1', 'vehicle-1', NULL, 'Maria', NULL, NULL, NULL, 1, '2026-01-01', NULL, '2026-01-01')")
        connection.exec_driver_sql("INSERT INTO vehicle_possession VALUES ('pos-2', 'vehicle-2', NULL, 'João', NULL, NULL, NULL, 2, '2026-01-02', '2026-01-03', '2026-01-02')")

        async def execute(statement):
            expression = statement.column_descriptions[0]['expr']
            if expression is Vehicle:
                statement = statement.with_only_columns(Vehicle.id)
            elif expression is VehiclePossession:
                statement = statement.with_only_columns(VehiclePossession.id)
            sql = str(statement.compile(dialect=sqlite.dialect(), compile_kwargs={'literal_binds': True}))
            return connection.exec_driver_sql(sql)

        yield SimpleNamespace(execute=execute), org
    engine.dispose()


@pytest.mark.asyncio
async def test_vehicle_list_page_and_summary_share_filters(listing_db):
    db, org = listing_db
    rows, total, summary = await VehicleRepository(db).list_paginated(
        page=1, limit=1, filter_organization_id=UUID(org), with_summary=True,
    )
    assert len(rows) == total == summary['total'] == summary['own'] == summary['active'] == 1
    assert summary['without_driver'] == 0
    rows, total, summary = await VehicleRepository(db).list_paginated(
        page=2, limit=1, search='Marca', with_summary=True,
    )
    assert len(rows) == 1 and total == summary['total'] == 3


@pytest.mark.asyncio
async def test_possession_list_page_and_summary_share_filters(listing_db):
    db, org = listing_db
    rows, total, summary = await PossessionRepository(db).list_paginated(
        page=1, limit=10, filter_organization_id=UUID(org), with_summary=True,
    )
    assert len(rows) == total == summary['total'] == summary['active'] == 1
    rows, total, summary = await PossessionRepository(db).list_paginated(
        page=1, limit=10, active=False, with_summary=True,
    )
    assert len(rows) == total == summary['total'] == 1
    assert summary['active'] == 0
