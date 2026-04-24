from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.database import AsyncSessionFactory
from app.core.security import get_password_hash
from app.models.claim import Claim, ClaimStatus, ClaimType
from app.models.driver import Driver, DriverLicenseCategory
from app.models.fuel_station import FuelStation, FuelStationUser
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.master_data import Allocation, Department, Organization
from app.models.possession import VehiclePossession
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleOwnershipType, VehicleStatus


async def seed() -> None:
    async with AsyncSessionFactory() as session:
        async with session.begin():
            admin = await session.scalar(select(User).where(User.email == "admin@frota.local"))
            if not admin:
                admin = User(
                    name="Administrador",
                    email="admin@frota.local",
                    password_hash=get_password_hash("Admin@1234"),
                    role=UserRole.ADMIN,
                )
                session.add(admin)

            standard = await session.scalar(select(User).where(User.email == "padrao@frota.local"))
            if not standard:
                standard = User(
                    name="Usuario Padrao",
                    email="padrao@frota.local",
                    password_hash=get_password_hash("User@1234"),
                    role=UserRole.PADRAO,
                )
                session.add(standard)

            production = await session.scalar(select(User).where(User.email == "producao@frota.local"))
            if not production:
                production = User(
                    name="Usuario de Producao",
                    email="producao@frota.local",
                    password_hash=get_password_hash("Producao@1234"),
                    role=UserRole.PRODUCAO,
                )
                session.add(production)

            gas_station = await session.scalar(select(User).where(User.email == "posto@frota.local"))
            if not gas_station:
                gas_station = User(
                    name="Operador de Posto",
                    email="posto@frota.local",
                    password_hash=get_password_hash("Posto@1234"),
                    role=UserRole.POSTO,
                )
                session.add(gas_station)

            fuel_station = await session.scalar(select(FuelStation).where(FuelStation.name == "Posto Centro"))
            if not fuel_station:
                fuel_station = FuelStation(
                    name="Posto Centro",
                    cnpj="12.345.678/0001-90",
                    address="Avenida Principal, 1000 - Centro",
                    active=True,
                )
                session.add(fuel_station)
                await session.flush()

            await session.flush()

            if gas_station and fuel_station:
                station_link = await session.scalar(
                    select(FuelStationUser).where(
                        FuelStationUser.user_id == gas_station.id,
                        FuelStationUser.fuel_station_id == fuel_station.id,
                    )
                )
                if not station_link:
                    session.add(FuelStationUser(user_id=gas_station.id, fuel_station_id=fuel_station.id, active=True))

            async def ensure_organization(name: str) -> Organization:
                organization = await session.scalar(select(Organization).where(Organization.name == name))
                if organization:
                    return organization
                organization = Organization(name=name)
                session.add(organization)
                await session.flush()
                return organization

            async def ensure_department(organization: Organization, name: str) -> Department:
                department = await session.scalar(
                    select(Department).where(Department.organization_id == organization.id, Department.name == name)
                )
                if department:
                    return department
                department = Department(organization_id=organization.id, name=name)
                session.add(department)
                await session.flush()
                return department

            async def ensure_allocation(department: Department, name: str) -> Allocation:
                allocation = await session.scalar(
                    select(Allocation).where(Allocation.department_id == department.id, Allocation.name == name)
                )
                if allocation:
                    return allocation
                allocation = Allocation(department_id=department.id, name=name)
                session.add(allocation)
                await session.flush()
                return allocation

            admin_org = await ensure_organization("Secretaria de Administracao")
            admin_dep = await ensure_department(admin_org, "Gestao Administrativa")
            admin_alloc = await ensure_allocation(admin_dep, "Garagem Central")

            works_org = await ensure_organization("Secretaria de Infraestrutura")
            works_dep = await ensure_department(works_org, "Oficina")
            works_alloc = await ensure_allocation(works_dep, "Oficina Central")

            health_org = await ensure_organization("Secretaria de Saude")
            health_dep = await ensure_department(health_org, "Transporte")
            health_alloc = await ensure_allocation(health_dep, "Patio Municipal")

            vehicles_data = [
                ("ABC-1D23", "9BFZH55L0G1234567", "Ford", "Ka", VehicleOwnershipType.PROPRIO, VehicleStatus.ATIVO, admin_alloc),
                ("DEF-4E56", "9BWZZZ377VT004251", "Chevrolet", "Onix", VehicleOwnershipType.LOCADO, VehicleStatus.MANUTENCAO, works_alloc),
                ("GHI-7F89", "8AWZZZ6K2VA012345", "Toyota", "Corolla", VehicleOwnershipType.CEDIDO, VehicleStatus.INATIVO, health_alloc),
            ]

            for plate, chassis_number, brand, model, ownership_type, status, allocation in vehicles_data:
                existing = await session.scalar(select(Vehicle).where(Vehicle.plate == plate))
                if existing:
                    changed = False
                    if not existing.chassis_number:
                        existing.chassis_number = chassis_number
                        changed = True
                    if not existing.ownership_type:
                        existing.ownership_type = ownership_type
                        changed = True

                    active_history = await session.scalar(
                        select(LocationHistory)
                        .where(LocationHistory.vehicle_id == existing.id, LocationHistory.end_date.is_(None))
                        .order_by(LocationHistory.start_date.desc())
                    )
                    if active_history and not active_history.allocation_id:
                        active_history.allocation_id = allocation.id
                        active_history.department = allocation.display_name
                        changed = True

                    if changed:
                        await session.flush()
                    continue

                vehicle = Vehicle(
                    plate=plate,
                    chassis_number=chassis_number,
                    brand=brand,
                    model=model,
                    ownership_type=ownership_type,
                    status=status,
                )
                session.add(vehicle)
                await session.flush()
                session.add(
                    LocationHistory(
                        vehicle_id=vehicle.id,
                        allocation_id=allocation.id,
                        department=allocation.display_name,
                    )
                )

            await session.flush()

            vehicle_map = {
                vehicle.plate: vehicle
                for vehicle in (await session.scalars(select(Vehicle).order_by(Vehicle.created_at.asc()))).all()
            }

            drivers_data = [
                ("Joao Silva", "123.456.789-00", "(11) 99999-8888", "joao.silva@pmtf.local", DriverLicenseCategory.B, datetime.now(timezone.utc).date() + timedelta(days=400)),
                ("Maria Oliveira", "987.654.321-00", "(11) 98888-7777", "maria.oliveira@pmtf.local", DriverLicenseCategory.D, datetime.now(timezone.utc).date() + timedelta(days=240)),
                ("Carlos Souza", "456.123.789-55", "(11) 97777-6666", None, DriverLicenseCategory.C, None),
            ]

            driver_map: dict[str, Driver] = {}
            for nome, documento, contato, email, categoria, validade in drivers_data:
                driver = await session.scalar(select(Driver).where(Driver.documento == documento))
                if not driver:
                    driver = Driver(
                        nome_completo=nome,
                        documento=documento,
                        contato=contato,
                        email=email,
                        cnh_categoria=categoria,
                        cnh_validade=validade,
                    )
                    session.add(driver)
                    await session.flush()
                driver_map[documento] = driver

            has_maintenance = await session.scalar(select(MaintenanceRecord.id).limit(1))
            if not has_maintenance and admin:
                session.add_all(
                    [
                        MaintenanceRecord(
                            vehicle_id=vehicle_map["ABC-1D23"].id,
                            start_date=datetime.now(timezone.utc) - timedelta(days=10),
                            end_date=datetime.now(timezone.utc) - timedelta(days=7),
                            service_description="Troca de oleo e filtros",
                            parts_replaced="Filtro de oleo, filtro de ar, oleo 5W30",
                            total_cost=Decimal("285.50"),
                            created_by=admin.id,
                        ),
                        MaintenanceRecord(
                            vehicle_id=vehicle_map["DEF-4E56"].id,
                            start_date=datetime.now(timezone.utc) - timedelta(days=3),
                            service_description="Revisao de freios em andamento",
                            parts_replaced="Pastilhas de freio dianteiras",
                            total_cost=Decimal("420.00"),
                            created_by=admin.id,
                        ),
                    ]
                )

            has_possession = await session.scalar(select(VehiclePossession.id).limit(1))
            if not has_possession:
                session.add_all(
                    [
                        VehiclePossession(
                            vehicle_id=vehicle_map["ABC-1D23"].id,
                            driver_id=driver_map["123.456.789-00"].id,
                            driver_name="Joao Silva",
                            driver_document="123.456.789-00",
                            driver_contact="(11) 99999-8888",
                            observation="Motorista designado para rota norte",
                        ),
                        VehiclePossession(
                            vehicle_id=vehicle_map["GHI-7F89"].id,
                            driver_id=driver_map["987.654.321-00"].id,
                            driver_name="Maria Oliveira",
                            driver_document="987.654.321-00",
                            driver_contact="(11) 98888-7777",
                            end_date=datetime.now(timezone.utc) - timedelta(days=5),
                            observation="Posse temporaria para treinamento",
                        ),
                    ]
                )

            has_claims = await session.scalar(select(Claim.id).limit(1))
            if not has_claims and admin:
                session.add(
                    Claim(
                        vehicle_id=vehicle_map["DEF-4E56"].id,
                        driver_id=None,
                        data_ocorrencia=datetime.now(timezone.utc) - timedelta(days=2),
                        tipo=ClaimType.AVARIA,
                        descricao="Avaria registrada durante deslocamento para oficina, com dano lateral e necessidade de avaliacao tecnica.",
                        local="Avenida Principal, proximo ao patio municipal",
                        boletim_ocorrencia="BO-2026-001",
                        valor_estimado=Decimal("1850.00"),
                        status=ClaimStatus.EM_ANALISE,
                        anexos=["foto-lateral.jpg"],
                        created_by=admin.id,
                    )
                )

            has_supply_order = await session.scalar(select(FuelSupplyOrder.id).limit(1))
            if not has_supply_order and admin and fuel_station:
                session.add(
                    FuelSupplyOrder(
                        vehicle_id=vehicle_map["ABC-1D23"].id,
                        driver_id=driver_map["123.456.789-00"].id,
                        organization_id=admin_org.id,
                        fuel_station_id=fuel_station.id,
                        created_by_user_id=admin.id,
                        expires_at=datetime.now(timezone.utc) + timedelta(hours=8),
                        requested_liters=Decimal("45.000"),
                        max_amount=Decimal("320.00"),
                        notes="Ordem inicial de abastecimento para validacao local do fluxo de posto.",
                        status=FuelSupplyOrderStatus.OPEN,
                    )
                )

    print("Seed concluido com sucesso.")


if __name__ == "__main__":
    asyncio.run(seed())
