from __future__ import annotations

from uuid import UUID
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from app.models.user import User


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, skip: int = 0, limit: int = 50) -> list[User]:
        result = await self.db.execute(
            select(User)
            .options(joinedload(User.organization))
            .options(selectinload(User.permission_entries))
            .offset(skip)
            .limit(limit)
            .order_by(User.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_signers(self, *, organization_id: UUID | None = None, exclude_user_id: UUID | None = None, limit: int = 200) -> list[User]:
        stmt = (
            select(User)
            .options(joinedload(User.organization), selectinload(User.permission_entries))
            .order_by(User.name.asc())
            .limit(limit)
        )
        if organization_id:
            stmt = stmt.where(User.organization_id == organization_id)
        if exclude_user_id:
            stmt = stmt.where(User.id != exclude_user_id)
        result = await self.db.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_by_email(self, email: str) -> User | None:
        result = await self.db.execute(
            select(User)
            .options(joinedload(User.organization), selectinload(User.permission_entries))
            .where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: UUID) -> User | None:
        result = await self.db.execute(
            select(User)
            .options(joinedload(User.organization), selectinload(User.permission_entries))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    async def create(self, user: User) -> User:
        self.db.add(user)
        await self.db.flush()
        await self.db.refresh(user)
        return user

    async def delete(self, user: User) -> None:
        await self.db.delete(user)
