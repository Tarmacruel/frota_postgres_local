from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_password_hash
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserUpdate
from app.services.audit_service import AuditService


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)
        self.audit = AuditService(db)

    async def list(self, skip: int, limit: int):
        return await self.users.list(skip=skip, limit=limit)

    async def create(self, data: UserCreate, current_user: User) -> User:
        existing = await self.users.get_by_email(data.email.lower())
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail ja cadastrado")

        user = User(
            name=data.name.strip(),
            email=data.email.lower(),
            password_hash=get_password_hash(data.password),
            role=data.role,
        )

        try:
            await self.users.create(user)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="USER",
                entity_id=user.id,
                entity_label=user.email,
                details={
                    "name": user.name,
                    "email": user.email,
                    "role": user.role.value,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel criar o usuario") from exc

        return user

    async def update(self, user_id: UUID, data: UserUpdate, current_user: User) -> User:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")

        payload = data.model_dump(exclude_unset=True)
        previous_values = {
            "name": user.name,
            "email": user.email,
            "role": user.role.value,
        }

        if payload.get("email") and payload["email"].lower() != user.email:
            existing = await self.users.get_by_email(payload["email"].lower())
            if existing and existing.id != user.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail ja cadastrado")

        if payload.get("name") is not None:
            user.name = payload["name"].strip()
        if payload.get("email") is not None:
            user.email = payload["email"].lower()
        if payload.get("role") is not None:
            user.role = payload["role"]
        if payload.get("password"):
            user.password_hash = get_password_hash(payload["password"])

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="USER",
                entity_id=user.id,
                entity_label=user.email,
                details={
                    "before": previous_values,
                    "after": {
                        "name": user.name,
                        "email": user.email,
                        "role": user.role.value,
                        "password_changed": bool(payload.get("password")),
                    },
                },
            )
            await self.db.flush()
            await self.db.refresh(user)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar o usuario") from exc

        return user

    async def delete(self, user_id: UUID, current_user: User) -> None:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario nao encontrado")
        if user.id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nao e permitido excluir o proprio usuario")

        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="USER",
                entity_id=user.id,
                entity_label=user.email,
                details={
                    "name": user.name,
                    "role": user.role.value,
                },
            )
            await self.users.delete(user)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel remover o usuario") from exc
