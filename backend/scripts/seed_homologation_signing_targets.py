from __future__ import annotations

import asyncio
import os
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import or_, select, update
from sqlalchemy.engine import make_url


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.database import AsyncSessionFactory
from app.models.document_signature import (
    DigitalDocumentType,
    HomologationSigningTarget,
)
from app.models.driver import Driver, DriverLicenseCategory
from app.models.fuel_station import FuelStation
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department, Organization
from app.models.possession import VehiclePossession
from app.models.user import User, UserRole
from app.models.vehicle import (
    Vehicle,
    VehicleOwnershipType,
    VehicleStatus,
    VehicleType,
)


EXPECTED_HOST = "127.0.0.1"
EXPECTED_PORT = 5440
DATABASE_PATTERN = re.compile(r"^frota_hml(?:_[a-z0-9_]+)?$")
SYNTHETIC_ORGANIZATION = "HOMOLOGAÇÃO — DADOS SINTÉTICOS"
SYNTHETIC_DEPARTMENT = "Assinatura digital"
SYNTHETIC_ALLOCATION = "Caso controlado ICP-Brasil"
SYNTHETIC_PLATE = "HML0A01"
SYNTHETIC_CHASSIS = "HML00000000000001"
SYNTHETIC_DRIVER_DOCUMENT = "HML-ICP-001"
SYNTHETIC_USER_EMAIL = "emissor.icp@homologacao.invalid"
SYNTHETIC_USER_NAME = "EMISSOR SINTÉTICO — HOMOLOGAÇÃO"
# Hash bcrypt de um valor aleatório descartado: não existe credencial utilizável para esta conta.
SYNTHETIC_USER_PASSWORD_HASH = "$2b$12$Un5U2yXBIchmMIjSGntON.45Og11pJiF1rdF8ZFeN9xV0d3Dnsi02"
SYNTHETIC_STATION_NAME = "HOMOLOGAÇÃO — POSTO SINTÉTICO ICP-BRASIL"
SYNTHETIC_STATION_CNPJ = "00.000.000/0000-00"
SYNTHETIC_STATION_ADDRESS = "Área sintética sem operação comercial"
SYNTHETIC_STATION_PHONE = "(00) 0000-0000"
SYNTHETIC_ORDER_VALIDATION_CODE = "OA-HMLICP000001"
SYNTHETIC_ORDER_NOTES = (
    "HOMOLOGAÇÃO — ordem sintética exclusiva para testes de assinatura ICP-Brasil; "
    "sem validade operacional."
)
SYNTHETIC_REASON = "Caso sintético recriado pelo refresh da homologação"
FIXED_DELIVERY_AT = datetime(2026, 8, 17, 12, 0, tzinfo=timezone.utc)
FIXED_ORDER_EXPIRES_AT = datetime(2036, 8, 17, 12, 0, tzinfo=timezone.utc)


def require_isolated_refresh() -> None:
    url = make_url(settings.DATABASE_URL)
    database_name = str(url.database or "")
    if (
        settings.APP_ENV.strip().lower() != "homologation"
        or os.environ.get("HOMOLOGATION_REFRESH") != "1"
        or url.host != EXPECTED_HOST
        or url.port != EXPECTED_PORT
        or not DATABASE_PATTERN.fullmatch(database_name)
    ):
        raise RuntimeError(
            "Seed permitido somente pelo refresh da homologação isolada "
            "(APP_ENV=homologation, HOMOLOGATION_REFRESH=1 e "
            "127.0.0.1:5440/frota_hml*)."
        )


async def _ensure_organization(session) -> Organization:
    organization = await session.scalar(
        select(Organization).where(Organization.name == SYNTHETIC_ORGANIZATION)
    )
    if organization is None:
        organization = Organization(name=SYNTHETIC_ORGANIZATION)
        session.add(organization)
        await session.flush()
    return organization


