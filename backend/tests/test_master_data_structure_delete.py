from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.routes.master_data import require_structure_delete
from app.models.user import UserRole


@pytest.mark.parametrize('role', [UserRole.ADMIN, UserRole.PRODUCAO])
def test_admin_and_production_roles_can_delete_departments_and_allocations(role):
    user = SimpleNamespace(role=role)
    assert require_structure_delete(user) is user


@pytest.mark.parametrize('role', [UserRole.PADRAO, UserRole.POSTO])
def test_other_roles_cannot_delete_departments_or_allocations(role):
    with pytest.raises(HTTPException) as error:
        require_structure_delete(SimpleNamespace(role=role))
    assert error.value.status_code == 403
