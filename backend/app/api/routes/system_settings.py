from uuid import UUID
from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user_ready, require_permission, require_superuser
from app.core.record_catalog import record_modules
from app.db.session import get_db_session
from app.models.user import User
from app.models.system_settings import RecordControl
from app.schemas.system_settings import RecordAction, SettingsUpdate
from app.services.system_settings_service import SystemSettingsService, logo_file
from app.services.record_admin_service import RecordAdminService, field_catalog, spec_for

router = APIRouter(prefix='/api/system-settings', tags=['SystemSettings'])
records_router = APIRouter(prefix='/api/record-admin', tags=['RecordAdministration'], dependencies=[Depends(require_superuser)])


@router.get('/public')
async def public_settings(db: AsyncSession = Depends(get_db_session)):
    return await SystemSettingsService(db).get()


@router.get('')
async def get_settings(db: AsyncSession = Depends(get_db_session), actor: User = Depends(require_superuser)):
    return await SystemSettingsService(db).get(catalog=True)


@router.put('')
async def update_settings(data: SettingsUpdate, db: AsyncSession = Depends(get_db_session), actor: User = Depends(require_superuser)):
    return await SystemSettingsService(db).update(data, actor)


@router.post('/logo')
async def upload_logo(file: UploadFile = File(...), db: AsyncSession = Depends(get_db_session), actor: User = Depends(require_superuser)):
    return await SystemSettingsService(db).upload_logo(file, actor)


@router.get('/logo/{token}')
async def view_logo(token: str):
    return FileResponse(logo_file(token), media_type='image/png')


@records_router.get('/catalog')
async def record_catalog():
    return [{'key': key, 'label': spec.label, 'fields': field_catalog(spec)} for key, spec in record_modules().items()]


@records_router.get('/{module}')
async def list_records(module: str, search: str | None = Query(None, max_length=150), inactive: bool | None = None,
                       page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100), db: AsyncSession = Depends(get_db_session)):
    return await RecordAdminService(db).list(module, search=search, inactive=inactive, page=page, limit=limit)


@records_router.get('/{module}/{record_id}')
async def record_detail(module: str, record_id: UUID, db: AsyncSession = Depends(get_db_session)):
    return await RecordAdminService(db).detail(module, record_id)


@records_router.get('/{module}/{record_id}/history')
async def record_history(module: str, record_id: UUID, db: AsyncSession = Depends(get_db_session)):
    from app.models.audit_log import AuditLog
    from sqlalchemy import select
    await RecordAdminService(db).get(module, record_id)
    rows = (await db.scalars(select(AuditLog).where(AuditLog.entity_id == record_id,
        AuditLog.entity_type == 'ADMIN_' + module.upper()).order_by(AuditLog.created_at.desc()).limit(50))).all()
    return [{'id': row.id, 'action': row.action, 'actor_name': row.actor_name, 'created_at': row.created_at,
             'justification': (row.details or {}).get('justification'), 'details': row.details} for row in rows]


@records_router.patch('/{module}/{record_id}')
async def correct_record(module: str, record_id: UUID, data: RecordAction,
                         db: AsyncSession = Depends(get_db_session), actor: User = Depends(require_superuser)):
    return await RecordAdminService(db).change(module, record_id, data, actor)


@records_router.post('/{module}/{record_id}/release-invoice')
async def release_invoice(module: str, record_id: UUID, data: RecordAction,
                          db: AsyncSession = Depends(get_db_session), actor: User = Depends(require_superuser)):
    service = RecordAdminService(db)
    row = await service.get(module, record_id, lock=True)
    control = await service._control(module, record_id, lock=True)
    from app.services.record_lifecycle_service import RecordLifecycleService
    await RecordLifecycleService(db).release_cancelled_invoice(module, row, control, data, actor)
    return await service.detail(module, record_id)


@records_router.delete('/{module}/{record_id}')
async def delete_record(module: str, record_id: UUID, data: RecordAction,
                        db: AsyncSession = Depends(get_db_session), actor: User = Depends(require_superuser)):
    return await RecordAdminService(db).change(module, record_id, data, actor, deleting=True)


@router.get('/form-values/{module}/{record_id}')
async def form_values(module: str, record_id: UUID, db: AsyncSession = Depends(get_db_session), actor: User = Depends(get_current_user_ready)):
    spec = spec_for(module)
    await require_permission(spec.permission, 'view')(db=db, current_user=actor)
    row = await RecordAdminService(db).get(module, record_id)
    if actor.role.value != 'SUPERUSER':
        from app.core.organization_scope import ensure_organization_access, production_scope_is_empty
        from app.services.operational_scope import ensure_record_visible, ensure_registration_manager
        if production_scope_is_empty(actor): raise HTTPException(404, 'Registro não encontrado')
        if module == 'vehicle_loans':
            from app.services.vehicle_loan_service import VehicleLoanService
            VehicleLoanService(db).visible(row, actor)
        elif hasattr(row, 'vehicle_id'): await ensure_record_visible(db, row, actor)
        elif module == 'vehicles': await ensure_registration_manager(db, row.id, actor)
        elif hasattr(row, 'organization_id'): ensure_organization_access(actor, row.organization_id)
        elif module not in ('contracts', 'suppliers', 'fuel_stations'):
            raise HTTPException(404, 'Registro não encontrado')
    control = await db.get(RecordControl, (module, record_id))
    from app.services.system_settings_service import runtime_settings
    active_keys = {field['key'] for field in runtime_settings()['forms'].get(module, {}).get('custom', []) if field.get('active', True)}
    return {'values': {key: value for key, value in (control.custom_fields if control else {}).items() if key in active_keys}}