async def _ensure_allocation(session, organization: Organization) -> Allocation:
    department = await session.scalar(
        select(Department).where(
            Department.organization_id == organization.id,
            Department.name == SYNTHETIC_DEPARTMENT,
        )
    )
    if department is None:
        department = Department(
            organization_id=organization.id,
            name=SYNTHETIC_DEPARTMENT,
        )
        session.add(department)
        await session.flush()
    allocation = await session.scalar(
        select(Allocation).where(
            Allocation.department_id == department.id,
            Allocation.name == SYNTHETIC_ALLOCATION,
        )
    )
    if allocation is None:
        allocation = Allocation(
            department_id=department.id,
            name=SYNTHETIC_ALLOCATION,
        )
        session.add(allocation)
        await session.flush()
    return allocation


async def _ensure_vehicle(session, allocation: Allocation) -> Vehicle:
    vehicle = await session.scalar(select(Vehicle).where(Vehicle.plate == SYNTHETIC_PLATE))
    if vehicle is None:
        vehicle = Vehicle(
            plate=SYNTHETIC_PLATE,
            chassis_number=SYNTHETIC_CHASSIS,
            brand="Veículo sintético",
            model="Caso ICP-Brasil",
            year="2026",
            color="Identificação HML",
            vehicle_type=VehicleType.SEDAN,
            ownership_type=VehicleOwnershipType.PROPRIO,
            status=VehicleStatus.ATIVO,
        )
        session.add(vehicle)
        await session.flush()
    elif vehicle.chassis_number != SYNTHETIC_CHASSIS:
        raise RuntimeError(
            "A placa reservada para homologação já pertence a um veículo não sintético."
        )
    history = await session.scalar(
        select(LocationHistory).where(
            LocationHistory.vehicle_id == vehicle.id,
            LocationHistory.end_date.is_(None),
        )
    )
    if history is None:
        session.add(
            LocationHistory(
                vehicle_id=vehicle.id,
                allocation_id=allocation.id,
                department=SYNTHETIC_ALLOCATION,
                justification="Vínculo sintético exclusivo da homologação",
                start_date=FIXED_DELIVERY_AT,
            )
        )
    elif history.allocation_id != allocation.id:
        raise RuntimeError("O veículo HML já possui vínculo ativo fora da área sintética.")
    return vehicle


async def _ensure_driver(session, organization: Organization) -> Driver:
    driver = await session.scalar(
        select(Driver).where(
            Driver.documento == SYNTHETIC_DRIVER_DOCUMENT,
            Driver.ativo.is_(True),
        )
    )
    if driver is None:
        driver = Driver(
            nome_completo="CONDUTOR SINTÉTICO — HOMOLOGAÇÃO",
            documento=SYNTHETIC_DRIVER_DOCUMENT,
            matricula="HML-ICP-001",
            cargo="Caso de teste sem validade operacional",
            organization_id=organization.id,
            contato="(00) 00000-0000",
            email="condutor.sintetico@homologacao.invalid",
            cnh_categoria=DriverLicenseCategory.B,
            ativo=True,
        )
        session.add(driver)
        await session.flush()
    elif (
        driver.organization_id != organization.id
        or driver.matricula != "HML-ICP-001"
        or driver.email != "condutor.sintetico@homologacao.invalid"
    ):
        raise RuntimeError("O documento sintético já está vinculado a outro cadastro ativo.")
    return driver


async def _ensure_possession(session, vehicle: Vehicle, driver: Driver) -> VehiclePossession:
    possession = await session.scalar(
        select(VehiclePossession).where(
            VehiclePossession.vehicle_id == vehicle.id,
            VehiclePossession.end_date.is_(None),
        )
    )
    if possession is None:
        possession = VehiclePossession(
            vehicle_id=vehicle.id,
            driver_id=driver.id,
            driver_name=driver.nome_completo,
            driver_document=driver.documento,
            driver_contact=driver.contato,
            start_date=FIXED_DELIVERY_AT,
            start_odometer_km=1000.0,
            observation=(
                "HOMOLOGAÇÃO — registro sintético exclusivo para testes de "
                "assinatura ICP-Brasil; sem validade operacional."
            ),
        )
        session.add(possession)
        await session.flush()
    elif possession.driver_id != driver.id:
        raise RuntimeError("O veículo HML possui posse ativa fora do caso sintético.")
    return possession


