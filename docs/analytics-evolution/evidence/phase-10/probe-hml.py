"""Record only aggregate workflow metadata; never reconcile or mutate on GET."""
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from dotenv import dotenv_values
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine

ROOT = Path(__file__).resolve().parents[4]
assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes')


async def main():
    url = make_url(dotenv_values(ROOT / 'backend/.env')['DATABASE_URL'])
    assert (url.host, url.port, url.database, url.username) == ('127.0.0.1', 5441, 'frota_emprestimos_testes', 'loan_test_app')
    engine = create_async_engine(url, connect_args={'server_settings': {'default_transaction_read_only': 'on'}})
    try:
        async with engine.connect() as conn:
            result = {'environment': 'isolated HML', 'observed_at_utc': datetime.now(timezone.utc).isoformat(),
                'transaction_read_only': (await conn.execute(text('SHOW transaction_read_only'))).scalar_one(),
                'migration': (await conn.execute(text('SELECT version_num FROM alembic_version'))).scalar_one()}
            assert result['transaction_read_only'] == 'on' and result['migration'] == '0052_analytics_alert_workflow'
            tables = ['analytics_alert_cases', 'analytics_alert_events', 'analytics_alert_requests', 'fuel_supplies', 'vehicles']
            result['rows'] = {table: (await conn.execute(text(f'SELECT count(*) FROM {table}'))).scalar_one() for table in tables}
            result['statuses'] = dict((await conn.execute(text('SELECT status,count(*) FROM analytics_alert_cases GROUP BY status'))).all())
            result['event_types'] = dict((await conn.execute(text('SELECT event_type,count(*) FROM analytics_alert_events GROUP BY event_type'))).all())
            result['history_privileges'] = dict(zip(('select', 'insert', 'update', 'delete'), (await conn.execute(text(
                "SELECT has_table_privilege(current_user,'analytics_alert_events','SELECT'), has_table_privilege(current_user,'analytics_alert_events','INSERT'), has_table_privilege(current_user,'analytics_alert_events','UPDATE'), has_table_privilege(current_user,'analytics_alert_events','DELETE')"))).one()))
            assert result['history_privileges'] == {'select': True, 'insert': True, 'update': False, 'delete': False}
            result['qa_schemas_remaining'] = (await conn.execute(text("SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'analytics_alert_qa_%'"))).scalar_one()
            assert result['qa_schemas_remaining'] == 0
            result['unique_fingerprints'] = (await conn.execute(text('SELECT count(DISTINCT fingerprint)=count(*) FROM analytics_alert_cases'))).scalar_one()
            result['workflow_audit_rows'] = (await conn.execute(text("SELECT count(*) FROM audit_logs WHERE entity_type='ANALYTICS_ALERT' AND entity_id IN (SELECT id FROM analytics_alert_cases)"))).scalar_one()
            result['original_events_preserved'] = (await conn.execute(text("SELECT NOT EXISTS (SELECT 1 FROM analytics_alert_cases c WHERE NOT EXISTS (SELECT 1 FROM analytics_alert_events e WHERE e.case_id=c.id AND e.event_type='DETECTED'))"))).scalar_one()
            assert result['unique_fingerprints'] and result['original_events_preserved']
    finally:
        await engine.dispose()
    target = Path(__file__).parent / ('after-qa.json' if '--after-qa' in sys.argv else 'after-migration.json')
    target.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))


asyncio.run(main())
