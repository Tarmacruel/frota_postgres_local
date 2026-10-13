import asyncio
from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.deps import get_current_user_ready
from app.api.routes.analytics_v2 import router
from app.db.session import get_db_session
from app.models.user import UserRole
from app.repositories.analytics_v2_repository import summary_statement
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_v2_periods import calendar_months, compare, equivalent_periods, valid_distance
from app.services.analytics_v2_service import AnalyticsV2Service, totals, mileage_metrics

NOW = datetime(2026, 10, 6, 15, tzinfo=timezone.utc)


def filters(**overrides):
    return AnalyticsV2Filter(**dict({"date_from": date(2026, 9, 1), "date_to": date(2026, 9, 30)}, **overrides))


def row(**overrides):
    return dict({"period": "current", "month": "2026-09", "source": "fuel", "vehicle_id": uuid4(),
        "driver_id": None, "status": "", "amount": Decimal("100"), "records": 1,
        "known_amounts": 1, "liters": Decimal("10"), "known_liters": 1, "anomalies": 0}, **overrides)


def test_period_edges_and_equivalent_days():
    current, previous = equivalent_periods(date(2026, 9, 1), date(2026, 9, 30), now=NOW)
    assert current.start_at == datetime(2026, 9, 1, 3, tzinfo=timezone.utc)
    assert current.end_exclusive == datetime(2026, 10, 1, 3, tzinfo=timezone.utc)
    assert previous.days == current.days == 30
    assert previous.date_from == date(2026, 8, 2)
    assert previous.end_exclusive == current.start_at


@pytest.mark.parametrize("year", [2023, 2024])
def test_consecutive_months_including_february(year):
    result = list(calendar_months(date(year, 1, 15), date(year, 3, 10)))
    assert [item[0] for item in result] == [f"{year}-01", f"{year}-02", f"{year}-03"]
    assert result[0][1].day == 15 and result[-1][2].day == 10
    assert result[1][2].day == (29 if year == 2024 else 28)


def test_year_rollover():
    assert [m for m, _, _ in calendar_months(date(2025, 12, 1), date(2026, 2, 28))] == ["2025-12", "2026-01", "2026-02"]


@pytest.mark.parametrize("end", [date(2026, 10, 6), date(2026, 10, 7)])
def test_open_and_future_days_rejected(end):
    with pytest.raises(ValueError, match="encerrados"):
        equivalent_periods(date(2026, 10, 1), end, now=NOW)


@pytest.mark.parametrize("start,end", [(date(2026, 2, 2), date(2026, 2, 1)), (date(2020, 1, 1), date(2021, 1, 1))])
def test_invalid_filter_range(start, end):
    with pytest.raises(ValidationError):
        filters(date_from=start, date_to=end)


@pytest.mark.parametrize("start,end,expected", [(None, 100, None), (100, None, None), (200, 100, None), (-1, 50, None),
    (100, 100, Decimal(0)), (100, 150, Decimal(50)), ("NaN", 100, None), (1, "Infinity", None)])
def test_distance_rejects_missing_regressive_nonfinite_readings(start, end, expected):
    assert valid_distance(start, end) == expected


def test_comparison_null_zero_and_direction():
    assert compare(Decimal(20), ZERO := Decimal(0)).delta_percent is None
    assert compare(None, ZERO).delta is None
    assert compare(Decimal(80), Decimal(100)).delta_percent == -20
    assert compare(ZERO, ZERO).delta == 0


def test_partial_values_not_zero_and_claim_not_in_cost():
    result = totals([row(), row(amount=None, known_amounts=0), row(source="claim_estimate", amount=Decimal(999))])
    assert result.operational_cost.value is None
    assert result.operational_cost.known_value == 100
    assert result.operational_cost.missing_or_invalid == 1
    assert result.claim_estimate.value == 999
    assert totals([]).operational_cost.value == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("drivers", [0, 1, 100, 1000])
async def test_summary_constant_query_count_and_no_write(drivers):
    rows = [row(driver_id=UUID(int=i + 1), source="fines", status="PENDENTE", anomalies=0) for i in range(drivers)]
    result = SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: rows))
    empty = SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: []))
    db = SimpleNamespace(execute=AsyncMock(side_effect=[result, empty]), commit=AsyncMock(), flush=AsyncMock())
    summary = await AnalyticsV2Service(db).summary(filters(), now=NOW)
    assert db.execute.await_count == 2
    db.commit.assert_not_called()
    db.flush.assert_not_called()
    assert len(summary.driver_risk) == drivers
    assert all(item.score == 3 for item in summary.driver_risk)
    assert all(kpi.value is None for kpi in summary.kpis if kpi.quality == "unavailable")


@pytest.mark.asyncio
async def test_months_fill_gaps_without_changing_observed_totals():
    db = SimpleNamespace(execute=AsyncMock(side_effect=[SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: [row(month="2026-03", amount=Decimal("0.30"))])), SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: []))]))
    result = await AnalyticsV2Service(db).summary(filters(date_from=date(2026, 1, 1), date_to=date(2026, 3, 31)), now=NOW)
    assert [m.month for m in result.monthly] == ["2026-01", "2026-02", "2026-03"]
    assert result.monthly[0].totals.operational_cost.value == 0
    assert result.current.operational_cost.value == Decimal("0.30")
    assert result.kpis[0].comparison.delta_percent is None


