from __future__ import annotations

import json
from pathlib import Path
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    CORS_ORIGINS: list[str] = [
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:8001",
        "http://127.0.0.1:8001",
        "http://localhost:8010",
        "http://127.0.0.1:8010",
        "http://localhost",
        "http://127.0.0.1",
        "http://frota.sirel.com.br",
        "https://frota.sirel.com.br",
        "http://187.103.204.73",
        "https://187.103.204.73",
    ]
    COOKIE_NAME: str = "access_token"
    COOKIE_SECURE: bool = False
    APP_ENV: str = "development"

    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, value):
        if isinstance(value, str):
            return json.loads(value)
        return value


settings = Settings()
