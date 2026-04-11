from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin
from app.db.session import get_db_session
from app.models.claim import ClaimStatus, ClaimType
from app.schemas.claim import ClaimCreate, ClaimListResponse, ClaimOut, ClaimUpdate
from app.services.claim_service import ClaimService

router = APIRouter(prefix="/api/claims", tags=["Claims"])


@router.get("", response_model=ClaimListResponse, dependencies=[Depends(get_current_user)])
async def list_claims(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    vehicle_id: UUID | None = Query(default=None),
    status_filter: ClaimStatus | None = Query(default=None, alias="status"),
    tipo: ClaimType | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await ClaimService(db).list(
        page=page,
        limit=limit,
        vehicle_id=vehicle_id,
        status_filter=status_filter,
        tipo=tipo,
        search=search,
    )


@router.get("/{claim_id}", response_model=ClaimOut, dependencies=[Depends(get_current_user)])
async def get_claim(claim_id: UUID, db: AsyncSession = Depends(get_db_session)):
    return await ClaimService(db).get(claim_id)


@router.post("", response_model=ClaimOut, status_code=status.HTTP_201_CREATED)
async def create_claim(
    data: ClaimCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_admin),
):
    return await ClaimService(db).create(data, current_user)


@router.put("/{claim_id}", response_model=ClaimOut)
async def update_claim(
    claim_id: UUID,
    data: ClaimUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_admin),
):
    return await ClaimService(db).update(claim_id, data, current_user)
