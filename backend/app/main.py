from __future__ import annotations

from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.maintenance import router as maintenance_router
from app.api.routes.master_data import router as master_data_router
from app.api.routes.possession import router as possession_router
from app.api.routes.search import router as search_router
from app.api.routes.users import router as users_router
from app.api.routes.vehicles import router as vehicles_router
from app.core.config import settings

app = FastAPI(title="Sistema de Frota PMTF", version="1.0.0")
PROJECT_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(audit_router)
app.include_router(users_router)
app.include_router(master_data_router)
app.include_router(vehicles_router)
app.include_router(maintenance_router)
app.include_router(possession_router)
app.include_router(search_router)


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
        raise HTTPException(status_code=404, detail="Not Found")

    requested_path = FRONTEND_DIST / full_path
    if requested_path.is_file():
        return FileResponse(requested_path)

    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)

    raise HTTPException(status_code=404, detail="Not Found")
