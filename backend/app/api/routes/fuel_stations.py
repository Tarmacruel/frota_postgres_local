from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.fuel_station import (
    FuelStationCreate,
    FuelStationOut,
    FuelStationUpdate,
    FuelStationUserCreate,
    FuelStationUserOut,
    FuelStationUserUpdate,
)
from app.services.fuel_station_service import FuelStationService

router = APIRouter(prefix="/api/fuel-stations", tags=["FuelStations"])


@router.get("", response_model=list[FuelStationOut], dependencies=[Depends(get_current_user)])
async def list_fuel_stations(
    active_only: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await FuelStationService(db).list(active_only=active_only)


@router.post("", response_model=FuelStationOut, status_code=status.HTTP_201_CREATED)
async def create_fuel_station(
    data: FuelStationCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await FuelStationService(db).create(data, current_user)


@router.put("/{fuel_station_id}", response_model=FuelStationOut)
async def update_fuel_station(
    fuel_station_id: UUID,
    data: FuelStationUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await FuelStationService(db).update(fuel_station_id, data, current_user)


@router.delete("/{fuel_station_id}", response_model=MessageOut)
async def delete_fuel_station(
    fuel_station_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    await FuelStationService(db).delete(fuel_station_id, current_user)
    return {"message": "Removido"}


@router.get("/{fuel_station_id}/users", response_model=list[FuelStationUserOut], dependencies=[Depends(require_admin)])
async def list_fuel_station_users(
    fuel_station_id: UUID,
    active_only: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await FuelStationService(db).list_user_links(fuel_station_id, active_only=active_only)


@router.post("/{fuel_station_id}/users", response_model=FuelStationUserOut, status_code=status.HTTP_201_CREATED)
async def create_fuel_station_user(
    fuel_station_id: UUID,
    data: FuelStationUserCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await FuelStationService(db).create_user_link(fuel_station_id, data, current_user)


@router.put("/{fuel_station_id}/users/{link_id}", response_model=FuelStationUserOut)
async def update_fuel_station_user(
    fuel_station_id: UUID,
    link_id: UUID,
    data: FuelStationUserUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await FuelStationService(db).update_user_link(fuel_station_id, link_id, data, current_user)


@router.delete("/{fuel_station_id}/users/{link_id}", response_model=MessageOut)
async def delete_fuel_station_user(
    fuel_station_id: UUID,
    link_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    await FuelStationService(db).delete_user_link(fuel_station_id, link_id, current_user)
    return {"message": "Removido"}
