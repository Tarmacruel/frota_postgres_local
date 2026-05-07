from __future__ import annotations

from uuid import UUID
from jose import JWTError, jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.db.session import get_db_session
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository


PASSWORD_CHANGE_REQUIRED_DETAIL = {
    "code": "PASSWORD_CHANGE_REQUIRED",
    "message": "Troca de senha obrigatória no primeiro acesso",
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
    return current_user


async def require_admin(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito a administradores")
    return current_user


async def require_writer(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a perfis com permissão de cadastro e edição",
        )
    return current_user


async def require_fuel_station_user(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role not in {UserRole.ADMIN, UserRole.POSTO}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores e usuários de posto",
        )
    return current_user


async def require_fuel_module_user(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO, UserRole.POSTO}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao módulo de abastecimentos",
        )
    return current_user


async def require_fuel_supply_viewer(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao histórico de abastecimentos",
        )
    return current_user


async def require_fuel_supply_confirmer(current_user: User = Depends(get_current_user_ready)) -> User:
    if current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO, UserRole.POSTO}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a perfis com permissão de confirmação no módulo de abastecimentos",
        )
    return current_user
