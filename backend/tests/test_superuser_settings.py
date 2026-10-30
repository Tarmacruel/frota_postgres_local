from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from app.api.deps import get_current_user_ready, require_permission
from app.api.routes.system_settings import router, records_router
from app.core.organization_scope import ensure_organization_access, scoped_organization_id, production_scope_is_empty
from app.core.permissions import PERMISSION_MODULES, default_permissions_for_role
from app.core.roles import is_administrator, is_superuser
from app.core.settings_catalog import DEFAULT_SETTINGS
from app.db.session import get_db_session
from app.models.user import User, UserRole
from app.models.user_permission import UserPermission
from app.schemas.system_settings import SettingsValues
from app.services.user_service import UserService
from app.services.record_admin_service import normalize_changes, spec_for, validate_custom
from app.services.system_settings_service import publish_runtime


def actor(role, org=None): return SimpleNamespace(id=uuid4(), role=role, organization_id=org)


def test_superuser_has_every_permission_even_with_old_denials():
    user = User(id=uuid4(), role=UserRole.SUPERUSER)
    user.permission_entries = [UserPermission(module=module, can_view=False, can_create=False, can_edit=False, can_delete=False) for module in PERMISSION_MODULES]
    assert all(all(flags.values()) for flags in user.permissions.values())
    assert is_administrator(user) and is_superuser(user)


@pytest.mark.asyncio
async def test_superuser_permission_does_not_depend_on_override_table():
    db = SimpleNamespace(execute=AsyncMock(side_effect=AssertionError('permission override must not limit SUPERUSER')))
    user = actor(UserRole.SUPERUSER)
    assert await require_permission('possession', 'delete')(db=db, current_user=user) is user


@pytest.mark.parametrize('role', [UserRole.ADMIN, UserRole.PRODUCAO, UserRole.PADRAO])
def test_scoped_roles_cannot_choose_another_organization_or_fall_back_to_global(role):
    own, other = uuid4(), uuid4()
    user = actor(role, own)
    assert scoped_organization_id(user, other) == own
    ensure_organization_access(user, own)
    with pytest.raises(HTTPException): ensure_organization_access(user, other)
    user.organization_id = None
    assert production_scope_is_empty(user)
    with pytest.raises(HTTPException): ensure_organization_access(user, None)


def test_admin_keeps_contract_and_analytics_access_without_global_scope():
    admin = User(role=UserRole.ADMIN)
    admin.permission_entries = [UserPermission(module=module, can_view=False, can_create=False, can_edit=False, can_delete=False)
                               for module in ('analytics', 'payment_processes')]
    assert admin.permissions['analytics']['can_view']
    assert admin.permissions['payment_processes']['can_view']
    assert not is_superuser(admin)


@pytest.mark.parametrize('operation', ['target_super', 'promote', 'cross_org', 'no_org'])
def test_admin_cannot_manage_superusers_or_move_users_outside_own_secretaria(operation):
    own, other = uuid4(), uuid4()
    admin = actor(UserRole.ADMIN, own)
    target = actor(UserRole.PADRAO, own)
    service = UserService(AsyncMock())
    if operation == 'target_super': target.role = UserRole.SUPERUSER
    if operation == 'cross_org': target.organization_id = other
    if operation == 'no_org': admin.organization_id = None
    with pytest.raises(HTTPException):
        service._authorize_change(admin, target=target, next_role=UserRole.SUPERUSER if operation == 'promote' else None)


@pytest.mark.parametrize('patch', [
    {'appearance': {'primary': 'red;display:none', 'sidebar': '#000000', 'density': 'compact'}},
    {'icons': {'fleet': '<script>'}}, {'icons': {'unknown': 'home'}},
    {'forms': {'vehicles': {'fields': {'plate': {'label': 'Placa', 'visible': False, 'required': True}}}}},
    {'forms': {'vehicles': {'fields': {'password': {'label': 'Senha'}}}}},
    {'forms': {'drivers': {'custom': [{'key': 'campo_1', 'label': 'A'}, {'key': 'campo_1', 'label': 'B'}]}}},
])
def test_settings_reject_executable_content_unknown_choices_and_hidden_identity(patch):
    values = deepcopy(DEFAULT_SETTINGS); values.update(patch)
    with pytest.raises(ValidationError): SettingsValues.model_validate(values)


def test_settings_accept_optional_hidden_fields_and_typed_custom_fields():
    values = deepcopy(DEFAULT_SETTINGS)
    values['forms'] = {'vehicles': {'fields': {'chassi': {'label': 'Chassi do veículo', 'visible': False}},
                                  'custom': [{'key': 'centro_custo', 'label': 'Centro de custo', 'required': True}]}}
    assert SettingsValues.model_validate(values).forms['vehicles'].custom[0].key == 'centro_custo'


def test_logo_must_reference_an_uploaded_asset():
    values = deepcopy(DEFAULT_SETTINGS); values['identity']['logoPath'] = 'https://external.test/logo.svg'
    with pytest.raises(ValidationError): SettingsValues.model_validate(values)


def test_identity_is_plain_text_and_cannot_introduce_report_markup():
    values = deepcopy(DEFAULT_SETTINGS)
    values['identity']['municipality'] = '<img src="file:///exemplo.png" />'
    with pytest.raises(ValidationError): SettingsValues.model_validate(values)


