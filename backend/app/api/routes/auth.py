from __future__ import annotations

from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_ready, require_permission
from app.core.security import clear_jwt_cookie, create_access_token, create_csrf_token, set_csrf_cookie, set_jwt_cookie
from app.core.request_context import get_request_audit_context
from app.core.config import settings
from app.db.session import get_db_session
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import ChangePasswordInput, CurrentUserOut, LoginInput, MessageOut, RegisterCpfInput
from app.schemas.feature_guide import FeatureGuideStateOut
from app.services.auth_service import AuthService
from app.services.access_audit_service import record_access
from app.services.feature_guide_service import (
    FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY,
    VEHICLE_TAGS_FEATURE_KEY,
    FeatureGuideService,
)
from app.services.login_security_service import LoginSecurityService

router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/login", response_model=MessageOut)
async def login(data: LoginInput, response: Response, request: Request, db: AsyncSession = Depends(get_db_session)):
    audit_context = get_request_audit_context()
    client_ip = audit_context.ip_address if audit_context else (request.client.host if request.client else "unknown")
    LoginSecurityService.enforce_request_rate(ip_address=client_ip)
    try:
        LoginSecurityService.enforce_login_allowed(ip_address=client_ip, email=data.email)
    except HTTPException as error:
        await record_access(db, action="LOGIN_BLOCKED", http_status=error.status_code, attempted_email=data.email)
        raise
    try:
        user = await AuthService(db).authenticate(data)
    except HTTPException as error:
        LoginSecurityService.register_failure(ip_address=client_ip, email=data.email)
        action = "LOGIN_BLOCKED" if error.status_code == 403 else "LOGIN_FAILURE"
        await record_access(db, action=action, http_status=error.status_code, attempted_email=data.email)
        raise
    LoginSecurityService.register_success(ip_address=client_ip, email=data.email)
    session_id = uuid4()
    token = create_access_token(subject=str(user.id), role=user.role.value, audit_session_id=session_id)
    await record_access(db, action="LOGIN_SUCCESS", http_status=200, actor=user, session_id=session_id)
    set_jwt_cookie(response, token)
    return {"message": "Login realizado"}


@router.post("/logout", response_model=MessageOut)
async def logout(response: Response, request: Request, db: AsyncSession = Depends(get_db_session)):
    clear_jwt_cookie(response)
    token = request.cookies.get(settings.COOKIE_NAME)
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id = UUID(payload.get("sub", ""))
        except (JWTError, ValueError, TypeError):
            return {"message": "Logout"}
        user = await UserRepository(db).get_by_id(user_id)
        if user:
            await record_access(db, action="LOGOUT", http_status=200, actor=user, session_id=payload.get("audit_sid"))
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


@router.get("/feature-guides/vehicle-tags-v1", response_model=FeatureGuideStateOut)
async def get_vehicle_tags_feature_guide(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await FeatureGuideService(db).get_state(
        user_id=current_user.id, feature_key=VEHICLE_TAGS_FEATURE_KEY,
    )


@router.post("/feature-guides/vehicle-tags-v1/acknowledge", response_model=FeatureGuideStateOut)
async def acknowledge_vehicle_tags_feature_guide(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await FeatureGuideService(db).acknowledge(
        user_id=current_user.id, feature_key=VEHICLE_TAGS_FEATURE_KEY,
    )
