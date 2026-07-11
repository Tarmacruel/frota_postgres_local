from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import require_admin, require_permission
from app.core.permissions import default_permissions_for_role
from app.models.user import User, UserRole
from app.models.user_permission import UserPermission
from app.services.user_service import UserService


class FakeResult:
    def __init__(self, permission):
        self.permission = permission

    def scalar_one_or_none(self):
        return self.permission


class FakePermissionSession:
    def __init__(self, permission):
        self.permission = permission

    async def execute(self, _statement):
        return FakeResult(self.permission)


@pytest.mark.asyncio
async def test_production_role_cannot_access_admin_operation():
    with pytest.raises(HTTPException) as exc:
        await require_admin(current_user=SimpleNamespace(role=UserRole.PRODUCAO))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_permission_allows_enabled_action():
    user_id = uuid4()
    permission = UserPermission(user_id=user_id, module="vehicles", can_view=True)
    dependency = require_permission("vehicles", "view")

    current_user = SimpleNamespace(id=user_id, must_change_password=False)

    assert await dependency(db=FakePermissionSession(permission), current_user=current_user) is current_user


@pytest.mark.asyncio
async def test_require_permission_blocks_disabled_action():
    user_id = uuid4()
    permission = UserPermission(user_id=user_id, module="vehicles", can_view=True, can_create=False)
    dependency = require_permission("vehicles", "create")

    with pytest.raises(HTTPException) as exc:
        await dependency(db=FakePermissionSession(permission), current_user=SimpleNamespace(id=user_id))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_permission_blocks_missing_permission():
    dependency = require_permission("vehicles", "view")

    with pytest.raises(HTTPException) as exc:
        await dependency(db=FakePermissionSession(None), current_user=SimpleNamespace(id=uuid4()))

    assert exc.value.status_code == 403


def test_default_permissions_preserve_current_roles():
    admin = default_permissions_for_role("ADMIN")
    producao = default_permissions_for_role("PRODUCAO")
    posto = default_permissions_for_role("POSTO")
    padrao = default_permissions_for_role("PADRAO")

    assert all(all(flags.values()) for module, flags in admin.items() if module != "possession")
    assert admin["possession"] == {"can_view": True, "can_create": True, "can_edit": True, "can_delete": False}
    assert producao["vehicles"]["can_create"] is True
    assert producao["vehicles"]["can_delete"] is False
    assert producao["data_imports"]["can_view"] is True
    assert producao["data_imports"]["can_create"] is True
    assert producao["data_imports"]["can_edit"] is True
    assert producao["data_imports"]["can_delete"] is False
    assert producao["payment_processes"]["can_view"] is True
    assert producao["payment_processes"]["can_create"] is True
    assert producao["payment_processes"]["can_edit"] is True
    assert producao["payment_processes"]["can_delete"] is False
    assert producao["fuel_supply_orders"]["can_edit"] is True
    assert posto["fuel_supply_orders"]["can_view"] is True
    assert posto["fuel_supply_orders"]["can_edit"] is True
    assert posto["vehicles"]["can_view"] is False
    assert padrao["possession"] == {"can_view": True, "can_create": False, "can_edit": False, "can_delete": False}
    assert all(not any(flags.values()) for module, flags in padrao.items() if module != "possession")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("role", "action"),
    [
        (UserRole.ADMIN, "delete"),
        (UserRole.PRODUCAO, "delete"),
        (UserRole.PADRAO, "create"),
        (UserRole.POSTO, "view"),
    ],
)
async def test_possession_permission_entry_cannot_exceed_role_ceiling(role, action):
    user_id = uuid4()
    permission = UserPermission(
        user_id=user_id,
        module="possession",
        can_view=True,
        can_create=True,
        can_edit=True,
        can_delete=True,
    )
    dependency = require_permission("possession", action)

    with pytest.raises(HTTPException) as exc:
        await dependency(
            db=FakePermissionSession(permission),
            current_user=SimpleNamespace(id=user_id, role=role),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_production_possession_permission_can_be_restricted_by_override():
    user_id = uuid4()
    permission = UserPermission(user_id=user_id, module="possession", can_view=False)
    dependency = require_permission("possession", "view")

    with pytest.raises(HTTPException) as exc:
        await dependency(
            db=FakePermissionSession(permission),
            current_user=SimpleNamespace(id=user_id, role=UserRole.PRODUCAO),
        )

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_require_permission_falls_back_to_role_default_when_entry_is_missing():
    dependency = require_permission("vehicles", "view")
    current_user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO)

    assert await dependency(db=FakePermissionSession(None), current_user=current_user) is current_user