async def _ensure_synthetic_user(session, organization: Organization) -> User:
    user = await session.scalar(select(User).where(User.email == SYNTHETIC_USER_EMAIL))
    if user is None:
        user = User(
            name=SYNTHETIC_USER_NAME,
            email=SYNTHETIC_USER_EMAIL,
            organization_id=organization.id,
            cpf=None,
            password_hash=SYNTHETIC_USER_PASSWORD_HASH,
            must_change_password=True,
            role=UserRole.PRODUCAO,
        )
        session.add(user)
        await session.flush()
        return user

    if (
        user.name != SYNTHETIC_USER_NAME
        or user.organization_id != organization.id
        or user.cpf is not None
        or user.password_hash != SYNTHETIC_USER_PASSWORD_HASH
        or user.must_change_password is not True
        or user.role != UserRole.PRODUCAO
    ):
        raise RuntimeError(
            "O e-mail reservado para o emissor HML já pertence a um usuário não sintético."
        )
    return user


async def _ensure_synthetic_station(session) -> FuelStation:
    result = await session.scalars(
        select(FuelStation).where(
            or_(
                FuelStation.name == SYNTHETIC_STATION_NAME,
                FuelStation.cnpj == SYNTHETIC_STATION_CNPJ,
            )
        )
    )
    matches = list(result.all())
    if not matches:
        station = FuelStation(
            name=SYNTHETIC_STATION_NAME,
            cnpj=SYNTHETIC_STATION_CNPJ,
            address=SYNTHETIC_STATION_ADDRESS,
            phone=SYNTHETIC_STATION_PHONE,
            latitude=None,
            longitude=None,
            active=True,
        )
        session.add(station)
        await session.flush()
        return station

    if len(matches) != 1:
        raise RuntimeError("Os identificadores reservados do posto HML colidem com múltiplos cadastros.")
    station = matches[0]
    if (
        station.name != SYNTHETIC_STATION_NAME
        or station.cnpj != SYNTHETIC_STATION_CNPJ
        or station.address != SYNTHETIC_STATION_ADDRESS
        or station.phone != SYNTHETIC_STATION_PHONE
        or station.latitude is not None
        or station.longitude is not None
        or station.active is not True
    ):
        raise RuntimeError(
            "Um identificador reservado do posto HML já pertence a um cadastro não sintético."
        )
    return station


def _assert_synthetic_order(
    order: FuelSupplyOrder,
    *,
    organization: Organization,
    vehicle: Vehicle,
    driver: Driver,
    station: FuelStation,
    creator: User,
) -> None:
    status_value = getattr(order.status, "value", order.status)
    requested_liters = Decimal(str(order.requested_liters)) if order.requested_liters is not None else None
    if (
        order.vehicle_id != vehicle.id
        or order.driver_id != driver.id
        or order.organization_id != organization.id
        or order.fuel_station_id != station.id
        or order.created_by_user_id != creator.id
        or order.confirmed_by_user_id is not None
        or status_value != FuelSupplyOrderStatus.OPEN.value
        or order.expires_at != FIXED_ORDER_EXPIRES_AT
        or requested_liters != Decimal("40.000")
        or order.max_amount is not None
        or order.requester_contact is not None
        or order.notes != SYNTHETIC_ORDER_NOTES
        or order.confirmed_at is not None
        or order.created_at != FIXED_DELIVERY_AT
    ):
        raise RuntimeError(
            "O código reservado da ordem HML já pertence a um registro não sintético ou alterado."
        )


