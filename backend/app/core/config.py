from __future__ import annotations

import json
from pathlib import Path
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    SIGNATURE_EVIDENCE_SECRET: str | None = None
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    STORAGE_DIR: Path = BASE_DIR / "storage"
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://192.168.18.103:3000",
        "http://192.168.18.103:3001",
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
    CSRF_COOKIE_NAME: str = "csrf_token"
    CSRF_TRUSTED_ORIGINS: list[str] = []
    COOKIE_SECURE: bool = False
    TRUSTED_PROXY_NETWORKS: list[str] = []
    MAX_USER_AGENT_LENGTH: int = Field(default=256, ge=64, le=1024)
    MAX_REQUEST_BODY_BYTES: int = Field(default=64 * 1024 * 1024, ge=1024 * 1024, le=100 * 1024 * 1024)
    TRUSTED_HOSTS: list[str] = [
        "localhost",
        "127.0.0.1",
        "test",
        "testserver",
        "192.168.18.103",
        "frota.sirel.com.br",
        "187.103.204.73",
        "*.localhost",
    ]
    APP_ENV: str = "development"
    ENABLE_LEGACY_FUEL_SUPPLY_CREATE: bool = False

    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, value):
        if isinstance(value, str):
            return json.loads(value)
        return value

    @field_validator("TRUSTED_HOSTS", mode="before")
    @classmethod
    def parse_trusted_hosts(cls, value):
        if isinstance(value, str):
            return json.loads(value)
        return value

    @field_validator("CSRF_TRUSTED_ORIGINS", "TRUSTED_PROXY_NETWORKS", mode="before")
    @classmethod
    def parse_security_lists(cls, value):
        if isinstance(value, str):
            return json.loads(value)
        return value

    @model_validator(mode="after")
    def validate_production_security(self):
        self.APP_ENV = self.APP_ENV.strip().lower()
        if self.APP_ENV != "production":
            return self

        known_defaults = {
            "supersecretkeychangeinproduction",
            "troque_este_secret_em_producao",
            "change-me-in-production",
            "gere_com_secrets_token_urlsafe_48_antes_de_iniciar",
        }
        if len(self.SECRET_KEY) < 32 or self.SECRET_KEY.lower() in known_defaults:
            raise ValueError("SECRET_KEY de producao deve ser aleatoria e possuir ao menos 32 caracteres")
        if not self.COOKIE_SECURE:
            raise ValueError("COOKIE_SECURE deve ser true em producao HTTPS")
        if not self.CSRF_TRUSTED_ORIGINS:
            raise ValueError("CSRF_TRUSTED_ORIGINS deve ser explicita em producao")

        for name, origins in (
            ("CORS_ORIGINS", self.CORS_ORIGINS),
            ("CSRF_TRUSTED_ORIGINS", self.CSRF_TRUSTED_ORIGINS),
        ):
            if any(not origin.startswith("https://") for origin in origins):
                raise ValueError(f"{name} deve conter somente origens HTTPS em producao")
        if any(host == "*" for host in self.TRUSTED_HOSTS):
            raise ValueError("TRUSTED_HOSTS nao pode aceitar wildcard global em producao")
        return self


settings = Settings()
