from __future__ import annotations

import asyncio
from sqlalchemy import select
from app.core.database import AsyncSessionFactory
from app.core.security import get_password_hash
from app.models.location_history import LocationHistory
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle, VehicleStatus


async def seed() -> None:
    async with AsyncSessionFactory() as session:
        async with session.begin():
            admin = await session.scalar(select(User).where(User.email == "admin@frota.local"))
            if not admin:
                session.add(
                    User(
                        name="Administrador",
                        email="admin@frota.local",
                        password_hash=get_password_hash("Admin@1234"),
                        role=UserRole.ADMIN,
                    )
                )

            standard = await session.scalar(select(User).where(User.email == "padrao@frota.local"))
            if not standard:
                session.add(
                    User(
                        name="Usuário Padrão",
                        email="padrao@frota.local",
                        password_hash=get_password_hash("User@1234"),
                        role=UserRole.PADRAO,
                    )
                )

            vehicles_data = [
                ("ABC-1D23", "Ford", "Ka", VehicleStatus.ATIVO, "Secretaria de Administração"),
                ("DEF-4E56", "Chevrolet", "Onix", VehicleStatus.MANUTENCAO, "Oficina Central"),
                ("GHI-7F89", "Toyota", "Corolla", VehicleStatus.INATIVO, "Pátio Municipal"),
            ]

            for plate, brand, model, status, department in vehicles_data:
                existing = await session.scalar(select(Vehicle).where(Vehicle.plate == plate))
                if not existing:
                    vehicle = Vehicle(plate=plate, brand=brand, model=model, status=status)
                    session.add(vehicle)
                    await session.flush()
                    session.add(LocationHistory(vehicle_id=vehicle.id, department=department))

    print("Seed concluído com sucesso.")


if __name__ == "__main__":
    asyncio.run(seed())
