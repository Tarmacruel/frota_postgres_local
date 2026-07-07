from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.deps import get_current_user_ready


@pytest.mark.asyncio
async def test_get_current_user_ready_blocks_provisional_password():
    user = SimpleNamespace(must_change_password=True, cpf=None)

    with pytest.raises(HTTPException) as exc:
        await get_current_user_ready(user)

    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "PASSWORD_CHANGE_REQUIRED"


@pytest.mark.asyncio
async def test_get_current_user_ready_allows_regular_password():
    user = SimpleNamespace(must_change_password=False, cpf="52998224725")

    assert await get_current_user_ready(user) is user


@pytest.mark.asyncio
async def test_get_current_user_ready_blocks_missing_cpf_after_password_is_regular():
    user = SimpleNamespace(must_change_password=False, cpf=None)

    with pytest.raises(HTTPException) as exc:
        await get_current_user_ready(user)

    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "CPF_REQUIRED"
