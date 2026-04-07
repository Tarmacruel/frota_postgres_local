from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin
from app.db.session import get_db_session
from app.models.vehicle import VehicleStatus
from app.schemas.auth import MessageOut
from app.schemas.history import LocationHistoryOut
from app.schemas.vehicle import VehicleCreate, VehicleOut, VehicleUpdate
from app.services.vehicle_service import VehicleService

router = APIRouter(prefix="/api/vehicles", tags=["Vehicles"])


@router.get("", response_model=list[VehicleOut], dependencies=[Depends(get_current_user)])
async def list_vehicles(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    status_filter: VehicleStatus | None = Query(default=None, alias="status"),
    db: AsyncSession = Depends(get_db_session),
):
    return await VehicleService(db).list(skip=skip, limit=limit, status_filter=status_filter)


@router.get("/em-atividade", response_model=list[VehicleOut], dependencies=[Depends(get_current_user)])
async def vehicles_active(db: AsyncSession = Depends(get_db_session)):
    return await VehicleService(db).list(skip=0, limit=200, status_filter=VehicleStatus.ATIVO)


@router.get("/em-manutencao", response_model=list[VehicleOut], dependencies=[Depends(get_current_user)])
async def vehicles_maintenance(db: AsyncSession = Depends(get_db_session)):
    return await VehicleService(db).list(skip=0, limit=200, status_filter=VehicleStatus.MANUTENCAO)


@router.get("/inativos", response_model=list[VehicleOut], dependencies=[Depends(get_current_user)])
async def vehicles_inactive(db: AsyncSession = Depends(get_db_session)):
    return await VehicleService(db).list(skip=0, limit=200, status_filter=VehicleStatus.INATIVO)


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def create_vehicle(data: VehicleCreate, db: AsyncSession = Depends(get_db_session)):
    return await VehicleService(db).create(data)


@router.put("/{vehicle_id}", response_model=VehicleOut, dependencies=[Depends(require_admin)])
async def update_vehicle(vehicle_id: UUID, data: VehicleUpdate, db: AsyncSession = Depends(get_db_session)):
    return await VehicleService(db).update(vehicle_id, data)


@router.delete("/{vehicle_id}", response_model=MessageOut, dependencies=[Depends(require_admin)])
async def delete_vehicle(vehicle_id: UUID, db: AsyncSession = Depends(get_db_session)):
    await VehicleService(db).delete(vehicle_id)
    return {"message": "Removido"}


@router.get("/{vehicle_id}/historico", response_model=list[LocationHistoryOut], dependencies=[Depends(get_current_user)])
async def history_vehicle(vehicle_id: UUID, db: AsyncSession = Depends(get_db_session)):
    return await VehicleService(db).get_history(vehicle_id)
