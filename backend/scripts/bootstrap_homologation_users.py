from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.core.database import AsyncSessionFactory
from app.core.security import get_password_hash
from app.models.fuel_station import FuelStation, FuelStationUser
from app.models.user import User, UserRole


EXPECTED_HOST = "127.0.0.1"
EXPECTED_PORT = 5440
EXPECTED_DATABASE = "frota_homolog"
ADMIN_EMAIL = "homologacao.admin@frota.local"
STATION_EMAIL = "homologacao.posto@frota.local"
STATION_NAME = "Posto Homologação"


def require_isolated_homologation() -> None:
    url = make_url(settings.DATABASE_URL)
    if (
        settings.APP_ENV.strip().lower() != "testing"
        or url.host != EXPECTED_HOST
        or url.port != EXPECTED_PORT
        or url.database != EXPECTED_DATABASE
    ):
        raise RuntimeError(
            "Bootstrap permitido somente na homologação isolada "
            "(APP_ENV=testing e 127.0.0.1:5440/frota_homolog)."
        )


def require_password(name: str) -> str:
    value = os.environ.get(name, "")
    if len(value) < 12:
        raise RuntimeError(f"{name} deve estar definido com pelo menos 12 caracteres.")
    return value


async def ensure_user(
    session,
    *,
    email: str,
    name: str,
    role: UserRole,
    password: str,
    cpf: str,
) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            name=name,
            email=email,
            cpf=cpf,
            password_hash=get_password_hash(password),
            role=role,
            must_change_password=False,
        )
        session.add(user)
        await session.flush()
        return user

    user.name = name
    user.cpf = cpf
    user.password_hash = get_password_hash(password)
    user.role = role
    user.must_change_password = False
    await session.flush()
    return user


async def bootstrap() -> None:
    require_isolated_homologation()
    admin_password = require_password("HML_ADMIN_PASSWORD")
    station_password = require_password("HML_STATION_PASSWORD")

    async with AsyncSessionFactory() as session:
        async with session.begin():
            await ensure_user(
                session,
                email=ADMIN_EMAIL,
                name="Administradora de Homologação",
                role=UserRole.ADMIN,
                password=admin_password,
                cpf="52998224725",
            )
            station_user = await ensure_user(
                session,
                email=STATION_EMAIL,
                name="Operador de Posto - Homologação",
                role=UserRole.POSTO,
                password=station_password,
                cpf="11144477735",
            )

            station = await session.scalar(select(FuelStation).where(FuelStation.name == STATION_NAME))
            if station is None:
                station = FuelStation(
                    name=STATION_NAME,
                    cnpj="12.345.678/0001-90",
                    address="Ambiente isolado de homologação",
                    active=True,
                )
                session.add(station)
                await session.flush()
            else:
                station.active = True

            link = await session.scalar(
                select(FuelStationUser).where(
                    FuelStationUser.user_id == station_user.id,
                    FuelStationUser.fuel_station_id == station.id,
                )
            )
            if link is None:
                session.add(
                    FuelStationUser(
                        user_id=station_user.id,
                        fuel_station_id=station.id,
                        active=True,
                    )
                )
            else:
                link.active = True

    print(f"Usuários de homologação prontos: {ADMIN_EMAIL}, {STATION_EMAIL}")


if __name__ == "__main__":
    asyncio.run(bootstrap())
