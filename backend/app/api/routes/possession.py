from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin
from app.db.session import get_db_session
from app.schemas.possession import PossessionCreate, PossessionOut, PossessionUpdate
from app.services.possession_service import PossessionService

router = APIRouter(prefix="/api/possession", tags=["Possession"])


@router.get("", response_model=list[PossessionOut], dependencies=[Depends(get_current_user)])
async def list_possession(
    vehicle_id: UUID | None = Query(default=None),
    active: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await PossessionService(db).list(vehicle_id=vehicle_id, active=active)


@router.get("/active", response_model=list[PossessionOut], dependencies=[Depends(get_current_user)])
async def list_active_possession(db: AsyncSession = Depends(get_db_session)):
    return await PossessionService(db).list_active()


@router.post("", response_model=PossessionOut, dependencies=[Depends(require_admin)])
async def create_possession(data: PossessionCreate, db: AsyncSession = Depends(get_db_session)):
    return await PossessionService(db).start(data)


@router.put("/{possession_id}/end", response_model=PossessionOut, dependencies=[Depends(require_admin)])
async def end_possession(possession_id: UUID, data: PossessionUpdate, db: AsyncSession = Depends(get_db_session)):
    return await PossessionService(db).end(possession_id, data)
