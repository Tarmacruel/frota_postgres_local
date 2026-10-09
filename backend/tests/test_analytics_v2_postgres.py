"""Opt-in real PostgreSQL execution, entirely READ ONLY.

CTEs shadow table names with fictional rows; no INSERT, DDL or migration.
Pinned to the existing isolated HML instance. Never accepts an arbitrary URL.
"""
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
import pytest
from dotenv import dotenv_values
from sqlalchemy.dialects.postgresql.psycopg import PGDialect_psycopg
from sqlalchemy.engine import make_url

from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_v2_service import AnalyticsV2Service
from app.repositories.analytics_v2_repository import AnalyticsV2Repository
from app.services.analytics_v2_periods import equivalent_periods

pytestmark = pytest.mark.skipif(os.environ.get("ANALYTICS_V2_READONLY_TESTS") != "1", reason="opt-in read-only HML PostgreSQL probes")

SCHEMA = {
    "vehicles": {"id": "uuid", "vehicle_type": "text", "status": "text"},
    "fuel_supplies": {"id": "uuid", "vehicle_id": "uuid", "driver_id": "uuid", "organization_id": "uuid", "supplied_at": "timestamptz", "total_amount": "numeric", "liters": "double precision", "is_consumption_anomaly": "boolean"},
    "maintenance_records": {"id": "uuid", "vehicle_id": "uuid", "responsible_organization_id": "uuid", "start_date": "timestamptz", "total_cost": "numeric"},
    "fines": {"id": "uuid", "vehicle_id": "uuid", "driver_id": "uuid", "responsible_organization_id": "uuid", "infraction_date": "date", "infraction_time": "time", "amount": "numeric", "status": "text"},
    "claims": {"id": "uuid", "vehicle_id": "uuid", "driver_id": "uuid", "responsible_organization_id": "uuid", "data_ocorrencia": "timestamptz", "valor_estimado": "numeric"},
    "location_history": {"id": "uuid", "vehicle_id": "uuid", "allocation_id": "uuid", "start_date": "timestamptz", "end_date": "timestamptz"},
    "master_allocations": {"id": "uuid", "department_id": "uuid"},
    "master_departments": {"id": "uuid", "organization_id": "uuid"},
    "vehicle_possession": {"id": "uuid", "vehicle_id": "uuid", "responsible_organization_id": "uuid",
        "start_date": "timestamptz", "end_date": "timestamptz", "start_odometer_km": "double precision", "end_odometer_km": "double precision"},
}
A, B, VEHICLE, OTHER, DRIVER = [UUID(int=i) for i in range(1, 6)]
NOW = datetime(2026, 10, 6, 15, tzinfo=timezone.utc)


class ReadOnlyFacts:
    def __init__(self, connection):
        self.connection = connection
        self.rows = {table: [] for table in SCHEMA}
        self.calls = 0
        self.add("vehicles", id=VEHICLE, vehicle_type="SEDAN", status="INATIVO")
        self.add("vehicles", id=OTHER, vehicle_type="HATCH", status="ATIVO")

    def add(self, table, **values):
        values.setdefault("id", UUID(int=100 + sum(len(rows) for rows in self.rows.values())))
        self.rows[table].append(values)

    def fuel(self, when, amount=10, **values):
        defaults = dict(vehicle_id=VEHICLE, driver_id=DRIVER, organization_id=A,
            supplied_at=when, total_amount=amount, liters=2, is_consumption_anomaly=False)
        self.add("fuel_supplies", **dict(defaults, **values))

    async def execute(self, statement):
        compiled = statement.compile(dialect=PGDialect_psycopg())
        params = dict(compiled.params)
        ctes = []
        for table, fields in SCHEMA.items():
            selects = []
            for index, row in enumerate(self.rows[table]):
                parts = []
                for field, type_ in fields.items():
                    key = f"fixture_{table}_{index}_{field}"
                    params[key] = row.get(field)
                    parts.append(f'CAST(%({key})s AS {type_}) AS "{field}"')
                selects.append("SELECT " + ", ".join(parts))
            if not selects:
                selects = ["SELECT " + ", ".join(f'CAST(NULL AS {type_}) AS "{field}"' for field, type_ in fields.items()) + " WHERE FALSE"]
            ctes.append(f'"{table}" AS (' + " UNION ALL ".join(selects) + ")")
        sql = "WITH " + ", ".join(ctes) + " " + str(compiled)
        self.calls += 1
        result = self.connection.execute(sql, params).fetchall()
        return SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: result))

    async def summary(self, **filters):
        return await AnalyticsV2Service(self).summary(AnalyticsV2Filter(date_from=date(2026, 9, 1), date_to=date(2026, 9, 30), **filters), now=NOW)


