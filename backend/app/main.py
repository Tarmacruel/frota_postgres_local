from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes.auth import router as auth_router
from app.api.routes.users import router as users_router
from app.api.routes.vehicles import router as vehicles_router
from app.core.config import settings

app = FastAPI(title="Sistema de Frota PMTF", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(vehicles_router)


@app.get("/")
async def root():
    return {"message": "API da Frota PMTF"}
