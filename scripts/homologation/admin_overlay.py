"""Preserve HML configuration after a verified, read-only production copy.

Only exact existing principals are promoted. Business records and record_controls
are never carried over from tests. Projection validates the precise role/audit
delta without excluding the users or audit tables from integrity checking.
"""
import hashlib
import json
from pathlib import Path
import re
import shutil
from uuid import uuid4
from psycopg import sql
from psycopg.types.json import Jsonb

INITIAL_LOGIN = 'jonatas@sousa'


def require(condition, message):
    if not condition: raise RuntimeError(message)


def exists(db, table):
    return bool(db.execute('SELECT to_regclass(%s)', ('public.' + table,)).fetchone()[0])


def capture(db):
    condition = " AND NOT EXISTS(SELECT 1 FROM record_controls r WHERE r.module='users' AND r.record_id=users.id AND r.inactive)" if exists(db, 'record_controls') else ''
    principals = db.execute("SELECT id,email::text FROM users WHERE role::text='SUPERUSER'" + condition + " ORDER BY id").fetchall()
    if not principals:
        principals = db.execute('SELECT id,email::text FROM users WHERE lower(email::text)=%s', (INITIAL_LOGIN,)).fetchall()
        require(len(principals) == 1, 'The authorized initial superuser must match exactly one existing HML account.')
    result = {'principals': [{'id': str(key), 'login': login.casefold()} for key, login in principals], 'settings': None}
    if exists(db, 'system_settings'):
        row = db.execute('SELECT id,revision,"values",updated_by,updated_at FROM system_settings WHERE id=1').fetchone()
        if row:
            result['settings'] = dict(zip(('id', 'revision', 'values', 'updated_by', 'updated_at'), row))
    return result


def copy_logos(source_storage, new_storage):
    source = Path(source_storage) / 'system-identity'
    destination = Path(new_storage) / 'system-identity'
    require(source.resolve().is_relative_to(Path(source_storage).resolve()), 'HML identity directory escapes uploads.')
    if not source.is_dir(): return 0
    destination.mkdir(exist_ok=True)
    count = 0
    for path in source.glob('*.png'):
        if not re.fullmatch(r'[a-f0-9]{32}\.png', path.name): continue
        require(path.is_file() and path.resolve().is_relative_to(source.resolve()) and not path.is_symlink(), 'Invalid HML logo asset.')
        shutil.copy2(path, destination / path.name)
        count += 1
    return count


def row_digest(db, table, key):
    row = db.execute(sql.SQL('SELECT to_jsonb(t)::text FROM {} t WHERE id=%s').format(sql.Identifier(table)), (key,)).fetchone()
    require(row is not None, 'An HML configuration row is missing.')
    return hashlib.sha256(row[0].encode()).hexdigest()


