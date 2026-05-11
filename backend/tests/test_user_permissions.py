from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.deps import require_permission
from app.core.permissions import default_permissions_for_role
from app.models.user_permission import UserPermission


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

    assert all(all(flags.values()) for flags in admin.values())
    assert producao["vehicles"]["can_create"] is True
    assert producao["vehicles"]["can_delete"] is False
    assert producao["fuel_supply_orders"]["can_edit"] is True
    assert posto["fuel_supply_orders"]["can_view"] is True
    assert posto["fuel_supply_orders"]["can_edit"] is True
    assert posto["vehicles"]["can_view"] is False
    assert all(not any(flags.values()) for flags in padrao.values())