@pytest.mark.asyncio
async def test_cost_breakdown_real_sql_preserves_event_organization_and_estimates(facts):
    facts.fuel("2026-09-10 12:00+00", 10, organization_id=A)
    facts.add("maintenance_records", vehicle_id=VEHICLE, responsible_organization_id=B,
        start_date="2026-09-11 12:00+00", total_cost=20)
    facts.add("claims", vehicle_id=VEHICLE, driver_id=DRIVER, responsible_organization_id=A,
        data_ocorrencia="2026-09-12 12:00+00", valor_estimado=90)
    filters = AnalyticsV2Filter(date_from=date(2026, 9, 1), date_to=date(2026, 9, 30))
    current, previous = equivalent_periods(filters.date_from, filters.date_to, now=NOW)
    rows = await AnalyticsV2Repository(facts).cost_rows(filters, current, previous)
    amounts = {(row['organization_id'], row['source']): row['amount'] for row in rows if row['period'] == 'current'}
    assert amounts[(A, 'fuel')] == 10
    assert amounts[(B, 'maintenance')] == 20
    assert amounts[(A, 'claim_estimate')] == 90


@pytest.fixture
def facts():
    root = Path(__file__).resolve().parents[2]
    assert root == Path(r"D:\FROTAS\frota_emprestimos_testes")
    url = make_url(dotenv_values(root / "backend/.env")["DATABASE_URL"])
    assert (url.host, url.port, url.database) == ("127.0.0.1", 5441, "frota_emprestimos_testes")
    with psycopg.connect(host=url.host, port=url.port, dbname=url.database, user=url.username, password=url.password,
        row_factory=dict_row, options="-c default_transaction_read_only=on -c statement_timeout=15000") as connection:
        assert connection.execute("SHOW transaction_read_only").fetchone()["transaction_read_only"] == "on"
        yield ReadOnlyFacts(connection)
        connection.rollback()


@pytest.mark.asyncio
async def test_real_sql_edges_inactive_vehicle_and_previous_period(facts):
    facts.fuel("2026-09-01 02:59:59+00", 5)
    facts.fuel("2026-09-01 03:00:00+00", 10)
    facts.fuel("2026-10-01 02:59:59+00", 20)
    facts.fuel("2026-10-01 03:00:00+00", 1000)
    facts.fuel("2026-09-10 12:00:00+00", 999, vehicle_id=OTHER)
    summary = await facts.summary(vehicle_type="SEDAN", organization=A)
    assert summary.current.operational_cost.value == 30
    assert summary.previous.operational_cost.value == 5
    assert summary.kpis[0].comparison.delta_percent == 500
    assert facts.calls == 2


@pytest.mark.asyncio
async def test_real_sql_transfer_explicit_responsibility_and_no_current_location_fallback(facts):
    for org in [A, B]:
        facts.add("master_departments", id=org, organization_id=org)
        facts.add("master_allocations", id=org, department_id=org)
    facts.add("location_history", vehicle_id=VEHICLE, allocation_id=A, start_date="2026-08-01 03:00+00", end_date="2026-09-15 15:00+00")
    facts.add("location_history", vehicle_id=VEHICLE, allocation_id=B, start_date="2026-09-15 15:00+00", end_date=None)
    facts.fuel("2026-09-10 12:00+00", 10, organization_id=None)
    facts.fuel("2026-09-20 12:00+00", 20, organization_id=None)
    # Borrowing/explicit attribution beats the vehicle's historical operator.
    facts.fuel("2026-09-20 12:00+00", 30, organization_id=A)
    # No time: transfer during this date means no unambiguous all-day owner.
    facts.add("fines", vehicle_id=VEHICLE, driver_id=DRIVER, infraction_date="2026-09-15", amount=99, status="PENDENTE")
    first, second, global_ = await facts.summary(organization=A), await facts.summary(organization=B), await facts.summary()
    assert first.current.operational_cost.value == 40
    assert second.current.operational_cost.value == 20
    assert global_.current.operational_cost.value == 159
    assert not first.driver_risk[0].fines_count
    assert global_.driver_risk[0].fines_count == 1


