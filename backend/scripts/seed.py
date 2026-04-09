from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from app.core.database import AsyncSessionFactory
from app.core.security import get_password_hash
from app.models.location_history import LocationHistory
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleStatus


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

            vehicles_data = [
                ("ABC-1D23", "Ford", "Ka", VehicleStatus.ATIVO, "Secretaria de Administracao"),
                ("DEF-4E56", "Chevrolet", "Onix", VehicleStatus.MANUTENCAO, "Oficina Central"),
                ("GHI-7F89", "Toyota", "Corolla", VehicleStatus.INATIVO, "Patio Municipal"),
            ]

            for plate, brand, model, status, department in vehicles_data:
                existing = await session.scalar(select(Vehicle).where(Vehicle.plate == plate))
                if not existing:
                    vehicle = Vehicle(plate=plate, brand=brand, model=model, status=status)
                    session.add(vehicle)
                    await session.flush()
                    session.add(LocationHistory(vehicle_id=vehicle.id, department=department))

            await session.flush()

            vehicle_map = {
                vehicle.plate: vehicle
                for vehicle in (await session.scalars(select(Vehicle).order_by(Vehicle.created_at.asc()))).all()
            }

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
                            driver_name="Joao Silva",
                            driver_document="123.456.789-00",
                            driver_contact="(11) 99999-8888",
                            observation="Motorista designado para rota norte",
                        ),
                        VehiclePossession(
                            vehicle_id=vehicle_map["GHI-7F89"].id,
                            driver_name="Maria Oliveira",
                            driver_document="987.654.321-00",
                            driver_contact="(11) 98888-7777",
                            end_date=datetime.now(timezone.utc) - timedelta(days=5),
                            observation="Posse temporaria para treinamento",
                        ),
                    ]
                )

    print("Seed concluido com sucesso.")


if __name__ == "__main__":
    asyncio.run(seed())
