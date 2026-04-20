from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.fuel_station import FuelStation
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.user import User
from app.repositories.driver_repository import DriverRepository
from app.repositories.fuel_supply_order_repository import FuelSupplyOrderRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.fuel_supply_order import FuelSupplyOrderCreate


class FuelSupplyOrderService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.orders = FuelSupplyOrderRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.master_data = MasterDataRepository(db)

    async def list(self, *, page: int, limit: int, **filters) -> PaginatedResponse[dict]:
        await self.orders.expire_open_orders()
        records, total = await self.orders.list_paginated(page=page, limit=limit, **filters)
        await self.db.commit()
        return PaginatedResponse[dict](
            data=[self._serialize(item) for item in records],
            pagination=build_pagination(page, limit, total),
        )

    async def create(self, payload: FuelSupplyOrderCreate, current_user: User) -> dict:
        await self._validate_references(payload)
        now = datetime.now(timezone.utc)

        order = FuelSupplyOrder(
            vehicle_id=payload.vehicle_id,
            driver_id=payload.driver_id,
            organization_id=payload.organization_id,
            fuel_station_id=payload.fuel_station_id,
            status=FuelSupplyOrderStatus.OPEN,
            expires_at=now + timedelta(hours=48),
            created_by_user_id=current_user.id,
            requested_liters=payload.requested_liters,
            max_amount=payload.max_amount,
            notes=payload.notes,
        )
        await self.orders.create(order)
        await self.db.commit()
        await self.db.refresh(order)
        return self._serialize(order)

    async def confirm(self, order_id: UUID, current_user: User, notes: str | None = None) -> dict:
        await self.orders.expire_open_orders()
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento nao encontrada")
        if order.status != FuelSupplyOrderStatus.OPEN:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem nao pode ser confirmada")

        now = datetime.now(timezone.utc)
        order.status = FuelSupplyOrderStatus.COMPLETED
        order.confirmed_by_user_id = current_user.id
        order.confirmed_at = now
        if notes is not None:
            normalized_notes = notes.strip()
            order.notes = normalized_notes or None
        await self.db.commit()
        await self.db.refresh(order)
        return self._serialize(order)

    async def _validate_references(self, payload: FuelSupplyOrderCreate) -> None:
        vehicle = await self.vehicles.get_by_id(payload.vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

        if payload.driver_id:
            driver = await self.drivers.get_by_id(payload.driver_id)
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor nao encontrado")

        if payload.organization_id:
            organization = await self.master_data.get_organization(payload.organization_id)
            if not organization:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orgao nao encontrado")

        if payload.fuel_station_id:
            fuel_station = await self.db.scalar(select(FuelStation).where(FuelStation.id == payload.fuel_station_id))
            if not fuel_station:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posto de combustivel nao encontrado")

    def _serialize(self, item: FuelSupplyOrder) -> dict:
        remaining_seconds = max(0, int((item.expires_at - datetime.now(timezone.utc)).total_seconds()))
        return {
            "id": item.id,
            "vehicle_id": item.vehicle_id,
            "driver_id": item.driver_id,
            "organization_id": item.organization_id,
            "fuel_station_id": item.fuel_station_id,
            "fuel_station_name": item.fuel_station.name if item.fuel_station else None,
            "status": item.status,
            "expires_at": item.expires_at,
            "remaining_seconds": remaining_seconds,
            "created_by_user_id": item.created_by_user_id,
            "confirmed_by_user_id": item.confirmed_by_user_id,
            "requested_liters": float(item.requested_liters) if item.requested_liters is not None else None,
            "max_amount": float(item.max_amount) if item.max_amount is not None else None,
            "notes": item.notes,
            "confirmed_at": item.confirmed_at,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
