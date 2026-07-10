from __future__ import annotations

from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from app.models.fuel_station import FuelStation, FuelStationUser


class FuelStationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, active_only: bool | None = None) -> list[FuelStation]:
        stmt = select(FuelStation).order_by(FuelStation.name)
        if active_only is True:
            stmt = stmt.where(FuelStation.active.is_(True))
        elif active_only is False:
            stmt = stmt.where(FuelStation.active.is_(False))
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get(self, fuel_station_id: UUID) -> FuelStation | None:
        result = await self.db.execute(select(FuelStation).where(FuelStation.id == fuel_station_id))
        return result.scalar_one_or_none()

    async def create(self, station: FuelStation) -> FuelStation:
        self.db.add(station)
        await self.db.flush()
        await self.db.refresh(station)
        return station

    async def list_active_stations_for_user(self, user_id: UUID) -> list[FuelStation]:
        stmt = (
            select(FuelStation)
            .join(FuelStationUser, FuelStationUser.fuel_station_id == FuelStation.id)
            .where(
                FuelStationUser.user_id == user_id,
                FuelStationUser.active.is_(True),
                FuelStation.active.is_(True),
            )
            .order_by(FuelStation.name.asc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def list_active_station_ids_for_user(self, user_id: UUID) -> list[UUID]:
        return [station.id for station in await self.list_active_stations_for_user(user_id)]

    async def has_active_user_link(self, *, user_id: UUID, fuel_station_id: UUID) -> bool:
        stmt = (
            select(FuelStationUser.id)
            .join(FuelStation, FuelStation.id == FuelStationUser.fuel_station_id)
            .where(
                FuelStationUser.user_id == user_id,
                FuelStationUser.fuel_station_id == fuel_station_id,
                FuelStationUser.active.is_(True),
                FuelStation.active.is_(True),
            )
            .limit(1)
        )
        return (await self.db.execute(stmt)).scalar_one_or_none() is not None

    async def list_users(self, fuel_station_id: UUID, active_only: bool | None = None) -> list[FuelStationUser]:
        stmt = (
            select(FuelStationUser)
            .options(joinedload(FuelStationUser.user), joinedload(FuelStationUser.fuel_station))
            .where(FuelStationUser.fuel_station_id == fuel_station_id)
            .order_by(FuelStationUser.created_at.desc())
        )
        if active_only is True:
            stmt = stmt.where(FuelStationUser.active.is_(True))
        elif active_only is False:
            stmt = stmt.where(FuelStationUser.active.is_(False))
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_user_link(self, fuel_station_id: UUID, link_id: UUID) -> FuelStationUser | None:
        result = await self.db.execute(
            select(FuelStationUser)
            .options(joinedload(FuelStationUser.user), joinedload(FuelStationUser.fuel_station))
            .where(FuelStationUser.id == link_id, FuelStationUser.fuel_station_id == fuel_station_id)
        )
        return result.scalar_one_or_none()

    async def create_user_link(self, link: FuelStationUser) -> FuelStationUser:
        self.db.add(link)
        await self.db.flush()
        return await self.get_user_link(link.fuel_station_id, link.id)

    async def delete(self, entity) -> None:
        await self.db.delete(entity)
