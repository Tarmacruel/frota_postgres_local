from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.cpf import mask_cpf, normalize_cpf
from app.schemas.auth import RegisterCpfInput
from app.services.auth_service import AuthService


class FakeSession:
    def __init__(self):
        self.flushed = False
        self.committed = False

    async def flush(self):
        self.flushed = True

    async def commit(self):
        self.committed = True


class FakeUsers:
    def __init__(self, duplicate=None):
        self.duplicate = duplicate

    async def get_by_cpf(self, _cpf):
        return self.duplicate


class FakeAudit:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


def test_normalize_cpf_accepts_masked_valid_value():
    assert normalize_cpf("529.982.247-25") == "52998224725"
    assert mask_cpf("52998224725") == "529.***.***-25"


@pytest.mark.parametrize("cpf", ["11111111111", "123", "52998224724"])
def test_register_cpf_input_rejects_invalid_values(cpf):
    with pytest.raises(ValidationError):
        RegisterCpfInput(cpf=cpf)


@pytest.mark.asyncio
async def test_register_cpf_saves_normalized_unique_value_and_audit_mask():
    db = FakeSession()
    service = AuthService(db)
    service.users = FakeUsers()
    service.audit = FakeAudit()
    user = SimpleNamespace(id=uuid4(), email="user@frota.local", cpf=None, cpf_masked=None)

    await service.register_cpf(user=user, data=RegisterCpfInput(cpf="529.982.247-25"))

    assert user.cpf == "52998224725"
    assert db.flushed is True
    assert db.committed is True
    assert service.audit.records[0]["details"]["cpf_masked"] == "529.***.***-25"


@pytest.mark.asyncio
async def test_register_cpf_rejects_duplicate_value():
    db = FakeSession()
    service = AuthService(db)
    duplicate = SimpleNamespace(id=uuid4())
    service.users = FakeUsers(duplicate=duplicate)
    service.audit = FakeAudit()
    user = SimpleNamespace(id=uuid4(), email="user@frota.local", cpf=None, cpf_masked=None)

    with pytest.raises(HTTPException) as exc:
        await service.register_cpf(user=user, data=RegisterCpfInput(cpf="52998224725"))

    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_register_cpf_rejects_user_that_already_has_cpf():
    db = FakeSession()
    service = AuthService(db)
    service.users = FakeUsers()
    service.audit = FakeAudit()
    user = SimpleNamespace(id=uuid4(), email="user@frota.local", cpf="52998224725", cpf_masked="529.***.***-25")

    with pytest.raises(HTTPException) as exc:
        await service.register_cpf(user=user, data=RegisterCpfInput(cpf="12345678909"))

    assert exc.value.status_code == 409
