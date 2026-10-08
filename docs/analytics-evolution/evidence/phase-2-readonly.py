"""Run real V2 queries in isolated HML, with no writes or identifying output."""
import asyncio
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from time import perf_counter

from dotenv import dotenv_values
from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

ROOT = Path(__file__).resolve().parents[3]
assert ROOT == Path(r"D:\FROTAS\frota_emprestimos_testes")
sys.path.insert(0, str(ROOT / "backend"))
from app.schemas.analytics_v2 import AnalyticsV2Filter
from app.services.analytics_v2_service import AnalyticsV2Service


async def main():
    url = make_url(dotenv_values(ROOT / "backend/.env")["DATABASE_URL"])
    assert (url.host, url.port, url.database) == ("127.0.0.1", 5441, "frota_emprestimos_testes")
    engine = create_async_engine(url, connect_args={"server_settings": {"default_transaction_read_only": "on", "statement_timeout": "15000"}})
    statements = []
    event.listen(engine.sync_engine, "before_cursor_execute", lambda conn, cursor, statement, parameters, context, executemany: statements.append(statement))
    report = {"observed_at": datetime.now(timezone.utc).isoformat(), "environment": "isolated HML", "runs": []}
    try:
        async with engine.connect() as conn:
            report["read_only"] = (await conn.execute(text("SHOW transaction_read_only"))).scalar_one()
            assert report["read_only"] == "on"
            report["migration_before"] = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
            before = (await conn.execute(text("SELECT count(*) FROM fleet_analytics_snapshots"))).scalar_one()
            orgs = (await conn.execute(text("SELECT id FROM master_organizations ORDER BY id LIMIT 2"))).scalars().all()
            async with AsyncSession(bind=conn) as session:
                for index, org in enumerate([None, *orgs]):
                    start = len(statements)
                    clock = perf_counter()
                    result = await AnalyticsV2Service(session).summary(AnalyticsV2Filter(date_from=date(2026, 9, 1), date_to=date(2026, 9, 30), organization=org))
                    report["runs"].append({"scope": "global" if org is None else f"organization_{index}",
                        "selects": len(statements) - start, "elapsed_seconds": round(perf_counter() - clock, 4),
                        "records": result.quality["records"], "driver_groups": len(result.driver_risk),
                        "month_count": len(result.monthly), "schema_valid": True})
            after = (await conn.execute(text("SELECT count(*) FROM fleet_analytics_snapshots"))).scalar_one()
            report["snapshot_count_unchanged"] = before == after
            report["migration_after"] = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
            report["writes"] = len([sql for sql in statements if not sql.lstrip().upper().startswith(("SELECT", "SHOW"))])
            assert report["writes"] == 0
            await conn.rollback()
    finally:
        await engine.dispose()
    target = Path(__file__).with_suffix(".json")
    target.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(report, indent=2))


asyncio.run(main())
