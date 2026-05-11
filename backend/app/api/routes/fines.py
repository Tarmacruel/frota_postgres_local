from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.fine import FineStatus
from app.schemas.fine import FineCreate, FineListResponse, FineOut, FineUpdate
from app.services.fine_service import FineService

router = APIRouter(prefix="/api/fines", tags=["Fines"])


@router.get("", response_model=FineListResponse, dependencies=[Depends(require_permission("fines", "view"))])
async def list_fines(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    vehicle_id: UUID | None = Query(default=None),
    organization_id: UUID | None = Query(default=None),
    status_filter: FineStatus | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await FineService(db).list(
        page=page,
        limit=limit,
        vehicle_id=vehicle_id,
        organization_id=organization_id,
        status_filter=status_filter,
        search=search,
    )


@router.get("/{fine_id}", response_model=FineOut, dependencies=[Depends(require_permission("fines", "view"))])
async def get_fine(fine_id: UUID, db: AsyncSession = Depends(get_db_session)):
    return await FineService(db).get(fine_id)


@router.post("", response_model=FineOut, status_code=status.HTTP_201_CREATED)
async def create_fine(data: FineCreate, db: AsyncSession = Depends(get_db_session), current_user=Depends(require_permission("fines", "create"))):
    return await FineService(db).create(data, current_user)


@router.put("/{fine_id}", response_model=FineOut)
async def update_fine(fine_id: UUID, data: FineUpdate, db: AsyncSession = Depends(get_db_session), current_user=Depends(require_permission("fines", "edit"))):
    return await FineService(db).update(fine_id, data, current_user)
