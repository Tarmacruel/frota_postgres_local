from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.driver import Driver, DriverLicenseCategory
from app.models.master_data import Organization
from app.models.user import User, UserRole
from app.models.vehicle import VehicleOwnershipType, VehicleStatus, VehicleType
from app.schemas.driver import DriverCreate, DriverUpdate
from app.schemas.user import UserCreate
from app.schemas.vehicle import VehicleUpdate
from app.services.driver_service import DriverService
from app.services.master_data_service import MasterDataService
from app.services.possession_service import PossessionService
from app.services.user_service import UserService
from app.services.vehicle_service import VehicleService


class FakeSession:
    def add(self, _entity):
        pass

    async def commit(self):
        pass

    async def rollback(self):
        pass

    async def flush(self):
        pass

    async def refresh(self, _entity, *args, **kwargs):
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

    async def get_by_cpf(self, _cpf):
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
        self.last_organization_id = None

    async def get_by_id(self, _driver_id):
        return self.driver

    async def get_active_by_document(self, _documento, *, exclude_id=None):
        return None

    async def list_paginated(self, *, page, limit, search=None, active_only=None, organization_id=None):
        self.last_organization_id = organization_id
        return ([self.driver] if self.driver else [], 1 if self.driver else 0)

    async def create(self, driver):
        driver.id = uuid4()
        driver.created_at = datetime.now(timezone.utc)
        driver.updated_at = driver.created_at
        self.driver = driver
        return driver

    async def list_active(self, *, search=None, limit=100, organization_id=None):
        self.last_organization_id = organization_id
        return [self.driver] if self.driver else []


class FakeCatalogRepository:
    def __init__(self, organizations):
        self.organizations = organizations
        self.last_organization_id = None

    async def list_catalog(self, organization_id=None):
        self.last_organization_id = organization_id
        if organization_id:
            return [organization for organization in self.organizations if organization.id == organization_id]
        return self.organizations


class FakeAllocationRepository:
    def __init__(self, allocation):
        self.allocation = allocation

    async def get_allocation(self, allocation_id):
        if self.allocation.id == allocation_id:
            return self.allocation
        return None


class FakeVehicleRepository:
    def __init__(self, vehicle, active_history, transferred_history):
        self.vehicle = vehicle
        self.active_history = active_history
        self.transferred_history = transferred_history
        self.visibility_checks = []
        self.created_history = None

    async def get_by_id(self, _vehicle_id):
        return self.vehicle

    async def get_by_plate(self, _plate):
        return None

    async def is_vehicle_in_organization(self, _vehicle_id, organization_id):
        self.visibility_checks.append(organization_id)
        return len(self.visibility_checks) == 1

    async def get_active_history(self, _vehicle_id):
        return self.active_history

    async def create_history(self, history):
        self.created_history = history
        self.active_history = self.transferred_history

    async def get_active_possession(self, _vehicle_id):
        return None


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
                cpf="52998224725",
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
                cpf="52998224725",
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


@pytest.mark.asyncio
async def test_driver_list_for_producao_honors_requested_secretaria_filter():
    organization = Organization(id=uuid4(), name="Secretaria de Educacao")
    requested_organization_id = uuid4()
    driver = Driver(
        id=uuid4(),
        nome_completo="Carlos Motorista",
        documento="11122233344",
        organization_id=organization.id,
        cnh_categoria=DriverLicenseCategory.C,
    )
    driver.organization = organization
    driver.ativo = True
    driver.created_at = datetime.now(timezone.utc)
    driver.updated_at = driver.created_at

    service = DriverService(FakeSession())
    service.drivers = FakeDriverRepository(driver)
    current_user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=organization.id)

    result = await service.list(
        page=1,
        limit=10,
        organization_id=requested_organization_id,
        current_user=current_user,
    )

    assert service.drivers.last_organization_id == requested_organization_id
    assert result.data[0]["organization_id"] == organization.id


@pytest.mark.asyncio
async def test_driver_get_for_producao_allows_other_secretaria():
    driver = Driver(
        id=uuid4(),
        nome_completo="Ana Motorista",
        documento="55566677788",
        organization_id=uuid4(),
        cnh_categoria=DriverLicenseCategory.B,
    )
    driver.ativo = True
    driver.created_at = datetime.now(timezone.utc)
    driver.updated_at = driver.created_at

    service = DriverService(FakeSession())
    service.drivers = FakeDriverRepository(driver)
    current_user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=uuid4())

    result = await service.get(driver.id, current_user=current_user)

    assert result["id"] == driver.id
    assert result["organization_id"] == driver.organization_id


@pytest.mark.asyncio
async def test_driver_get_for_producao_without_secretaria_rejects_access():
    driver = Driver(
        id=uuid4(),
        nome_completo="Ana Motorista",
        documento="55566677788",
        organization_id=uuid4(),
        cnh_categoria=DriverLicenseCategory.B,
    )
    driver.ativo = True
    driver.created_at = datetime.now(timezone.utc)
    driver.updated_at = driver.created_at

    service = DriverService(FakeSession())
    service.drivers = FakeDriverRepository(driver)
    current_user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=None)

    with pytest.raises(HTTPException) as exc:
        await service.get(driver.id, current_user=current_user)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_driver_create_for_producao_allows_other_secretaria():
    user_organization_id = uuid4()
    target_organization = Organization(id=uuid4(), name="Secretaria de Agricultura")
    service = DriverService(FakeSession())
    service.drivers = FakeDriverRepository()
    service.master_data = FakeMasterData(target_organization)
    service.audit = FakeAudit()

    driver = await service.create(
        DriverCreate(
            nome_completo="Cassio de Oliveira Farias",
            documento="22233344455",
            organization_id=target_organization.id,
            contato=None,
            email=None,
            cnh_categoria=DriverLicenseCategory.B,
            cnh_validade=None,
        ),
        current_user=SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=user_organization_id),
    )

    assert driver["organization_id"] == target_organization.id
    assert driver["organization_name"] == target_organization.name


