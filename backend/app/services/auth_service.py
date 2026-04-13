from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.core.security import get_password_hash, verify_password
from app.repositories.user_repository import UserRepository
from app.schemas.auth import LoginInput
from app.models.user import User
from app.services.audit_service import AuditService


class AuthService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)
        self.audit = AuditService(db)

    async def authenticate(self, data: LoginInput) -> User:
        user = await self.users.get_by_email(data.email.lower())
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario nao encontrado")
        if not verify_password(data.password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha incorreta")
        return user

    async def change_password(self, *, user: User, current_password: str, new_password: str) -> None:
        if not verify_password(current_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta")
        if verify_password(new_password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nova senha deve ser diferente da atual")
        user.password_hash = get_password_hash(new_password)
        await self.audit.record(
            actor=user,
            action="UPDATE",
            entity_type="USER_PASSWORD",
            entity_id=user.id,
            entity_label=user.email,
            details={"password_changed": True},
        )
        await self.db.flush()
        await self.db.commit()
