"""Measure Analytics V2 against the isolated HML database without changing data."""
import asyncio
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from time import perf_counter
from xml.etree import ElementTree

from dotenv import dotenv_values
from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

ROOT = Path(__file__).resolve().parents[4]
assert ROOT == Path(r"D:\FROTAS\frota_emprestimos_testes")
TARGET = Path(__file__).parent / 'review-20261013' if '--review' in sys.argv else Path(__file__).parent
sys.path.insert(0, str(ROOT / "backend"))

from app.schemas.analytics_v2 import AnalyticsV2Filter  # noqa: E402
from app.services.analytics_v2_cockpit import AnalyticsV2Cockpit  # noqa: E402
from app.services.analytics_v2_costs import AnalyticsV2Costs  # noqa: E402
from app.services.analytics_v2_drivers import AnalyticsV2Drivers  # noqa: E402
from app.services.analytics_v2_fuel import AnalyticsV2Fuel  # noqa: E402
from app.services.analytics_v2_maintenance import AnalyticsV2Maintenance  # noqa: E402
from app.services.analytics_v2_reports import export_report  # noqa: E402
from app.services.analytics_v2_service import AnalyticsV2Service  # noqa: E402
from app.services.analytics_v2_utilization import AnalyticsV2Utilization  # noqa: E402


