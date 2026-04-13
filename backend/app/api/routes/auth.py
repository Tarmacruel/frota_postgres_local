from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.core.security import clear_jwt_cookie, create_access_token, set_jwt_cookie
from app.db.session import get_db_session
from app.schemas.auth import ChangePasswordInput, CurrentUserOut, LoginInput, MessageOut
from app.services.auth_service import AuthService
from app.services.login_security_service import LoginSecurityService

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=MessageOut)
async def login(data: LoginInput, response: Response, request: Request, db: AsyncSession = Depends(get_db_session)):
    client_ip = request.client.host if request.client else "unknown"
    LoginSecurityService.enforce_request_rate(ip_address=client_ip)
    LoginSecurityService.enforce_login_allowed(ip_address=client_ip, email=data.email)
    try:
        user = await AuthService(db).authenticate(data)
    except HTTPException:
        LoginSecurityService.register_failure(ip_address=client_ip, email=data.email)
        raise
    LoginSecurityService.register_success(ip_address=client_ip, email=data.email)
    token = create_access_token(subject=str(user.id), role=user.role.value)
    set_jwt_cookie(response, token)
    return {"message": "Login realizado"}


@router.post("/logout", response_model=MessageOut)
async def logout(response: Response):
    clear_jwt_cookie(response)
    return {"message": "Logout"}


@router.get("/me", response_model=CurrentUserOut)
async def me(current_user=Depends(get_current_user)):
    return current_user


@router.post("/change-password", response_model=MessageOut)
async def change_password(
    data: ChangePasswordInput,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    await AuthService(db).change_password(user=current_user, current_password=data.current_password, new_password=data.new_password)
    return {"message": "Senha alterada com sucesso"}