async def _ensure_fuel_order(
    session,
    *,
    organization: Organization,
    vehicle: Vehicle,
    driver: Driver,
    station: FuelStation,
    creator: User,
) -> FuelSupplyOrder:
    order = await session.scalar(
        select(FuelSupplyOrder).where(
            FuelSupplyOrder.validation_code == SYNTHETIC_ORDER_VALIDATION_CODE
        )
    )
    if order is None:
        order = FuelSupplyOrder(
            vehicle_id=vehicle.id,
            driver_id=driver.id,
            organization_id=organization.id,
            fuel_station_id=station.id,
            validation_code=SYNTHETIC_ORDER_VALIDATION_CODE,
            status=FuelSupplyOrderStatus.OPEN,
            expires_at=FIXED_ORDER_EXPIRES_AT,
            created_by_user_id=creator.id,
            confirmed_by_user_id=None,
            requested_liters=Decimal("40.000"),
            max_amount=None,
            requester_contact=None,
            notes=SYNTHETIC_ORDER_NOTES,
            confirmed_at=None,
            created_at=FIXED_DELIVERY_AT,
            updated_at=FIXED_DELIVERY_AT,
        )
        session.add(order)
        await session.flush()
        return order

    _assert_synthetic_order(
        order,
        organization=organization,
        vehicle=vehicle,
        driver=driver,
        station=station,
        creator=creator,
    )
    return order


async def _ensure_target(
    session,
    *,
    document_type: str,
    source_type: str,
    source_id,
    creator: User,
) -> HomologationSigningTarget:
    target = await session.scalar(
        select(HomologationSigningTarget).where(
            HomologationSigningTarget.document_type == document_type,
            HomologationSigningTarget.source_type == source_type,
            HomologationSigningTarget.source_id == source_id,
        )
    )
    if target is None:
        target = HomologationSigningTarget(
            document_type=document_type,
            source_type=source_type,
            source_id=source_id,
            reason=SYNTHETIC_REASON,
            is_active=True,
            created_by_user_id=creator.id,
        )
        session.add(target)
        return target

    if (
        target.reason != SYNTHETIC_REASON
        or target.created_by_user_id not in {None, creator.id}
    ):
        raise RuntimeError(
            "A origem sintética colide com uma autorização de assinatura não gerenciada pelo refresh HML."
        )
    target.reason = SYNTHETIC_REASON
    target.is_active = True
    target.expires_at = None
    target.created_by_user_id = creator.id
    return target


async def seed() -> None:
    require_isolated_refresh()
    async with AsyncSessionFactory() as session:
        async with session.begin():
            organization = await _ensure_organization(session)
            allocation = await _ensure_allocation(session, organization)
            vehicle = await _ensure_vehicle(session, allocation)
            driver = await _ensure_driver(session, organization)
            possession = await _ensure_possession(session, vehicle, driver)
            creator = await _ensure_synthetic_user(session, organization)
            station = await _ensure_synthetic_station(session)
            fuel_order = await _ensure_fuel_order(
                session,
                organization=organization,
                vehicle=vehicle,
                driver=driver,
                station=station,
                creator=creator,
            )

            await session.execute(
                update(HomologationSigningTarget).values(is_active=False)
            )
            await _ensure_target(
                session,
                document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
                source_type="POSSESSION",
                source_id=possession.id,
                creator=creator,
            )
            await _ensure_target(
                session,
                document_type=DigitalDocumentType.FUEL_SUPPLY_ORDER,
                source_type="FUEL_SUPPLY_ORDER",
                source_id=fuel_order.id,
                creator=creator,
            )

    print(
        "Casos sintéticos de assinatura recriados: "
        f"possession_id={possession.id} fuel_order_id={fuel_order.id} plate={SYNTHETIC_PLATE}"
    )


if __name__ == "__main__":
    asyncio.run(seed())