def test_clear_optional_field_is_allowed_but_financial_and_internal_fields_are_protected():
    assert normalize_changes(spec_for('drivers'), {'contato': None}) == {'contato': None}
    with pytest.raises(HTTPException): normalize_changes(spec_for('drivers'), {'nome_completo': None})
    with pytest.raises(HTTPException): normalize_changes(spec_for('fuel_supplies'), {'total_amount': 0})
    with pytest.raises(HTTPException): normalize_changes(spec_for('vehicle_loans'), {'status': 'DRAFT'})


def test_custom_fields_validate_real_types_and_required_values():
    values = deepcopy(DEFAULT_SETTINGS)
    values['forms']['drivers'] = {'custom': [{'key': 'checked', 'label': 'Conferido', 'type': 'boolean', 'required': True, 'active': True}]}
    publish_runtime(values)
    try:
        assert validate_custom('drivers', {'checked': False}, require_all=True) == {'checked': False}
        with pytest.raises(HTTPException): validate_custom('drivers', {'checked': 'false'}, require_all=True)
        with pytest.raises(HTTPException): validate_custom('drivers', {}, require_all=True)
        with pytest.raises(HTTPException): validate_custom('drivers', {'unknown': 1})
    finally: publish_runtime(DEFAULT_SETTINGS)


def test_station_permission_override_cannot_grant_global_analytics_or_user_administration():
    from app.core.permissions import apply_role_permission_ceiling
    flags = dict(can_view=True, can_create=True, can_edit=True, can_delete=True)
    assert not any(apply_role_permission_ceiling('POSTO', 'analytics', flags).values())
    assert apply_role_permission_ceiling('POSTO', 'fuel_supply_orders', flags) == dict(can_view=True, can_create=False, can_edit=True, can_delete=False)


def test_frozen_document_identity_survives_a_later_brand_change():
    from app.core import official_identity
    frozen = deepcopy(DEFAULT_SETTINGS)
    current = deepcopy(DEFAULT_SETTINGS); current['identity']['municipality'] = 'Prefeitura fictícia alterada'
    publish_runtime(current)
    try:
        assert official_identity.MUNICIPALITY_NAME == 'Prefeitura fictícia alterada'
        with official_identity.using_brand_snapshot(frozen):
            assert official_identity.MUNICIPALITY_NAME == frozen['identity']['municipality']
        assert official_identity.MUNICIPALITY_NAME == 'Prefeitura fictícia alterada'
    finally: publish_runtime(DEFAULT_SETTINGS)


@pytest.mark.asyncio
@pytest.mark.parametrize('method,path', [('get', '/api/system-settings'), ('put', '/api/system-settings'),
    ('get', '/api/record-admin/catalog'), ('get', '/api/record-admin/drivers'),
    ('get', '/api/record-admin/drivers/' + str(uuid4())), ('patch', '/api/record-admin/drivers/' + str(uuid4())),
    ('delete', '/api/record-admin/drivers/' + str(uuid4()))])
async def test_admin_cannot_access_settings_or_administrative_bypass_endpoints(method, path):
    app = FastAPI(); app.include_router(router); app.include_router(records_router)
    app.dependency_overrides[get_current_user_ready] = lambda: actor(UserRole.ADMIN, uuid4())
    app.dependency_overrides[get_db_session] = lambda: AsyncMock()
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.request(method, path, json={})
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_logo_upload_normalizes_an_image_but_does_not_publish_it(tmp_path, monkeypatch):
    import io
    from PIL import Image
    from starlette.datastructures import UploadFile
    from app.services.system_settings_service import SystemSettingsService, logo_file
    monkeypatch.setattr('app.services.system_settings_service.settings.STORAGE_DIR', tmp_path)
    audit = AsyncMock()
    monkeypatch.setattr('app.services.audit_service.AuditService.record', audit)
    content = io.BytesIO(); Image.new('RGB', (40, 40), 'blue').save(content, 'JPEG'); content.seek(0)
    before = deepcopy(DEFAULT_SETTINGS)
    publish_runtime(before)
    db = AsyncMock()
    response = await SystemSettingsService(db).upload_logo(UploadFile(content, filename='exemplo.jpg'), actor(UserRole.SUPERUSER))
    with Image.open(logo_file(response['logoPath'].rsplit('/', 1)[-1])) as image:
        assert image.format == 'PNG' and image.mode == 'RGBA'
    from app.services.system_settings_service import runtime_settings
    assert runtime_settings()['identity']['logoPath'] == before['identity']['logoPath']
    assert audit.await_count == 1 and db.commit.await_count == 1


@pytest.mark.asyncio
async def test_invalid_logo_is_rejected_without_creating_files(tmp_path, monkeypatch):
    import io
    from starlette.datastructures import UploadFile
    from app.services.system_settings_service import SystemSettingsService
    monkeypatch.setattr('app.services.system_settings_service.settings.STORAGE_DIR', tmp_path)
    with pytest.raises(HTTPException) as error:
        await SystemSettingsService(AsyncMock()).upload_logo(UploadFile(io.BytesIO(b'<svg onload="alert(1)"></svg>'), filename='invalido.png'), actor(UserRole.SUPERUSER))
    assert error.value.status_code == 422 and not list(tmp_path.iterdir())