@pytest.mark.asyncio
async def test_driver_update_for_producao_allows_other_secretaria():
    source_organization = Organization(id=uuid4(), name="Secretaria de Chefia de Governo")
    target_organization = Organization(id=uuid4(), name="Secretaria de Educacao")
    driver = Driver(
        id=uuid4(),
        nome_completo="Maria Motorista",
        documento="77788899900",
        organization_id=source_organization.id,
        cnh_categoria=DriverLicenseCategory.B,
    )
    driver.organization = source_organization
    driver.ativo = True
    driver.created_at = datetime.now(timezone.utc)
    driver.updated_at = driver.created_at

    service = DriverService(FakeSession())
    service.drivers = FakeDriverRepository(driver)
    service.master_data = FakeMasterData(target_organization)
    service.audit = FakeAudit()

    result = await service.update(
        driver.id,
        DriverUpdate(organization_id=target_organization.id),
        current_user=SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=uuid4()),
    )

    assert result["organization_id"] == target_organization.id
    assert result["organization_name"] == target_organization.name


@pytest.mark.asyncio
async def test_master_data_catalog_include_all_for_producao_returns_all_secretarias():
    user_organization = Organization(id=uuid4(), name="Chefia de Governo")
    other_organization = Organization(id=uuid4(), name="Secretaria de Educacao")
    repository = FakeCatalogRepository([user_organization, other_organization])
    service = MasterDataService(FakeSession())
    service.repo = repository
    current_user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=user_organization.id)

    scoped = await service.get_catalog(current_user=current_user)
    assert repository.last_organization_id == user_organization.id
    assert scoped["organizations"] == [user_organization]

    global_catalog = await service.get_catalog(current_user=current_user, include_all=True)
    assert repository.last_organization_id is None
    assert global_catalog["organizations"] == [user_organization, other_organization]


@pytest.mark.asyncio
async def test_possession_driver_snapshot_allows_driver_from_other_secretaria():
    driver = Driver(
        id=uuid4(),
        nome_completo="Cassio de Oliveira Farias",
        documento="22233344455",
        organization_id=uuid4(),
        contato="73999990000",
        cnh_categoria=DriverLicenseCategory.B,
    )
    driver.ativo = True
    service = PossessionService(db=None)
    service.drivers = FakeDriverRepository(driver)

    snapshot = await service._resolve_driver_snapshot(
        driver_id=driver.id,
        fallback_name="Nao usado",
        fallback_document=None,
        fallback_contact=None,
        current_user=SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=uuid4()),
    )

    assert snapshot["driver_id"] == driver.id
    assert snapshot["driver_name"] == driver.nome_completo
    assert snapshot["driver_document"] == driver.documento
    assert snapshot["driver_contact"] == driver.contato


@pytest.mark.asyncio
async def test_vehicle_update_for_producao_allows_transfer_to_other_secretaria_without_post_commit_visibility_check():
    source_organization_id = uuid4()
    target_organization_id = uuid4()
    now = datetime.now(timezone.utc)
    vehicle = SimpleNamespace(
        id=uuid4(),
        plate="TNY8H83",
        chassis_number=None,
        renavam=None,
        brand="VW",
        model="Saveiro",
        year=None,
        prefix=None,
        patrimonio_numero_frota=None,
        color=None,
        fuel_type=None,
        tank_capacity_liters=None,
        transmission=None,
        city=None,
        state=None,
        registered_detran=None,
        engine_spec=None,
        is_provisional=False,
        provisional_source=None,
        vehicle_type=VehicleType.PICAPE,
        ownership_type=VehicleOwnershipType.PROPRIO,
        status=VehicleStatus.ATIVO,
        created_at=now,
        updated_at=now,
    )
    initial_allocation = SimpleNamespace(
        id=uuid4(),
        organization_id=source_organization_id,
        department_id=uuid4(),
        name="Chefia de Governo",
        display_name="Chefia de Governo - Chefia de Governo - Chefia de Governo",
    )
    target_allocation = SimpleNamespace(
        id=uuid4(),
        organization_id=target_organization_id,
        department_id=uuid4(),
        name="Garagem",
        display_name="Secretaria de Educacao - Transporte Escolar - Garagem",
    )
    initial_history = SimpleNamespace(
        allocation=initial_allocation,
        allocation_id=initial_allocation.id,
        organization_name="Chefia de Governo",
        department_name="Chefia de Governo",
        allocation_name="Chefia de Governo",
        display_name=initial_allocation.display_name,
        end_date=None,
    )
    transferred_history = SimpleNamespace(
        allocation=target_allocation,
        allocation_id=target_allocation.id,
        organization_name="Secretaria de Educacao",
        department_name="Transporte Escolar",
        allocation_name="Garagem",
        display_name=target_allocation.display_name,
        end_date=None,
    )
    service = VehicleService(FakeSession())
    service.vehicles = FakeVehicleRepository(vehicle, initial_history, transferred_history)
    service.master_data = FakeAllocationRepository(target_allocation)
    service.audit = FakeAudit()

    result = await service.update(
        vehicle.id,
        VehicleUpdate(
            allocation_id=target_allocation.id,
            edit_reason="Devolucao formal para Educacao",
        ),
        current_user=SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=source_organization_id),
    )

    assert service.vehicles.visibility_checks == [source_organization_id]
    assert service.vehicles.created_history.allocation_id == target_allocation.id
    assert result["current_location"]["organization_id"] == target_organization_id
