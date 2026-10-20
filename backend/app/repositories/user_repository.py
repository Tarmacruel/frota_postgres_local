from __future__ import annotations

from uuid import UUID
from sqlalchemy import String, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from app.models.user import User
from app.models.master_data import Organization


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

    async def list_paginated(self, *, page: int, limit: int, search: str | None = None,
                             role: str | None = None, organization_id: UUID | None = None,
                             without_organization: bool = False) -> tuple[list[User], int, dict]:
        filters = []
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(or_(User.name.ilike(term), User.email.ilike(term),
                               User.cpf.ilike(term), Organization.name.ilike(term),
                               User.role.cast(String).ilike(term)))
        if role:
            filters.append(User.role == role)
        if organization_id:
            filters.append(User.organization_id == organization_id)
        if without_organization:
            filters.append(User.organization_id.is_(None))
        base = select(User).outerjoin(Organization, Organization.id == User.organization_id).where(*filters)
        total = (await self.db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
        rows = await self.db.execute(base.options(joinedload(User.organization), selectinload(User.permission_entries))
                                     .order_by(User.created_at.desc(), User.id.desc())
                                     .offset((page - 1) * limit).limit(limit))
        summary_rows = await self.db.execute(select(User.role, func.count()).group_by(User.role))
        summary = {role.value: count for role, count in summary_rows.all()}
        summary["must_change_password"] = (await self.db.execute(select(func.count()).where(User.must_change_password.is_(True)))).scalar_one()
        summary["must_register_cpf"] = (await self.db.execute(select(func.count()).where(User.cpf.is_(None)))).scalar_one()
        return list(rows.scalars().unique().all()), total, summary

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

    async def get_by_cpf(self, cpf: str) -> User | None:
        result = await self.db.execute(
            select(User)
            .options(joinedload(User.organization), selectinload(User.permission_entries))
            .where(User.cpf == cpf)
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
