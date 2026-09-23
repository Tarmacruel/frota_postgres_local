"""Exercise repository search queries against isolated, minimal SQLite data."""

from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects import sqlite

from app.models.claim import Claim
from app.models.driver import Driver
from app.models.fine import Fine, FineInfraction
from app.models.master_data import Organization
from app.models.possession import VehiclePossession
from app.models.possession_trip import VehiclePossessionTrip, VehiclePossessionTripDestination
from app.models.vehicle import Vehicle
from app.repositories.claim_repository import ClaimRepository
from app.repositories.driver_repository import DriverRepository
from app.repositories.fine_repository import FineRepository
from app.repositories.possession_repository import PossessionRepository
from app.repositories.possession_report_repository import PossessionReportRepository
from app.schemas.possession_report import PossessionReportFilters, PossessionReportMode


@pytest.fixture
def search_session():
    engine = create_engine("sqlite://")
    with engine.connect() as connection:
        # These tests exercise filtering, not PostgreSQL-specific column defaults.
        for model in (
            Driver, Organization, Vehicle, Fine, FineInfraction, Claim,
            VehiclePossession, VehiclePossessionTrip, VehiclePossessionTripDestination,
        ):
            columns = ", ".join(f'"{column.name}" TEXT' for column in model.__table__.columns)
            connection.exec_driver_sql(f'CREATE TABLE "{model.__tablename__}" ({columns})')

        def insert(model, **values):
            columns = ", ".join(f'"{name}"' for name in values)
            placeholders = ", ".join("?" for _ in values)
            connection.exec_driver_sql(
                f'INSERT INTO "{model.__tablename__}" ({columns}) VALUES ({placeholders})',
                tuple(values.values()),
            )

        insert(Vehicle, id="vehicle", plate="ABC1D23")
        for index, registration in enumerate(("000123-AB", "987654", None), start=1):
            insert(Driver, id=f"driver-{index}", nome_completo=f"Condutor {index}", matricula=registration)
        for index in range(1, 5):
            driver_id = f"driver-{index}" if index < 4 else None
            values = dict(id=f"record-{index}", driver_id=driver_id, vehicle_id="vehicle")
            legacy_text = "Sem cadastro" if index == 4 else "Registro"
            insert(Fine, **values, ticket_number=legacy_text)
            insert(Claim, **values, descricao=legacy_text)
            insert(VehiclePossession, **values, driver_name=legacy_text)
            insert(VehiclePossessionTrip, id=f"trip-{index}", possession_id=values["id"])

        async def execute(statement):
            # Project IDs to test filtering/counts/pagination without ORM hydration.
            expression = statement.column_descriptions[0]["expr"]
            if isinstance(expression, type):
                statement = statement.with_only_columns(expression.id)
            sql = str(statement.compile(dialect=sqlite.dialect(), compile_kwargs={"literal_binds": True}))
            return connection.exec_driver_sql(sql)

        yield SimpleNamespace(execute=execute)
    engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("repository", [DriverRepository, PossessionRepository, FineRepository, ClaimRepository])
@pytest.mark.parametrize("search", ["000123-AB", "000123", "  123-ab  "])
async def test_registration_search_matches_only_linked_driver_and_keeps_total(search_session, repository, search):
    repo = repository(search_session)
    records, total = await repo.list_paginated(page=1, limit=1, search=search)
    assert records == (["driver-1"] if repository is DriverRepository else ["record-1"])
    assert total == 1
    records, total = await repo.list_paginated(page=2, limit=1, search=search)
    assert records == []
    assert total == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("repository", [PossessionRepository, FineRepository, ClaimRepository])
async def test_existing_search_still_finds_records_without_driver(search_session, repository):
    records, total = await repository(search_session).list_paginated(page=1, limit=10, search="Sem cadastro")
    assert records == ["record-4"]
    assert total == 1


@pytest.mark.asyncio
async def test_restricted_possession_search_does_not_match_registration(search_session):
    records, total = await PossessionRepository(search_session).list_paginated(
        page=1, limit=10, search="000123", include_personal_search=False,
    )
    assert records == []
    assert total == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", list(PossessionReportMode))
@pytest.mark.parametrize("include_operational_search", [True, False])
async def test_report_registration_search_respects_visibility(search_session, mode, include_operational_search):
    records = await PossessionReportRepository(search_session).load(
        mode=mode,
        filters=PossessionReportFilters(search="  123-ab  "),
        organization_id=None,
        limit=10,
        include_operational_search=include_operational_search,
    )
    expected_id = "record-1" if mode == PossessionReportMode.POSSESSION else "trip-1"
    assert records == ([expected_id] if include_operational_search else [])