def apply(db, overlay, *, database_name):
    require(database_name == 'frota_emprestimos_testes' or re.fullmatch(r'frota_hml_incoming_\d{8}_\d{6}_[0-9a-f]{6}', database_name)
            or database_name.startswith('frota_contract_tests_'), 'Overlay destination must be an isolated HML database.')
    require(db.execute('SELECT current_database()').fetchone()[0] == database_name, 'Overlay database mismatch.')
    require(exists(db, 'system_settings') and exists(db, 'record_controls'), 'Apply HML migrations before preserving settings.')
    result = {'roles_before': {}, 'users_before': {}, 'user_rows': {}, 'audit_rows': {}, 'settings_sha256': None, 'settings_before': None, 'principals': []}
    for principal in overlay['principals']:
        row = db.execute('SELECT id,email::text,role::text,name FROM users WHERE id=%s FOR UPDATE', (principal['id'],)).fetchone()
        require(row and str(row[0]) == principal['id'], 'A preserved superuser does not match the copied account. Current HML was retained.')
        result['principals'].append({'id': str(row[0]), 'login': row[1].casefold()})
        if row[2] != 'SUPERUSER':
            result['roles_before'][str(row[0])] = row[2]
            result['users_before'][str(row[0])] = db.execute(
                "SELECT jsonb_build_object('role',role,'updated_at',updated_at) FROM users WHERE id=%s", (row[0],)).fetchone()[0]
            db.execute("UPDATE users SET role='SUPERUSER' WHERE id=%s", (row[0],))
            # The existing users trigger also updates updated_at. Validate the full
            # resulting row, and normalize only these two proven bootstrap fields.
            result['user_rows'][str(row[0])] = row_digest(db, 'users', row[0])
            audit_id = uuid4()
            db.execute('''INSERT INTO audit_logs(id,actor_user_id,actor_name,actor_email,actor_role,action,entity_type,entity_id,entity_label,details)
                VALUES (%s,%s,%s,%s,'SUPERUSER','BOOTSTRAP','USER',%s,'Perfil global da homologação',%s)''',
                (audit_id, row[0], row[3], row[1], row[0], Jsonb({'before_role': row[2], 'after_role': 'SUPERUSER',
                    'justification': 'Perfil global autorizado e preservado após atualização da homologação.'})))
            result['audit_rows'][str(audit_id)] = row_digest(db, 'audit_logs', audit_id)
    config = overlay.get('settings')
    if config:
        prior_settings = db.execute('SELECT to_jsonb(s) FROM system_settings s WHERE id=1').fetchone()
        result['settings_before'] = prior_settings[0] if prior_settings else None
        # Strict product validation prevents a copied draft from becoming code/markup.
        from app.schemas.system_settings import SettingsValues
        SettingsValues.model_validate(config['values'])
        updater = config['updated_by']
        if updater and not db.execute('SELECT 1 FROM users WHERE id=%s', (updater,)).fetchone(): updater = None
        db.execute('''INSERT INTO system_settings(id,revision,"values",updated_by,updated_at) VALUES(1,%s,%s,%s,%s)
            ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,"values"=EXCLUDED."values",
                updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at''',
            (config['revision'], Jsonb(config['values']), updater, config['updated_at']))
        result['settings_sha256'] = row_digest(db, 'system_settings', 1)
    validate(db, result)
    return result


def validate(db, applied):
    for principal in applied['principals']:
        row = db.execute('SELECT email::text,role::text FROM users WHERE id=%s', (principal['id'],)).fetchone()
        require(row and row[0].casefold() == principal['login'] and row[1] == 'SUPERUSER', 'HML superuser validation failed.')
    for key, expected in applied['audit_rows'].items():
        require(row_digest(db, 'audit_logs', key) == expected, 'HML bootstrap audit changed unexpectedly.')
    for key, expected in applied.get('user_rows', {}).items():
        require(row_digest(db, 'users', key) == expected, 'HML bootstrap user changed unexpectedly.')
    if applied.get('settings_sha256'):
        require(row_digest(db, 'system_settings', 1) == applied['settings_sha256'], 'Preserved HML settings changed unexpectedly.')


def fingerprint_query(table, excluded, overlay=None):
    """Normalize only proven overlay rows back to their source representation."""
    payload = sql.SQL('(to_jsonb(t) - %s::text[])')
    parameters = [excluded]
    where = sql.SQL('')
    if overlay and table == 'users' and overlay['users_before']:
        ids = list(overlay['users_before'])
        payload = sql.SQL("CASE WHEN t.id=ANY(%s::uuid[]) THEN ((to_jsonb(t) || (%s::jsonb -> t.id::text)) - %s::text[]) ELSE {} END").format(payload)
        parameters = [ids, Jsonb(overlay['users_before']), excluded, excluded]
    elif overlay and table == 'audit_logs' and overlay['audit_rows']:
        where = sql.SQL(' WHERE NOT(t.id=ANY(%s::uuid[]))')
        parameters.append(list(overlay['audit_rows']))
    elif overlay and table == 'system_settings' and overlay.get('settings_sha256'):
        if overlay.get('settings_before') is None:
            where = sql.SQL(' WHERE t.id<>1')
        else:
            payload = sql.SQL('CASE WHEN t.id=1 THEN (%s::jsonb - %s::text[]) ELSE {} END').format(payload)
            parameters = [Jsonb(overlay['settings_before']), excluded, excluded]
    query = sql.SQL('SELECT payload FROM (SELECT ({})::text AS payload FROM {} t{}) rows ORDER BY payload COLLATE "C"').format(payload, sql.Identifier(table), where)
    return query, parameters
