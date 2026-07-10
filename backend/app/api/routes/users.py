from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user_ready, require_admin
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.user import UserCreate, UserOut, UserPermissionsOut, UserPermissionsUpdate, UserSignerOut, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_admin)])
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
):
    return await UserService(db).list(skip=skip, limit=limit)


@router.get("/signers", response_model=list[UserSignerOut])
async def list_signature_signers(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await UserService(db).list_signers(current_user)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await UserService(db).create(data, current_user)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await UserService(db).update(user_id, data, current_user)


@router.delete("/{user_id}", response_model=MessageOut)
async def delete_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    await UserService(db).delete(user_id, current_user)
    return {"message": "Removido"}


@router.get("/{user_id}/permissions", response_model=UserPermissionsOut)
async def get_user_permissions(
    user_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_admin),
):
    return {"permissions": await UserService(db).get_permissions(user_id)}


@router.put("/{user_id}/permissions", response_model=UserPermissionsOut)
async def update_user_permissions(
    user_id: UUID,
    data: UserPermissionsUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return {"permissions": await UserService(db).update_permissions(user_id, data, current_user)}
