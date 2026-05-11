from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.driver import Driver, DriverLicenseCategory
from app.models.master_data import Organization
from app.models.user import User, UserRole
from app.schemas.driver import DriverCreate
from app.schemas.user import UserCreate
from app.services.driver_service import DriverService
from app.services.user_service import UserService


class FakeSession:
    def add(self, _entity):
        pass

    async def commit(self):
        pass

    async def rollback(self):
        pass

    async def flush(self):
        pass

    async def refresh(self, _entity):
        pass


class FakeAudit:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


class FakeMasterData:
    def __init__(self, organization):
        self.organization = organization

    async def get_organization(self, organization_id):
        if self.organization and self.organization.id == organization_id:
            return self.organization
        return None


class FakeUserRepository:
    def __init__(self):
        self.user = None

    async def get_by_email(self, _email):
        return None

    async def get_by_id(self, _user_id):
        return self.user

    async def create(self, user):
        user.id = uuid4()
        user.created_at = datetime.now(timezone.utc)
        user.updated_at = user.created_at
        self.user = user
        return user


class FakeDriverRepository:
    def __init__(self, driver=None):
        self.driver = driver

    async def get_by_id(self, _driver_id):
        return self.driver

    async def get_active_by_document(self, _documento, *, exclude_id=None):
        return None

    async def list_paginated(self, *, page, limit, search=None, active_only=None, organization_id=None):
        return ([self.driver] if self.driver else [], 1 if self.driver else 0)

    async def create(self, driver):
        driver.id = uuid4()
        driver.created_at = datetime.now(timezone.utc)
        driver.updated_at = driver.created_at
        self.driver = driver
        return driver


@pytest.mark.asyncio
async def test_user_create_links_secretaria_and_records_audit():
    organization = Organization(id=uuid4(), name="Secretaria de Saude")
    service = UserService(FakeSession())
    service.users = FakeUserRepository()
    service.master_data = FakeMasterData(organization)
    service.audit = FakeAudit()

    user = await service.create(
        UserCreate(
            name="Operador",
            email="operador@frota.local",
            organization_id=organization.id,
            password="Senha@123",
            role=UserRole.PADRAO,
        ),
        current_user=SimpleNamespace(id=uuid4(), email="admin@frota.local", role=UserRole.ADMIN),
    )

    assert user.organization_id == organization.id
    assert user.organization_name == organization.name
    assert service.audit.records[0]["details"]["organization_name"] == organization.name


@pytest.mark.asyncio
async def test_user_create_rejects_unknown_secretaria():
    service = UserService(FakeSession())
    service.users = FakeUserRepository()
    service.master_data = FakeMasterData(None)
    service.audit = FakeAudit()

    with pytest.raises(HTTPException) as exc:
        await service.create(
            UserCreate(
                name="Operador",
                email="operador@frota.local",
                organization_id=uuid4(),
                password="Senha@123",
                role=UserRole.PADRAO,
            ),
            current_user=SimpleNamespace(id=uuid4(), email="admin@frota.local", role=UserRole.ADMIN),
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_driver_create_links_secretaria_and_records_audit():
    organization = Organization(id=uuid4(), name="Secretaria de Infraestrutura")
    service = DriverService(FakeSession())
    service.drivers = FakeDriverRepository()
    service.master_data = FakeMasterData(organization)
    service.audit = FakeAudit()

    driver = await service.create(
        DriverCreate(
            nome_completo="Joao Motorista",
            documento="12345678900",
            organization_id=organization.id,
            contato=None,
            email=None,
            cnh_categoria=DriverLicenseCategory.B,
            cnh_validade=None,
        ),
        current_user=SimpleNamespace(id=uuid4(), email="admin@frota.local", role=UserRole.ADMIN),
    )

    assert driver["organization_id"] == organization.id
    assert driver["organization_name"] == organization.name
    assert service.audit.records[0]["details"]["organization_name"] == organization.name


@pytest.mark.asyncio
async def test_driver_list_returns_secretaria_name():
    organization = Organization(id=uuid4(), name="Secretaria de Administracao")
    driver = Driver(
        id=uuid4(),
        nome_completo="Maria Motorista",
        documento="98765432100",
        organization_id=organization.id,
        cnh_categoria=DriverLicenseCategory.D,
    )
    driver.organization = organization
    driver.ativo = True
    driver.created_at = datetime.now(timezone.utc)
    driver.updated_at = driver.created_at

    service = DriverService(FakeSession())
    service.drivers = FakeDriverRepository(driver)

    result = await service.list(page=1, limit=10, organization_id=organization.id)

    assert result.data[0]["organization_id"] == organization.id
    assert result.data[0]["organization_name"] == organization.name
