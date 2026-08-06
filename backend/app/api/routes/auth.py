from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_permission
from app.core.security import clear_jwt_cookie, create_access_token, create_csrf_token, set_csrf_cookie, set_jwt_cookie
from app.core.request_context import get_request_audit_context
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import ChangePasswordInput, CurrentUserOut, LoginInput, MessageOut, RegisterCpfInput
from app.schemas.feature_guide import FeatureGuideStateOut
from app.services.auth_service import AuthService
from app.services.feature_guide_service import (
    FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    FeatureGuideService,
)
from app.services.login_security_service import LoginSecurityService

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=MessageOut)
async def login(data: LoginInput, response: Response, request: Request, db: AsyncSession = Depends(get_db_session)):
    audit_context = get_request_audit_context()
    client_ip = audit_context.ip_address if audit_context else (request.client.host if request.client else "unknown")
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


@router.get("/csrf")
async def csrf(response: Response, current_user=Depends(get_current_user)):
    token = create_csrf_token()
    set_csrf_cookie(response, token)
    return {"csrf_token": token}


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


@router.post("/cpf", response_model=MessageOut)
async def register_cpf(
    data: RegisterCpfInput,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(get_current_user),
):
    await AuthService(db).register_cpf(user=current_user, data=data)
    return {"message": "CPF registrado com sucesso"}


@router.get(
    "/feature-guides/fuel-supply-orders-batch-v1",
    response_model=FeatureGuideStateOut,
)
async def get_fuel_supply_orders_batch_feature_guide(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "create")),
):
    return await FeatureGuideService(db).get_state(
        user_id=current_user.id,
        feature_key=FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    )


@router.post(
    "/feature-guides/fuel-supply-orders-batch-v1/acknowledge",
    response_model=FeatureGuideStateOut,
)
async def acknowledge_fuel_supply_orders_batch_feature_guide(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "create")),
):
    return await FeatureGuideService(db).acknowledge(
        user_id=current_user.id,
        feature_key=FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    )
