from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse
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
    CERTIFICATE_SIGNING_ENABLED: bool = False
    CANONICAL_DOCUMENT_ARTIFACTS_ENABLED: bool = False
    SIGNATURE_AGENT_ENABLED: bool = False
    HOMOLOGATION_CERTIFICATE_TARGETS_ONLY: bool = True
    DIGITAL_DOCUMENT_ARTIFACTS_DIR: Path | None = None
    CERTIFICATE_SIGNING_SESSION_TTL_SECONDS: int = Field(default=300, ge=60, le=600)
    SIGNATURE_AGENT_PAIRING_TTL_SECONDS: int = Field(default=300, ge=60, le=600)
    SIGNATURE_AGENT_PROOF_MAX_SKEW_SECONDS: int = Field(default=90, ge=30, le=300)
    SIGNATURE_BACKEND_BASE_URL: str = "http://127.0.0.1:8010"
    SIGNATURE_PREPARED_STATE_DIR: Path | None = None
    SIGNATURE_AGENT_ARTIFACT_DIR: Path = BASE_DIR.parent / "signature-agent" / "artifacts" / "win-x64"
    ICP_BRASIL_TRUST_STORE_DIR: Path | None = None
    SIGNATURE_TSA_URL: str | None = None
    SIGNATURE_TSA_USERNAME: str | None = None
    SIGNATURE_TSA_PASSWORD: str | None = None
    SIGNATURE_ALLOW_NETWORK_FETCHING: bool = False
    SIGNATURE_REQUIRE_REVOCATION: bool = True

    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8-sig", extra="ignore")

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

    @field_validator(
        "DIGITAL_DOCUMENT_ARTIFACTS_DIR",
        "SIGNATURE_PREPARED_STATE_DIR",
        "ICP_BRASIL_TRUST_STORE_DIR",
        mode="before",
    )
    @classmethod
    def parse_optional_path(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("SIGNATURE_AGENT_ARTIFACT_DIR", mode="before")
    @classmethod
    def parse_agent_artifact_path(cls, value):
        if isinstance(value, str) and not value.strip():
            return BASE_DIR.parent / "signature-agent" / "artifacts" / "win-x64"
        return value

    @field_validator(
        "SIGNATURE_TSA_URL",
        "SIGNATURE_TSA_USERNAME",
        "SIGNATURE_TSA_PASSWORD",
        mode="before",
    )
    @classmethod
    def parse_optional_string(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def validate_production_security(self):
        self.APP_ENV = self.APP_ENV.strip().lower()
        backend_url = urlparse(self.SIGNATURE_BACKEND_BASE_URL)
        if backend_url.scheme not in {"http", "https"} or not backend_url.hostname:
            raise ValueError("SIGNATURE_BACKEND_BASE_URL deve ser uma URL HTTP(S) absoluta")
        if self.CERTIFICATE_SIGNING_ENABLED:
            if not self.CANONICAL_DOCUMENT_ARTIFACTS_ENABLED or not self.SIGNATURE_AGENT_ENABLED:
                raise ValueError(
                    "Assinatura por certificado exige artefatos canonicos e agente habilitados"
                )
            if self.ICP_BRASIL_TRUST_STORE_DIR is None or not self.SIGNATURE_TSA_URL:
                raise ValueError(
                    "Assinatura por certificado exige trust store ICP-Brasil e TSA configurados"
                )
            tsa_url = urlparse(self.SIGNATURE_TSA_URL)
            local_hml_tsa = (
                self.APP_ENV == "homologation"
                and tsa_url.scheme == "http"
                and tsa_url.hostname in {"127.0.0.1", "localhost"}
            )
            if tsa_url.scheme != "https" and not local_hml_tsa:
                raise ValueError("SIGNATURE_TSA_URL deve usar HTTPS, salvo TSA local da homologacao")
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