async def main():
    url = make_url(dotenv_values(ROOT / "backend/.env")["DATABASE_URL"])
    assert (url.host, url.port, url.database) == ("127.0.0.1", 5441, "frota_emprestimos_testes")
    engine = create_async_engine(url, connect_args={"server_settings": {
        "default_transaction_read_only": "on", "statement_timeout": "15000"}})
    statements = []
    event.listen(engine.sync_engine, "before_cursor_execute",
                 lambda _conn, _cursor, statement, _params, _context, _many: statements.append(statement))
    result = {"environment": "isolated HML", "observed_at_utc": datetime.now(timezone.utc).isoformat(),
              "period": "2026-09-11..2026-10-10", "runs": [], "exports": []}
    try:
        async with engine.connect() as conn:
            result["transaction_read_only"] = (await conn.execute(text("SHOW transaction_read_only"))).scalar_one()
            assert result["transaction_read_only"] == "on"
            result["migration"] = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
            tables = ["vehicles", "drivers", "fuel_supplies", "maintenance_records", "vehicle_possession", "fines", "claims"]
            result["table_rows"] = {table: (await conn.execute(text(f'SELECT count(*) FROM "{table}"'))).scalar_one()
                                    for table in tables}
            result["indexes"] = [dict(row) for row in (await conn.execute(text(
                "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' "
                "AND tablename = ANY(:tables) ORDER BY tablename, indexname"), {"tables": tables})).mappings()]
            filters = AnalyticsV2Filter(date_from=date(2026, 9, 11), date_to=date(2026, 10, 10))
            async with AsyncSession(bind=conn) as session:
                analyses = {}
                services = {
                    "summary": lambda: AnalyticsV2Service(session).summary(filters),
                    "fleet-status": lambda: AnalyticsV2Cockpit(session).fleet(filters),
                    "attention": lambda: AnalyticsV2Cockpit(session).attention(filters),
                    "costs": lambda: AnalyticsV2Costs(session).get(filters),
                    "fuel": lambda: AnalyticsV2Fuel(session).get(filters, can_view_records=True),
                    "maintenance": lambda: AnalyticsV2Maintenance(session).get(filters),
                    "utilization": lambda: AnalyticsV2Utilization(session).get(filters),
                    "drivers": lambda: AnalyticsV2Drivers(session).get(filters, can_view_drivers=True,
                        readable_sources=["possession", "fine", "claim", "fuel_supply", "anomaly"]),
                }
                for name, load in services.items():
                    for sample in range(2):
                        before = len(statements)
                        started = perf_counter()
                        data = await load()
                        analyses[name] = data
                        elapsed = round((perf_counter() - started) * 1000, 1)
                        payload = data.model_dump_json().encode("utf-8")
                        result["runs"].append({"service": name, "sample": sample + 1,
                                               "elapsed_ms": elapsed, "sql_statements": len(statements) - before,
                                               "payload_bytes": len(payload)})
                        if sample == 1 and name in {"summary", "costs", "fuel", "maintenance", "utilization", "drivers"}:
                            profile = "executive" if name == "summary" else name
                            for fmt in ("pdf", "xlsx"):
                                started_export = perf_counter()
                                response = export_report(profile, fmt, filters, data)
                                result["exports"].append({"profile": profile, "format": fmt,
                                    "elapsed_ms": round((perf_counter() - started_export) * 1000, 1),
                                    "bytes": len(response.body), "status": response.status_code,
                                    "signature_ok": response.body.startswith(b"%PDF-" if fmt == "pdf" else b"PK")})
                                if fmt == "pdf":
                                    info = subprocess.run(["pdfinfo", "-"], input=response.body,
                                                          capture_output=True, check=True)
                                    pages = next(line for line in info.stdout.decode().splitlines() if line.startswith("Pages:"))
                                    result["exports"][-1]["pages"] = int(pages.split(":", 1)[1].strip())
                                    bbox = subprocess.run(["pdftotext", "-bbox", "-", "-"], input=response.body,
                                                          capture_output=True, check=True)
                                    document = ElementTree.fromstring(bbox.stdout)
                                    words = 0
                                    for page in document.findall('.//{*}page'):
                                        width, height = float(page.attrib['width']), float(page.attrib['height'])
                                        for word in page.findall('.//{*}word'):
                                            words += 1
                                            assert 0 <= float(word.attrib['xMin']) <= float(word.attrib['xMax']) <= width
                                            assert 0 <= float(word.attrib['yMin']) <= float(word.attrib['yMax']) <= height
                                    assert words > 0
                                    result["exports"][-1].update(all_page_text_in_bounds=True, word_count=words)
                                    if profile == "executive" or '--review' in sys.argv:
                                        preview = subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-singlefile",
                                                                  "-scale-to", "1200", "-png", "-"],
                                                                 input=response.body, capture_output=True, check=True)
                                        assert preview.stdout.startswith(b"\x89PNG")
                                        output = TARGET if profile == 'executive' else ROOT / 'output/playwright/analytics-review-20261013/pdf'
                                        output.mkdir(parents=True, exist_ok=True)
                                        (output / f"{profile}-pdf-page1.png").write_bytes(preview.stdout)
                                        if result["exports"][-1]["pages"] > 1:
                                            last = str(result["exports"][-1]["pages"])
                                            final = subprocess.run(["pdftoppm", "-f", last, "-l", last,
                                                                    "-singlefile", "-scale-to", "1200", "-png", "-"],
                                                                   input=response.body, capture_output=True, check=True)
                                            assert final.stdout.startswith(b"\x89PNG")
                                            (output / f"{profile}-pdf-last.png").write_bytes(final.stdout)
                summary, costs, fuel = analyses['summary'], analyses['costs'], analyses['fuel']
                drivers, maintenance, utilization = analyses['drivers'], analyses['maintenance'], analyses['utilization']
                result['cross_view_checks'] = {
                    'operational_cost': summary.current.operational_cost == costs.totals.operational_cost,
                    'fuel_cost': summary.current.fuel == fuel.totals.cost,
                    'fuel_liters': summary.current.liters == fuel.totals.liters,
                    'maintenance_cost': summary.current.maintenance == maintenance.cost,
                    'cost_mileage': summary.mileage.distance_km == costs.measured_distance_km,
                    'global_utilization_mileage': summary.mileage.distance_km == utilization.distance_km,
                    'fuel_driver_anomalies': sum(fuel.anomaly_counts.values()) == drivers.totals['anomaly_rules'] + drivers.unlinked_records['anomaly_rule'],
                }
                assert all(result['cross_view_checks'].values()), result['cross_view_checks']
            result["write_statements"] = sum(not statement.lstrip().upper().startswith(("SELECT", "WITH", "SHOW"))
                                             for statement in statements)
            assert result["write_statements"] == 0
            await conn.rollback()
    finally:
        await engine.dispose()
    TARGET.mkdir(parents=True, exist_ok=True)
    target = TARGET / 'readonly-qa.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in result.items() if key != "indexes"}, ensure_ascii=False, indent=2))


asyncio.run(main())
