from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_admin
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_admin)])
async def list_users(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db_session),
):
    return await UserService(db).list(skip=skip, limit=limit)


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
