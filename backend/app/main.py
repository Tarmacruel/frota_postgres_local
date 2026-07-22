from __future__ import annotations

import hmac
import logging
import traceback
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from app.api.routes.admin_notifications import router as admin_notifications_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.claims import router as claims_router
from app.api.routes.data_imports import router as data_imports_router
from app.api.routes.document_signatures import router as document_signatures_router
from app.api.routes.drivers import router as drivers_router
from app.api.routes.fines import router as fines_router
from app.api.routes.fuel_stations import router as fuel_stations_router
from app.api.routes.fuel_supplies import router as fuel_supplies_router
from app.api.routes.fuel_supply_orders import public_router as public_fuel_supply_orders_router
from app.api.routes.fuel_supply_orders import router as fuel_supply_orders_router
from app.api.routes.maintenance import router as maintenance_router
from app.api.routes.master_data import router as master_data_router
from app.api.routes.payment_processes import contract_router as payment_contracts_router
from app.api.routes.payment_processes import router as payment_processes_router
from app.api.routes.payment_processes import supplier_router as payment_suppliers_router
from app.api.routes.possession import public_router as public_possession_terms_router
from app.api.routes.possession import router as possession_router
from app.api.routes.search import router as search_router
from app.api.routes.users import router as users_router
from app.api.routes.vehicles import router as vehicles_router
from app.core.config import settings
from app.core.request_context import (
    REQUEST_ID_HEADER,
    build_request_audit_context,
    is_allowed_request_origin,
    reset_request_audit_context,
    set_request_audit_context,
)
from app.core.request_body_limit import RequestBodyLimitMiddleware


logger = logging.getLogger(__name__)

APP_CONTENT_SECURITY_POLICY = "; ".join(
    (
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
        "frame-src https://www.openstreetmap.org",
        "connect-src 'self'",
        "worker-src 'self' blob:",
    )
)

docs_url = None if settings.APP_ENV == "production" else "/docs"
redoc_url = None if settings.APP_ENV == "production" else "/redoc"
openapi_url = None if settings.APP_ENV == "production" else "/openapi.json"

app = FastAPI(title="Sistema de Frota PMTF", version="1.0.0", docs_url=docs_url, redoc_url=redoc_url, openapi_url=openapi_url)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.TRUSTED_HOSTS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", REQUEST_ID_HEADER],
    expose_headers=[REQUEST_ID_HEADER],
)
app.add_middleware(RequestBodyLimitMiddleware, max_body_bytes=settings.MAX_REQUEST_BODY_BYTES)


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    unsafe_methods = {"POST", "PUT", "PATCH", "DELETE"}
    csrf_exempt_paths = {"/api/auth/login"}
    path = request.url.path
    if request.method in unsafe_methods and path.startswith("/api/") and path not in csrf_exempt_paths:
        access_token = request.cookies.get(settings.COOKIE_NAME)
        if access_token:
            csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME)
            csrf_header = request.headers.get("X-CSRF-Token")
            request_id = request.state.audit_context.request_id
            valid_token = (
                bool(csrf_cookie)
                and bool(csrf_header)
                and len(csrf_cookie) <= 128
                and len(csrf_header) <= 128
                and hmac.compare_digest(csrf_cookie, csrf_header)
            )
            if not valid_token:
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": "Token CSRF inválido ou ausente",
                        "code": "CSRF_TOKEN_INVALID",
                        "request_id": request_id,
                    },
                )
            if not is_allowed_request_origin(request):
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": "Origem da requisição não autorizada",
                        "code": "CSRF_ORIGIN_INVALID",
                        "request_id": request_id,
                    },
                )
    return await call_next(request)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    context = build_request_audit_context(request)
    request.state.audit_context = context
    context_token = set_request_audit_context(context)
    try:
        try:
            response = await call_next(request)
        except Exception as exc:
            stack = " > ".join(
                f"{Path(frame.filename).name}:{frame.lineno}:{frame.name}"
                for frame in traceback.extract_tb(exc.__traceback__, limit=20)
            )
            logger.error(
                "Erro interno request_id=%s method=%s path=%s exception_type=%s stack=%s",
                context.request_id,
                context.method,
                context.path,
                type(exc).__name__,
                stack,
            )
            response = JSONResponse(
                status_code=500,
                content={"detail": "Erro interno do servidor", "request_id": context.request_id},
            )

        response.headers[REQUEST_ID_HEADER] = context.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = APP_CONTENT_SECURITY_POLICY
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
        if settings.APP_ENV == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000"
        if context.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response
    finally:
        reset_request_audit_context(context_token)


def _request_id(request: Request) -> str:
    context = getattr(request.state, "audit_context", None)
    return context.request_id if context else "unavailable"


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": _request_id(request)},
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    safe_errors = [
        {
            "loc": error.get("loc", ()),
            "msg": "Valor inválido",
            "type": error.get("type", "validation_error"),
        }
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"detail": safe_errors, "request_id": _request_id(request)},
    )

app.include_router(auth_router)
app.include_router(audit_router)
app.include_router(admin_notifications_router)
app.include_router(users_router)
app.include_router(master_data_router)
app.include_router(data_imports_router)
app.include_router(document_signatures_router)
app.include_router(drivers_router)
app.include_router(vehicles_router)
app.include_router(maintenance_router)
app.include_router(possession_router)
app.include_router(public_possession_terms_router)
app.include_router(claims_router)
app.include_router(fines_router)
app.include_router(fuel_supplies_router)
app.include_router(fuel_stations_router)
app.include_router(fuel_supply_orders_router)
app.include_router(public_fuel_supply_orders_router)
app.include_router(payment_processes_router)
app.include_router(payment_suppliers_router)
app.include_router(payment_contracts_router)
app.include_router(search_router)
app.include_router(analytics_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "frota-pmtf"}


@app.get("/")
async def root():
    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)
    return {"message": "API da Frota PMTF"}


@app.get("/{full_path:path}", include_in_schema=False)
async def frontend_app(full_path: str):
    reserved_prefixes = ("api", "docs", "redoc", "openapi.json")
    if full_path == "" or any(full_path == prefix or full_path.startswith(f"{prefix}/") for prefix in reserved_prefixes):
        raise HTTPException(status_code=404, detail="Não encontrado")

    requested_path = FRONTEND_DIST / full_path
    if requested_path.is_file():
        return FileResponse(requested_path)

    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)

    raise HTTPException(status_code=404, detail="Não encontrado")
