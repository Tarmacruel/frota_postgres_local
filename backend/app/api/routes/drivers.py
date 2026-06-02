from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.driver import DriverCreate, DriverListResponse, DriverOut, DriverUpdate
from app.services.driver_service import DriverService

router = APIRouter(prefix="/api/drivers", tags=["Drivers"])


@router.get("/active", response_model=list[DriverOut])
async def list_active_drivers(
    search: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("drivers", "view")),
):
    return await DriverService(db).list_active(search=search, limit=limit, current_user=current_user)


@router.get("", response_model=DriverListResponse)
async def list_drivers(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    organization_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("drivers", "view")),
):
    return await DriverService(db).list(page=page, limit=limit, search=search, active_only=active, organization_id=organization_id, current_user=current_user)


@router.get("/{driver_id}", response_model=DriverOut)
async def get_driver(
    driver_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("drivers", "view")),
):
    return await DriverService(db).get(driver_id, current_user=current_user)


@router.post("", response_model=DriverOut, status_code=status.HTTP_201_CREATED)
async def create_driver(
    data: DriverCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_permission("drivers", "create")),
):
    return await DriverService(db).create(data, current_user)


@router.put("/{driver_id}", response_model=DriverOut)
async def update_driver(
    driver_id: UUID,
    data: DriverUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_permission("drivers", "edit")),
):
    return await DriverService(db).update(driver_id, data, current_user)


@router.delete("/{driver_id}", response_model=MessageOut)
async def deactivate_driver(
    driver_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_permission("drivers", "delete")),
):
    await DriverService(db).deactivate(driver_id, current_user)
    return {"message": "Condutor inativado"}