@pytest.mark.asyncio
async def test_real_sql_missing_amount_estimates_statuses_and_driver_counts(facts):
    facts.fuel("2026-09-03 12:00+00", None, is_consumption_anomaly=True)
    for status in ["PAGA", "PENDENTE", "RECURSO", "DEFERIDA"]:
        facts.add("fines", vehicle_id=VEHICLE, driver_id=DRIVER, infraction_date="2026-09-30", amount=Decimal("0.10"), status=status, responsible_organization_id=A)
    facts.add("maintenance_records", vehicle_id=VEHICLE, start_date="2026-09-05 03:00+00", total_cost=5, responsible_organization_id=A)
    facts.add("claims", vehicle_id=VEHICLE, driver_id=DRIVER, data_ocorrencia="2026-09-30 12:00+00", valor_estimado=1000, responsible_organization_id=A)
    result = await facts.summary(organization=A)
    assert result.current.operational_cost.value is None
    assert result.current.operational_cost.known_value == Decimal("5.40")
    assert result.current.claim_estimate.value == 1000
    assert all(value.value == Decimal("0.10") for value in result.current.fines_by_status.values())
    assert result.driver_risk[0].score == 19
    assert result.quality["operational_cost_missing_or_invalid"] == 1
    assert (await facts.summary(organization=B)).current.operational_cost.value == 0


@pytest.mark.asyncio
async def test_real_sql_invalid_values_and_vehicle_id_filter(facts):
    facts.fuel("2026-09-03 12:00+00", Decimal("NaN"), liters=float("nan"))
    facts.fuel("2026-09-03 12:00+00", -1, liters=-5)
    facts.fuel("2026-09-03 12:00+00", 7, vehicle_id=OTHER, liters=3)
    result = await facts.summary(vehicle_id=VEHICLE)
    assert result.current.fuel.missing_or_invalid == 2
    assert result.current.liters.value is None
    assert result.current.liters.missing_or_invalid == 2
    assert (await facts.summary(vehicle_id=OTHER)).current.operational_cost.value == 7


@pytest.mark.asyncio
async def test_real_sql_valid_possessions_regression_missing_overlap_and_boundaries(facts):
    def possession(start, end, km_from=100, km_to=200, **extra):
        facts.add("vehicle_possession", **dict(dict(vehicle_id=VEHICLE, responsible_organization_id=A,
            start_date=start, end_date=end, start_odometer_km=km_from, end_odometer_km=km_to), **extra))
    possession("2026-09-01 03:00+00", "2026-09-02 03:00+00")
    possession("2026-09-03 03:00+00", "2026-09-04 03:00+00", 200, 150)
    possession("2026-09-05 03:00+00", "2026-09-06 03:00+00", None, 200)
    possession("2026-09-07 03:00+00", "2026-09-08 03:00+00")
    possession("2026-09-07 12:00+00", "2026-09-08 12:00+00")
    possession("2026-09-10 03:00+00", None)  # Open, never measured.
    possession("2026-08-31 03:00+00", "2026-09-01 04:00+00", vehicle_id=OTHER)  # Crosses current boundary, not prorated.
    possession("2026-09-30 03:00+00", "2026-10-01 03:00+00", 300, 450)
    facts.fuel("2026-09-15 12:00+00", 500, liters=25)
    result = await facts.summary(organization=A)
    assert result.mileage.distance_km == 250
    assert result.mileage.valid_records == 2
    assert result.mileage.excluded_records == 5
    assert result.mileage.overlapping_records == 2
    assert result.mileage.crossing_records == 1
    assert next(k for k in result.kpis if k.key == "operational_cost_per_km").value == 2
    assert next(k for k in result.kpis if k.key == "consumption_l_100km").value == 10
    assert (await facts.summary(organization=B)).mileage.distance_km is None
    assert (await facts.summary(vehicle_type="HATCH")).mileage.distance_km is None