def test_sql_has_grouped_scope_every_source_and_no_status_exclusion():
    f = filters(organization=uuid4(), vehicle_type="HATCH", vehicle_id=uuid4())
    current, previous = equivalent_periods(f.date_from, f.date_to, now=NOW)
    compiled = str(summary_statement(f, current, previous).compile(dialect=postgresql.dialect()))
    assert "GROUP BY" in compiled and compiled.count("UNION ALL") == 3
    assert compiled.count("vehicles.vehicle_type =") == 4
    assert "vehicles.status" not in compiled
    assert "location_history" in compiled
    assert "fleet_analytics_snapshots" not in compiled


def route_app(role=UserRole.ADMIN, organization=None, allowed=True):
    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=role, organization_id=organization)
    permission = SimpleNamespace(can_view=allowed, can_create=False, can_edit=False, can_delete=False)
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: permission)))
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    return app


@pytest.mark.asyncio
@pytest.mark.parametrize("role,org,expected", [(UserRole.ADMIN, None, "requested"), (UserRole.PRODUCAO, UUID(int=1), UUID(int=1)),
    (UserRole.PRODUCAO, None, UUID(int=0))])
async def test_route_preserves_organization_scope(monkeypatch, role, org, expected):
    requested = uuid4()
    captured = []
    original = AnalyticsV2Service.summary
    async def stub(self, f):
        captured.append(f)
        self.repository.summary_rows = AsyncMock(return_value=[])
        self.repository.mileage_rows = AsyncMock(return_value=[])
        return await original(self, f, now=NOW)
    monkeypatch.setattr(AnalyticsV2Service, "summary", stub)
    async with AsyncClient(transport=ASGITransport(app=route_app(role, org)), base_url="http://test") as client:
        response = await client.get("/api/analytics/v2/summary", params={"date_from": "2026-09-01", "date_to": "2026-09-30", "organization": str(requested)})
    assert response.status_code == 200, response.text
    assert captured[0].organization == (requested if expected == "requested" else expected)
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["current"]["operational_cost"]["value"] == "0"


@pytest.mark.asyncio
async def test_route_requires_permission_and_authentication():
    async with AsyncClient(transport=ASGITransport(app=route_app(allowed=False)), base_url="http://test") as client:
        response = await client.get("/api/analytics/v2/summary?date_from=2026-09-01&date_to=2026-09-30")
        assert response.status_code == 403
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db_session] = lambda: None
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/analytics/v2/summary?date_from=2026-09-01&date_to=2026-09-30")
        assert response.status_code == 401


@pytest.mark.asyncio
@pytest.mark.parametrize("extra", ["&driver_id=bad", "&vehicle_type=BOAT", "&organization=bad", "&timezone=UTC", "&date_to=2026-08-01"])
async def test_route_validates_filters(extra):
    async with AsyncClient(transport=ASGITransport(app=route_app()), base_url="http://test") as client:
        response = await client.get("/api/analytics/v2/summary?date_from=2026-09-01&date_to=2026-09-30" + extra)
        assert response.status_code == 422


def test_mileage_ratio_uses_weighted_totals_and_same_vehicle_subset():
    a, b, excluded = uuid4(), uuid4(), uuid4()
    events = [row(vehicle_id=a, liters=Decimal(10), amount=Decimal(100)),
        row(vehicle_id=b, liters=Decimal(10), amount=Decimal(100)),
        row(vehicle_id=excluded, liters=Decimal(9000), amount=Decimal(9000))]
    distances = [dict(vehicle_id=id_, valid_records=1, records=1, distance_km=km, crossing_records=0, overlapping_records=0)
        for id_, km in [(a, 100), (b, 1000)]]
    measured, metrics = mileage_metrics(events, distances)
    assert measured.distance_km == 1100
    assert metrics["consumption_l_100km"][0] == Decimal(20) / 1100 * 100
    assert metrics["operational_cost_per_km"][0] == Decimal(200) / 1100
    assert metrics["consumption_l_100km"][0] != Decimal("5.5")


def test_zero_km_is_measured_but_ratios_are_unavailable():
    id_ = uuid4()
    measured, metrics = mileage_metrics([row(vehicle_id=id_)], [dict(vehicle_id=id_, valid_records=1,
        records=1, distance_km=0, crossing_records=0, overlapping_records=0)])
    assert measured.distance_km == 0
    assert metrics["operational_cost_per_km"][0] is None
    assert mileage_metrics([], [])[0].distance_km is None


@pytest.mark.asyncio
async def test_concurrent_summaries_do_not_share_scope_or_results():
    first, second = AnalyticsV2Service(None), AnalyticsV2Service(None)
    both_started = asyncio.Event()
    started = 0
    async def records(f, current, previous):
        nonlocal started
        started += 1
        if started == 2:
            both_started.set()
        await asyncio.wait_for(both_started.wait(), timeout=1)
        return [row(amount=Decimal(f.organization.int))]
    for service in (first, second):
        service.repository.summary_rows = records
        service.repository.mileage_rows = AsyncMock(return_value=[])
    a, b = await asyncio.gather(first.summary(filters(organization=UUID(int=10)), now=NOW),
        second.summary(filters(organization=UUID(int=20)), now=NOW))
    assert a.current.operational_cost.value == 10
    assert b.current.operational_cost.value == 20