def test_user_permissions_fill_missing_modules_from_role_defaults():
    user = User(
        id=uuid4(),
        name="Producao",
        email="producao@frota.local",
        password_hash="hash",
        role=UserRole.PRODUCAO,
    )
    user.permission_entries = []

    assert user.permissions["vehicles"]["can_view"] is True
    assert user.permissions["data_imports"]["can_view"] is True
    assert user.permissions["data_imports"]["can_edit"] is True


def test_user_permissions_apply_possession_ceiling_to_saved_override():
    user_id = uuid4()
    user = User(
        id=user_id,
        name="Consulta",
        email="consulta@frota.local",
        password_hash="hash",
        role=UserRole.PADRAO,
    )
    user.permission_entries = [
        UserPermission(
            user_id=user_id,
            module="possession",
            can_view=True,
            can_create=True,
            can_edit=True,
            can_delete=True,
        )
    ]

    assert user.permissions["possession"] == {
        "can_view": True,
        "can_create": False,
        "can_edit": False,
        "can_delete": False,
    }


class FakeUserResult:
    def __init__(self, entries):
        self.entries = entries

    def scalars(self):
        return self

    def all(self):
        return self.entries


class FakeUserUpdateSession:
    def __init__(self, permission_entries):
        self.permission_entries = permission_entries
        self.added = []
        self.committed = False

    def add(self, entity):
        self.added.append(entity)
        if isinstance(entity, UserPermission):
            self.permission_entries.append(entity)

    async def execute(self, _statement):
        return FakeUserResult(self.permission_entries)

    async def flush(self):
        pass

    async def refresh(self, _entity):
        pass

    async def commit(self):
        self.committed = True

    async def rollback(self):
        pass


class FakeUserUpdateRepository:
    def __init__(self, user):
        self.user = user

    async def get_by_id(self, _user_id):
        return self.user

    async def get_by_email(self, _email):
        return None


class FakeAudit:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


@pytest.mark.asyncio
async def test_user_update_role_to_producao_resets_default_permissions():
    user_id = uuid4()
    user = User(
        id=user_id,
        name="Operador",
        email="operador@frota.local",
        password_hash="hash",
        role=UserRole.PADRAO,
    )
    user.permission_entries = [
        UserPermission(user_id=user_id, module="vehicles", can_view=False, can_create=False, can_edit=False, can_delete=False),
        UserPermission(user_id=user_id, module="data_imports", can_view=False, can_create=False, can_edit=False, can_delete=False),
    ]
    service = UserService(FakeUserUpdateSession(user.permission_entries))
    service.users = FakeUserUpdateRepository(user)
    service.audit = FakeAudit()

    await service.update(
        user_id,
        SimpleNamespace(model_dump=lambda exclude_unset=True: {"role": UserRole.PRODUCAO}),
        current_user=SimpleNamespace(id=uuid4(), role=UserRole.ADMIN),
    )

    permissions = {entry.module: entry for entry in user.permission_entries}
    assert permissions["vehicles"].can_view is True
    assert permissions["vehicles"].can_create is True
    assert permissions["data_imports"].can_view is True
    assert permissions["data_imports"].can_edit is True
    assert permissions["data_imports"].can_delete is False
    assert service.db.committed is True
