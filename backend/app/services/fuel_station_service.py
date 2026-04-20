from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.fuel_station import FuelStation, FuelStationUser
from app.models.user import User
from app.repositories.fuel_station_repository import FuelStationRepository
from app.repositories.user_repository import UserRepository
from app.schemas.fuel_station import FuelStationCreate, FuelStationUpdate, FuelStationUserCreate, FuelStationUserUpdate
from app.services.audit_service import AuditService


class FuelStationService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.repo = FuelStationRepository(db)
        self.users = UserRepository(db)
        self.audit = AuditService(db)

    async def list(self, active_only: bool | None = None) -> list[FuelStation]:
        return await self.repo.list(active_only=active_only)

    async def get(self, fuel_station_id: UUID) -> FuelStation:
        station = await self.repo.get(fuel_station_id)
        if not station:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posto nao encontrado")
        return station

    async def create(self, data: FuelStationCreate, actor: User) -> FuelStation:
        station = FuelStation(name=data.name, cnpj=data.cnpj, address=data.address, active=data.active)
        try:
            station = await self.repo.create(station)
            await self.audit.record(
                actor=actor,
                action="CREATE",
                entity_type="FUEL_STATION",
                entity_id=station.id,
                entity_label=station.name,
                details={"name": station.name, "cnpj": station.cnpj, "active": station.active},
            )
            await self.db.commit()
            return station
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Posto ja cadastrado") from exc

    async def update(self, fuel_station_id: UUID, data: FuelStationUpdate, actor: User) -> FuelStation:
        station = await self.get(fuel_station_id)
        before = {"name": station.name, "cnpj": station.cnpj, "address": station.address, "active": station.active}
        station.name = data.name
        station.cnpj = data.cnpj
        station.address = data.address
        station.active = data.active
        try:
            await self.audit.record(
                actor=actor,
                action="UPDATE",
                entity_type="FUEL_STATION",
                entity_id=station.id,
                entity_label=station.name,
                details={"before": before, "after": {"name": station.name, "cnpj": station.cnpj, "address": station.address, "active": station.active}},
            )
            await self.db.flush()
            await self.db.refresh(station)
            await self.db.commit()
            return station
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar o posto") from exc

    async def delete(self, fuel_station_id: UUID, actor: User) -> None:
        station = await self.get(fuel_station_id)
        try:
            await self.audit.record(
                actor=actor,
                action="DELETE",
                entity_type="FUEL_STATION",
                entity_id=station.id,
                entity_label=station.name,
                details={"name": station.name},
            )
            await self.repo.delete(station)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel remover o posto") from exc

    async def list_user_links(self, fuel_station_id: UUID, active_only: bool | None = None) -> list[dict]:
        await self.get(fuel_station_id)
        links = await self.repo.list_users(fuel_station_id, active_only=active_only)
        return [self._serialize_link(item) for item in links]

    async def create_user_link(self, fuel_station_id: UUID, data: FuelStationUserCreate, actor: User) -> dict:
        station = await self.get(fuel_station_id)
        user = await self.users.get_by_id(data.user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

        link = FuelStationUser(user_id=data.user_id, fuel_station_id=fuel_station_id, active=data.active)
        try:
            link = await self.repo.create_user_link(link)
            await self.audit.record(
                actor=actor,
                action="CREATE",
                entity_type="FUEL_STATION_USER",
                entity_id=link.id,
                entity_label=f"{station.name} - {user.name}",
                details={"fuel_station_id": str(fuel_station_id), "user_id": str(data.user_id), "active": link.active},
            )
            await self.db.commit()
            return self._serialize_link(link)
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vinculo ja cadastrado") from exc

    async def update_user_link(self, fuel_station_id: UUID, link_id: UUID, data: FuelStationUserUpdate, actor: User) -> dict:
        link = await self.repo.get_user_link(fuel_station_id, link_id)
        if not link:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vinculo nao encontrado")
        before = {"active": link.active}
        link.active = data.active
        await self.audit.record(
            actor=actor,
            action="UPDATE",
            entity_type="FUEL_STATION_USER",
            entity_id=link.id,
            entity_label=f"{link.fuel_station.name if link.fuel_station else fuel_station_id} - {link.user.name if link.user else link.user_id}",
            details={"before": before, "after": {"active": link.active}},
        )
        await self.db.flush()
        link = await self.repo.get_user_link(fuel_station_id, link_id)
        await self.db.commit()
        return self._serialize_link(link)

    async def delete_user_link(self, fuel_station_id: UUID, link_id: UUID, actor: User) -> None:
        link = await self.repo.get_user_link(fuel_station_id, link_id)
        if not link:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vinculo nao encontrado")
        await self.audit.record(
            actor=actor,
            action="DELETE",
            entity_type="FUEL_STATION_USER",
            entity_id=link.id,
            entity_label=f"{link.fuel_station.name if link.fuel_station else fuel_station_id} - {link.user.name if link.user else link.user_id}",
            details={"fuel_station_id": str(link.fuel_station_id), "user_id": str(link.user_id)},
        )
        await self.repo.delete(link)
        await self.db.commit()

    def _serialize_link(self, item: FuelStationUser) -> dict:
        return {
            "id": item.id,
            "user_id": item.user_id,
            "fuel_station_id": item.fuel_station_id,
            "active": item.active,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
            "user_name": item.user.name if item.user else None,
            "user_email": item.user.email if item.user else None,
        }
