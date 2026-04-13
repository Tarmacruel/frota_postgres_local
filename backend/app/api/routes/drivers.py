from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin, require_writer
from app.db.session import get_db_session
from app.schemas.auth import MessageOut
from app.schemas.driver import DriverCreate, DriverListResponse, DriverOut, DriverUpdate
from app.services.driver_service import DriverService

router = APIRouter(prefix="/api/drivers", tags=["Drivers"])


@router.get("/active", response_model=list[DriverOut], dependencies=[Depends(get_current_user)])
async def list_active_drivers(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
):
    return await DriverService(db).list_active(search=search, limit=limit)


@router.get("", response_model=DriverListResponse, dependencies=[Depends(get_current_user)])
async def list_drivers(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await DriverService(db).list(page=page, limit=limit, search=search, active_only=active)


@router.get("/{driver_id}", response_model=DriverOut, dependencies=[Depends(get_current_user)])
async def get_driver(driver_id: UUID, db: AsyncSession = Depends(get_db_session)):
    return await DriverService(db).get(driver_id)


@router.post("", response_model=DriverOut, status_code=status.HTTP_201_CREATED)
async def create_driver(
    data: DriverCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_writer),
):
    return await DriverService(db).create(data, current_user)


@router.put("/{driver_id}", response_model=DriverOut)
async def update_driver(
    driver_id: UUID,
    data: DriverUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_writer),
):
    return await DriverService(db).update(driver_id, data, current_user)


@router.delete("/{driver_id}", response_model=MessageOut)
async def deactivate_driver(
    driver_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_admin),
):
    await DriverService(db).deactivate(driver_id, current_user)
    return {"message": "Condutor inativado"}
