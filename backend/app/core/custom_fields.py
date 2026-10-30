"""Additional form values are committed with their business record, never later."""
import base64
import json
from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import event, select
from sqlalchemy.orm import Session
from app.models.system_settings import RecordControl


async def capture_submission(db, request):
    if request.method not in ('POST', 'PUT', 'PATCH'):
        return
    from app.core.record_catalog import record_modules
    from app.services.system_settings_service import runtime_settings
    direct_module = next((key for key, spec in record_modules().items() if request.url.path == spec.route
                          or (request.method in ('PUT', 'PATCH') and request.url.path.startswith(spec.route + '/')
                              and len(request.url.path.removeprefix(spec.route).strip('/').split('/')) == 1)), None)
    if direct_module and request.headers.get('content-type', '').startswith('application/json'):
        body = await request.json()
        if isinstance(body, dict):
            for key, rule in runtime_settings()['forms'].get(direct_module, {}).get('fields', {}).items():
                api_key = 'chassis_number' if key == 'chassi' else key
                if rule.get('visible', True) and rule.get('required') and (request.method == 'POST' or api_key in body):
                    if body.get(api_key) in (None, ''):
                        raise HTTPException(422, f"Preencha {rule['label']} antes de salvar.")
    header = request.headers.get('x-form-fields')
    if not header:
        from app.core.record_catalog import record_modules
        from app.services.system_settings_service import runtime_settings
        from app.services.record_admin_service import validate_custom
        module = next((key for key, spec in record_modules().items() if request.url.path == spec.route), None)
        if module and request.method == 'POST':
            validate_custom(module, {}, require_all=True)
        return
    if len(header) > 24000:
        raise HTTPException(422, 'Os campos adicionais excederam o tamanho permitido.')
    try:
        submitted = json.loads(base64.b64decode(header, validate=True).decode('utf-8'))
        from app.core.record_catalog import record_modules
        from app.services.record_admin_service import validate_custom
        spec = record_modules().get(submitted['module'])
        if not spec or not (request.url.path == spec.route or request.url.path.startswith(spec.route + '/')):
            raise ValueError()
        values = validate_custom(submitted['module'], submitted['values'], require_all=True)
        suffix = request.url.path.removeprefix(spec.route).strip('/').split('/')[0]
        try: record_id = UUID(suffix) if suffix else None
        except ValueError: record_id = None  # e.g. regularization/preview creates no record yet
    except (KeyError, ValueError, TypeError, UnicodeError) as exc:
        raise HTTPException(422, 'Os campos adicionais não puderam ser lidos. Confira o formulário e tente novamente.') from exc
    db.info['custom_submission'] = {'module': submitted['module'], 'values': values,
                                    'model': spec.model, 'record_id': record_id}
    if record_id:
        existing = await db.get(RecordControl, (submitted['module'], record_id))
        db.info['custom_existing'] = existing


@event.listens_for(Session, 'before_flush')
def collect_custom_target(session, _context, _instances):
    data = session.info.get('custom_submission')
    if not data or session.info.get('custom_saved'):
        return
    candidates = [obj for obj in session.new if isinstance(obj, data['model'])]
    if candidates:
        if len(candidates) != 1:
            raise HTTPException(422, 'Campos adicionais não podem ser aplicados a um lote. Abra um registro individual.')
        session.info['custom_target'] = candidates[0]


@event.listens_for(Session, 'after_flush_postexec')
def save_custom_values(session, _context):
    data = session.info.get('custom_submission')
    if not data or session.info.get('custom_saved'):
        return
    record_id = data['record_id'] or getattr(session.info.get('custom_target'), 'id', None)
    if record_id is None:
        return
    session.info['custom_saved'] = True
    control = session.info.get('custom_existing')
    if control is None:
        control = RecordControl(module=data['module'], record_id=record_id, revision=0, custom_fields={}, inactive=False)
        session.add(control)
    before = {key: (control.custom_fields or {}).get(key) for key in data['values']}
    control.custom_fields = {**(control.custom_fields or {}), **data['values']}
    control.revision = (control.revision or 0) + 1
    control.updated_by = session.info.get('actor_id')
    control.updated_at = datetime.now(timezone.utc)
    actor = session.info.get('audit_actor')
    if actor and before != data['values']:
        from app.core.roles import is_superuser
        from app.models.audit_log import AuditLog
        from app.services.audit_service import _sanitize_audit_value
        session.add(AuditLog(actor_user_id=actor.id, actor_name=actor.name, actor_email=actor.email,
            actor_role=actor.role.value, organization_id=None if is_superuser(actor) else actor.organization_id,
            action='FORM_FIELDS', entity_type='ADMIN_' + data['module'].upper(), entity_id=record_id,
            entity_label='Campos adicionais', details=_sanitize_audit_value({'before': before, 'after': data['values']})))


@event.listens_for(Session, 'after_rollback')
def reset_custom_save(session):
    session.info.pop('custom_saved', None)
    session.info.pop('custom_target', None)
