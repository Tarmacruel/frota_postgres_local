from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)

    async def list(self, skip: int, limit: int):
        return await self.users.list(skip=skip, limit=limit)

    async def create(self, data: UserCreate) -> User:
        existing = await self.users.get_by_email(data.email.lower())
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")
        user = User(
            name=data.name.strip(),
            email=data.email.lower(),
            password_hash=get_password_hash(data.password),
            role=data.role,
        )
        try:
            async with self.db.begin():
                await self.users.create(user)
        except IntegrityError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível criar o usuário") from exc
        return user

    async def delete(self, user_id: UUID) -> None:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
        async with self.db.begin():
            await self.users.delete(user)
