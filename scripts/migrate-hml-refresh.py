"""Upgrade only a guarded, temporary HML restore before its activation."""
import argparse
import importlib.util
import json
from pathlib import Path
import re

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

ROOT = Path(__file__).resolve().parents[1]
assert ROOT == Path(r'D:\FROTAS\frota_emprestimos_testes'), 'Unexpected HML root'
spec = importlib.util.spec_from_file_location('hml_runtime', ROOT/'scripts/loan_test_runtime.py')
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


def migration_plan(source_revision):
    config = Config(str(ROOT/'backend/alembic.ini'))
    config.set_main_option('script_location', str(ROOT/'backend/alembic'))
    scripts = ScriptDirectory.from_config(config)
    heads = scripts.get_heads()
    if len(heads) != 1:
        raise RuntimeError('HML migration graph must have a single head')
    pending = list(scripts.iterate_revisions(heads[0], source_revision))
    if scripts.get_revision(source_revision) is None:
        raise RuntimeError('Production schema is not recognized by the HML code')
    return config, {'source_revision': source_revision, 'target_revision': heads[0], 'pending_migrations': len(pending)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-revision', required=True)
    parser.add_argument('--database')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    config, result = migration_plan(args.source_revision)
    credentials = runtime.check_cluster()
    if args.check:
        print(json.dumps(result)); return
    if not args.database or not re.fullmatch(r'frota_hml_incoming_\d{8}_\d{6}_[0-9a-f]{6}', args.database):
        raise RuntimeError('Migration destination must be an isolated incoming HML database')
    import psycopg
    with psycopg.connect(**credentials, dbname=args.database) as db:
        actual = db.execute('SELECT version_num FROM alembic_version').fetchone()[0]
        if actual != args.source_revision:
            raise RuntimeError('Restored schema differs from the source snapshot')
    runtime.settings.DATABASE_URL = runtime.url.set(database=args.database,
        username=credentials['user'], password=credentials['password']).render_as_string(hide_password=False)
    command.upgrade(config, 'head')
    with psycopg.connect(**credentials, dbname=args.database) as db:
        if db.execute('SELECT version_num FROM alembic_version').fetchone()[0] != result['target_revision']:
            raise RuntimeError('Staging schema did not reach the expected HML revision')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
