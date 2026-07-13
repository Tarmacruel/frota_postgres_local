from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.models.user import UserRole
from app.repositories.search_repository import SearchRepository
from app.services.possession_service import PossessionService
from app.services.search_service import SearchService


def production_settings(**overrides) -> Settings:
    values = {
        "DATABASE_URL": "sqlite+aiosqlite:///./phase7.db",
        "SECRET_KEY": "s" * 48,
        "SIGNATURE_EVIDENCE_SECRET": "e" * 48,
        "APP_ENV": "production",
        "COOKIE_SECURE": True,
        "CORS_ORIGINS": ["https://frota.sirel.com.br"],
        "CSRF_TRUSTED_ORIGINS": ["https://frota.sirel.com.br"],
        "TRUSTED_HOSTS": ["frota.sirel.com.br"],
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"SECRET_KEY": "supersecretkeychangeinproduction"}, "SECRET_KEY"),
        ({"COOKIE_SECURE": False}, "COOKIE_SECURE"),
        ({"CORS_ORIGINS": ["http://frota.sirel.com.br"]}, "CORS_ORIGINS"),
        ({"CSRF_TRUSTED_ORIGINS": []}, "CSRF_TRUSTED_ORIGINS"),
        ({"TRUSTED_HOSTS": ["*"]}, "TRUSTED_HOSTS"),
    ],
)
def test_production_configuration_fails_closed(override, message):
    with pytest.raises(ValidationError, match=message):
        production_settings(**override)


def test_production_configuration_accepts_explicit_https_baseline():
    configured = production_settings()
    assert configured.APP_ENV == "production"
    assert configured.COOKIE_SECURE is True


@pytest.mark.asyncio
async def test_security_headers_and_request_size_limit(client):
    health = await client.get("/api/health")
    assert health.status_code == 200
    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-frame-options"] == "DENY"
    assert health.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in health.headers["content-security-policy"]
    assert health.headers["cache-control"] == "no-store"

    too_large = await client.post(
        "/api/auth/login",
        content=b"{}",
        headers={"Content-Length": str(settings.MAX_REQUEST_BODY_BYTES + 1)},
    )
    assert too_large.status_code == 413
    assert too_large.json()["code"] == "REQUEST_BODY_TOO_LARGE"
    assert too_large.headers["cache-control"] == "no-store"


def test_storage_resolution_blocks_absolute_and_parent_paths(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_DIR", tmp_path)
    service = PossessionService(None)

    allowed = service._resolve_document_path("possession_documents/documento.pdf")
    assert allowed == (tmp_path / "possession_documents" / "documento.pdf").resolve()

    with pytest.raises(HTTPException) as parent_error:
        service._resolve_document_path("../segredo.txt")
    assert parent_error.value.status_code == 404

    outside = Path(tmp_path.anchor) / "segredo.txt"
    with pytest.raises(HTTPException) as absolute_error:
        service._resolve_document_path(str(outside))
    assert absolute_error.value.status_code == 404


@pytest.mark.parametrize(
    ("content", "mime_type", "expected"),
    [
        (b"%PDF-1.7\n", "application/pdf", True),
        (b"conteudo falso", "application/pdf", False),
        (b"\xff\xd8\xff\xe0foto", "image/jpeg", True),
        (b"GIF89a", "image/jpeg", False),
        (b"\x89PNG\r\n\x1a\nfoto", "image/png", True),
        (b"RIFF\x04\x00\x00\x00WEBPdata", "image/webp", True),
    ],
)
def test_upload_magic_bytes_must_match_declared_mime(content, mime_type, expected):
    assert PossessionService._content_matches_mime(content, mime_type) is expected


@pytest.mark.asyncio
async def test_standard_profile_cannot_download_full_photo_evidence(monkeypatch):
    service = PossessionService(None)
    service.possessions.get_by_id = AsyncMock(return_value=SimpleNamespace(vehicle_id="vehicle"))
    monkeypatch.setattr(service, "_ensure_possession_visible_to_user", AsyncMock())

    with pytest.raises(HTTPException) as denied:
        await service.get_photo_file(
            "possession",
            current_user=SimpleNamespace(role=UserRole.PADRAO),
        )
    assert denied.value.status_code == 403


@pytest.mark.asyncio
async def test_standard_global_search_does_not_query_personal_possession_fields():
    db = SimpleNamespace(execute=AsyncMock())
    result = MagicMock()
    result.scalars.return_value.unique.return_value.all.return_value = []
    db.execute.return_value = result

    repository = SearchRepository(db)
    await repository.search_vehicles(
        "%ABC%",
        10,
        include_personal_data=False,
    )
    vehicle_statement = str(db.execute.await_args.args[0])
    assert "driver_name" not in vehicle_statement

    await repository.search_possessions(
        "%ABC%",
        10,
        include_personal_data=False,
    )

    statement = str(db.execute.await_args.args[0])
    assert "driver_name" not in statement
    assert "observation" not in statement
    assert "driver_document" not in statement
    assert "driver_contact" not in statement
    assert "vehicles.plate" in statement


@pytest.mark.asyncio
async def test_standard_global_search_does_not_return_driver_identity():
    service = SearchService(None)
    secret_name = "Nome pessoal restrito"
    vehicle = SimpleNamespace(
        id="vehicle-id",
        plate="ABC1D23",
        brand="Marca",
        model="Modelo",
        chassis_number="CHASSIS-PUBLICO-TESTE",
        ownership_type=SimpleNamespace(value="PROPRIO"),
        status=SimpleNamespace(value="ATIVO"),
    )
    possession = SimpleNamespace(
        id="possession-id",
        public_number=358,
        driver_name=secret_name,
        driver_document="12345678900",
        driver_contact="73999999999",
        vehicle=vehicle,
        is_active=True,
    )
    service.search_repo.search_vehicles = AsyncMock(return_value=[(vehicle, None, possession)])
    service.search_repo.search_possessions = AsyncMock(return_value=[possession])
    service.search_repo.search_maintenances = AsyncMock(return_value=[])
    current_user = SimpleNamespace(
        role=UserRole.PADRAO,
        permissions={
            "vehicles": {"can_view": True},
            "possession": {"can_view": True},
            "maintenance": {"can_view": False},
        },
    )

    payload = await service.search("ABC", 10, current_user)

    service.search_repo.search_possessions.assert_awaited_once_with(
        "%ABC%",
        10,
        organization_id=None,
        include_personal_data=False,
    )
    service.search_repo.search_vehicles.assert_awaited_once_with(
        "%ABC%",
        10,
        organization_id=None,
        include_personal_data=False,
    )
    rendered = repr(payload)
    assert secret_name not in rendered
    assert "12345678900" not in rendered
    assert "73999999999" not in rendered
    vehicle_result = next(item for item in payload if item["type"] == "vehicle")
    possession_result = next(item for item in payload if item["type"] == "possession")
    assert vehicle_result["context"]["driver_name"] is None
    assert possession_result["title"] == "Posse nº 358"
