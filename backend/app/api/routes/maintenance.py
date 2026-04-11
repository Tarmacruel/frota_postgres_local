from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin, require_writer
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.maintenance import MaintenanceCreate, MaintenanceListResponse, MaintenanceOut, MaintenanceUpdate
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


@router.get("/paginated", response_model=MaintenanceListResponse, dependencies=[Depends(get_current_user)])
async def list_maintenance_paginated(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    vehicle_id: UUID | None = Query(default=None),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    only_open: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await MaintenanceService(db).list_paginated(
        page=page,
        limit=limit,
        vehicle_id=vehicle_id,
        start=start,
        end=end,
        only_open=only_open,
        search=search,
    )


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
