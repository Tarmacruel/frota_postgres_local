"""Inspect only the isolated homologation database; aggregate output, no row identities."""
import json
from pathlib import Path
from datetime import datetime, timezone

from dotenv import dotenv_values
import psycopg
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[3]
assert ROOT == Path(r"D:\FROTAS\frota_emprestimos_testes")
url = make_url(dotenv_values(ROOT / "backend/.env")["DATABASE_URL"])
assert (url.host, url.port, url.database) == ("127.0.0.1", 5441, "frota_emprestimos_testes")

QUERIES = {
    "vehicles": "SELECT count(*) total, count(*) FILTER (WHERE tank_capacity_liters IS NULL OR tank_capacity_liters <= 0) missing_valid_tank, count(*) FILTER (WHERE owner_organization_id IS NULL) missing_owner FROM vehicles",
    "vehicle_status": "SELECT status::text, count(*) FROM vehicles GROUP BY status ORDER BY status",
    "fuel": "SELECT count(*) total, count(*) FILTER (WHERE total_amount IS NULL) missing_amount, count(*) FILTER (WHERE driver_id IS NULL) missing_driver, count(*) FILTER (WHERE organization_id IS NULL) missing_organization, count(*) FILTER (WHERE consumption_km_l IS NULL) missing_consumption FROM fuel_supplies",
    "odometer_regressions": "SELECT count(*) FROM (SELECT odometer_km, lag(odometer_km) OVER (PARTITION BY vehicle_id ORDER BY supplied_at, created_at, id) previous FROM fuel_supplies) q WHERE odometer_km < previous",
    "maintenance": "SELECT count(*) total, count(*) FILTER (WHERE end_date IS NULL) open, count(*) FILTER (WHERE responsible_organization_id IS NULL) missing_responsibility FROM maintenance_records",
    "fines": "SELECT status::text, count(*) total, count(*) FILTER (WHERE driver_id IS NULL) missing_driver, count(*) FILTER (WHERE responsible_organization_id IS NULL) missing_responsibility FROM fines GROUP BY status ORDER BY status",
    "claims": "SELECT count(*) total, count(*) FILTER (WHERE driver_id IS NULL) missing_driver, count(*) FILTER (WHERE valor_estimado IS NULL) missing_estimate FROM claims",
    "possession": "SELECT count(*) total, count(*) FILTER (WHERE end_date IS NOT NULL) ended, count(*) FILTER (WHERE end_date IS NOT NULL AND (start_odometer_km IS NULL OR end_odometer_km IS NULL)) ended_without_odometer, count(*) FILTER (WHERE end_odometer_km < start_odometer_km) regressive FROM vehicle_possession",
    "schema": "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('vehicles','fuel_supplies','vehicle_possession','maintenance_records','fines','claims','fleet_analytics_snapshots','payment_processes','payment_process_references') ORDER BY table_name, ordinal_position",
    "active_drivers": "SELECT count(*) FROM drivers WHERE ativo IS TRUE",
    "fuel_30d_coverage": "SELECT count(*) vehicles_with_supply, count(*) FILTER (WHERE n=1) only_one_supply, count(*) FILTER (WHERE maximum=minimum) zero_distance FROM (SELECT vehicle_id, count(*) n, max(odometer_km) maximum, min(odometer_km) minimum FROM fuel_supplies WHERE supplied_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - INTERVAL '30 days' AND supplied_at <= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' GROUP BY vehicle_id) q",
    "indexes": "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('fuel_supplies','maintenance_records','fines','claims','fleet_analytics_snapshots','location_history') ORDER BY tablename,indexname",
}
report = {"observed_at": datetime.now(timezone.utc).isoformat(), "environment": "isolated homologation; not production statistics", "queries": {}}
with psycopg.connect(host=url.host, port=url.port, dbname=url.database, user=url.username, password=url.password,
                     options="-c default_transaction_read_only=on -c statement_timeout=15000") as connection:
    connection.execute("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
    assert connection.execute("SHOW transaction_read_only").fetchone()[0] == "on"
    report["read_only"] = True
    report["migration"] = connection.execute("SELECT version_num FROM alembic_version").fetchall()
    for name, sql in QUERIES.items():
        cursor = connection.execute(sql)
        report["queries"][name] = {"sql": sql, "columns": [c.name for c in cursor.description], "rows": cursor.fetchall()}
    connection.rollback()
target = Path(__file__).with_suffix(".json")
target.write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
print(f"Read-only evidence: {target.relative_to(ROOT)}")
