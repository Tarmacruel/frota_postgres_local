"""Read-only characterization of the existing Analytics; no engine or live API.

Run from the repository root with backend/.venv/Scripts/python.exe.
Results use synthetic fixtures and are not fleet statistics.
"""
import asyncio
from datetime import datetime, timezone
import inspect
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import UUID

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))
os.environ.update(APP_ENV="testing", DATABASE_URL="sqlite+aiosqlite:///:memory:", SECRET_KEY="audit-only")
import app.models  # noqa: E402
import app.services.analytics_service as module  # noqa: E402
from app.api.routes import analytics as routes  # noqa: E402
from app.models.fleet_analytics_snapshot import FleetAnalyticsSnapshot  # noqa: E402
from app.models.user import UserRole  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402


class Clock(datetime):
    fixed = datetime(2026, 10, 6, 15, 0, tzinfo=timezone.utc)

    @classmethod
    def now(cls, tz=None):
        return cls.fixed


class Result:
    def __init__(self, rows=(), scalar=0):
        self.rows, self.scalar = rows, scalar

    def all(self):
        return list(self.rows)

    def scalar_one(self):
        return self.scalar

    def scalars(self):
        return self


class FakeSession:
    def __init__(self, drivers=0):
        self.drivers = drivers
        self.sql = []
        self.commit = AsyncMock()

    async def execute(self, statement):
        sql = str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        self.sql.append(sql)
        if "SELECT drivers.id, drivers.nome_completo" in sql:
            return Result([SimpleNamespace(id=UUID(int=i + 1), nome_completo="Fixture") for i in range(self.drivers)])
        return Result()


async def main():
    report = {"source": "synthetic characterization; actual service, mocked database"}
    with patch.object(module, "datetime", Clock):
        start, end = module.AnalyticsService(None)._period_bounds(30)
        report["period_30"] = {"start": start.isoformat(), "end": end.isoformat(), "today_noon_included": start <= Clock.fixed <= end}
        report["months"] = {}
        for year, month in [(2023, 3), (2024, 3), (2026, 5), (2026, 10)]:
            Clock.fixed = datetime(year, month, 15, tzinfo=timezone.utc)
            session = FakeSession()
            rows = await module.AnalyticsService(session).costs_trend(months=3)
            report["months"][f"{year}-{month:02}"] = [r["month"] for r in rows]
        Clock.fixed = datetime(2026, 10, 6, 15, tzinfo=timezone.utc)
        report["query_counts"] = {}
        for drivers in [0, 1, 10, 100]:
            session = FakeSession(drivers)
            service = module.AnalyticsService(session)
            service.analytics_repo.replace_period_snapshots = AsyncMock()
            await service._ensure_snapshots(30)
            report["query_counts"][str(drivers)] = {"selects": len(session.sql), "replace_called": service.analytics_repo.replace_period_snapshots.await_count, "commit_called": session.commit.await_count}
        session = FakeSession()
        await module.AnalyticsService(session)._ensure_snapshots(30, organization_id=UUID(int=42))
        report["scoped_aggregate_sql"] = session.sql
    report["odometer_examples"] = []
    for readings, liters in [([1000], 50), ([1000, 1500], 100), ([1500, 1000], 100)]:
        km = max(max(readings) - min(readings), 0)
        report["odometer_examples"].append({"readings": readings, "liters": liters, "km": km, "l_100km": module.calculate_consumption_l_100km(liters, km)})
    report["endpoint_parameters"] = {route.path: list(inspect.signature(route.endpoint).parameters) for route in routes.router.routes}
    own, other = UUID(int=1), UUID(int=2)
    report["scope"] = {
        "production_requested_other": str(routes.analytics_organization_scope(SimpleNamespace(role=UserRole.PRODUCAO, organization_id=own), other)),
        "production_without_org": str(routes.analytics_organization_scope(SimpleNamespace(role=UserRole.PRODUCAO, organization_id=None), None)),
        "admin_no_filter": routes.analytics_organization_scope(SimpleNamespace(role=UserRole.ADMIN), None),
    }
    row = FleetAnalyticsSnapshot(vehicle_id=UUID(int=3), vehicle_type="SEDAN", consumption_l_100km=5, category_average_consumption=10, tco_cost_per_km=0.5, market_benchmark_tco=1)
    report["below_reference_alerts"] = [{k: r[k] for k in ("metric", "severity", "variance_percentage")} for r in module.AnalyticsService(None)._build_insights([row], [])]
    filtered_service = module.AnalyticsService(None)
    driver = FleetAnalyticsSnapshot(scope="DRIVER", driver_id=UUID(int=4), vehicle_type="N/A", driver_risk_score=90, notes="Fixture", extra_payload={"fines_count": 30})
    row.scope = "VEHICLE"
    filtered_service._ensure_snapshots = AsyncMock(return_value=[row, driver])
    report["hatch_filter_with_only_sedan_and_driver"] = {
        "efficiency": await filtered_service.efficiency(30, vehicle_type="HATCH"),
        "tco": await filtered_service.tco(30, vehicle_type="HATCH"),
        "insight_metrics": [r["metric"] for r in await filtered_service.insights(30, vehicle_type="HATCH")],
    }
    zero_service = module.AnalyticsService(None)
    zero_service._ensure_snapshots = AsyncMock(return_value=[])
    report["empty_overview"] = await zero_service.overview(30)
    report["weighted_vs_unweighted_example"] = {"vehicles": [{"liters": 10, "km": 100}, {"liters": 10, "km": 1000}], "current_average_l_100km": 5.5, "ratio_of_totals_l_100km": 20 / 1100 * 100}
    print(json.dumps(report, indent=2, ensure_ascii=True, default=str))


if __name__ == "__main__":
    asyncio.run(main())
