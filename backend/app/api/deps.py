from __future__ import annotations

from uuid import UUID
from jose import JWTError, jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.permissions import action_to_column, apply_role_permission_ceiling, default_permissions_for_role
from app.db.session import get_db_session
from app.models.user import User, UserRole
from app.models.user_permission import UserPermission
from app.repositories.user_repository import UserRepository


PASSWORD_CHANGE_REQUIRED_DETAIL = {
    "code": "PASSWORD_CHANGE_REQUIRED",
    "message": "Troca de senha obrigatória no primeiro acesso",
}


CPF_REQUIRED_DETAIL = {
    "code": "CPF_REQUIRED",
    "message": "Informe seu CPF para liberar o acesso",
}


async def get_current_user(
    db: AsyncSession = Depends(get_db_session),
    access_token: str | None = Cookie(default=None),
) -> User:
    token = access_token
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        user_uuid = UUID(user_id)
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = await UserRepository(db).get_by_id(user_uuid)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")
    return user


async def get_current_user_ready(current_user: User = Depends(get_current_user)) -> User:
    if current_user.must_change_password:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PASSWORD_CHANGE_REQUIRED_DETAIL)
    if not current_user.cpf:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=CPF_REQUIRED_DETAIL)
    return current_user


async def require_admin(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    return current_user


async def require_writer(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a operadores de posse")
    return current_user


def require_permission(module: str, action: str):
    permission_column = action_to_column(action)

    async def dependency(
        db: AsyncSession = Depends(get_db_session),
        current_user: User = Depends(get_current_user_ready),
    ) -> User:
        result = await db.execute(
            select(UserPermission).where(
                UserPermission.user_id == current_user.id,
                UserPermission.module == module,
            )
        )
        permission = result.scalar_one_or_none()
        role = getattr(current_user, "role", "")
        role_value = str(getattr(role, "value", role))
        if not permission:
            default_flags = default_permissions_for_role(role_value).get(module, {})
            if default_flags.get(permission_column):
                return current_user
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente")

        permission_flags = {
            "can_view": permission.can_view,
            "can_create": permission.can_create,
            "can_edit": permission.can_edit,
            "can_delete": permission.can_delete,
        }
        effective_flags = apply_role_permission_ceiling(role_value, module, permission_flags)
        if not effective_flags.get(permission_column):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente")
        return current_user

    return dependency
