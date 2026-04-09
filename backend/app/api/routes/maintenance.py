from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin, require_writer
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.maintenance import MaintenanceCreate, MaintenanceOut, MaintenanceUpdate
from app.services.maintenance_service import MaintenanceService

router = APIRouter(prefix="/api/maintenance", tags=["Maintenance"])


@router.get("", response_model=list[MaintenanceOut], dependencies=[Depends(get_current_user)])
async def list_maintenance(
    vehicle_id: UUID | None = Query(default=None),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await MaintenanceService(db).list(vehicle_id=vehicle_id, start=start, end=end)


@router.get("/{record_id}", response_model=MaintenanceOut, dependencies=[Depends(get_current_user)])
async def get_maintenance(record_id: UUID, db: AsyncSession = Depends(get_db_session)):
    return await MaintenanceService(db).get(record_id)


@router.post("", response_model=MaintenanceOut)
async def create_maintenance(
    data: MaintenanceCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await MaintenanceService(db).create(data, current_user)


@router.put("/{record_id}", response_model=MaintenanceOut)
async def update_maintenance(
    record_id: UUID,
    data: MaintenanceUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await MaintenanceService(db).update(record_id, data, current_user)


@router.delete("/{record_id}", response_model=MessageOut)
async def delete_maintenance(
    record_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    await MaintenanceService(db).delete(record_id, current_user)
    return {"message": "Removido"}
