from __future__ import annotations

import hashlib
import importlib.util
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.models.document_signature import (
    DigitalDocumentArtifact,
    DigitalDocumentArtifactType,
    DigitalDocument,
    DigitalDocumentStatus,
    DigitalDocumentType,
    DocumentSignatureMethod,
)
from app.services.document_artifact_service import DocumentArtifactService
from app.services.document_signature_service import DocumentSignatureService
from app.services.possession_term_pdf_service import PossessionTermPdfService
from scripts.seed_homologation_signing_targets import require_isolated_refresh


def _delivery_snapshot() -> dict:
    return {
        "schema_version": "possession-responsibility-acceptance.v1",
        "document_model_version": "2.0",
        "document_type": DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        "source_type": "POSSESSION",
        "source_id": str(uuid4()),
        "term_number": 358,
        "scope": "DELIVERY_AND_RESPONSIBILITY_ACCEPTANCE",
        "acceptance": {
            "version": "1.0",
            "text": "Declaro ciência sobre a entrega e a responsabilidade.",
        },
        "title": "Termo de Posse e Responsabilidade nº 358",
        "vehicle": {
            "id": str(uuid4()),
            "plate": "ABC1D23",
            "brand": "Marca",
            "model": "Modelo",
        },
        "responsible_driver": {
            "id": str(uuid4()),
            "name": "Condutor de teste",
            "document_masked": "123.***.***-01",
            "document_sha256": "a" * 64,
            "contact_sha256": "b" * 64,
        },
        "delivery": {
            "delivered_at": "2026-07-13T19:00:00Z",
            "odometer_km": "100.0",
            "observation": "Entrega conferida",
            "evidence": [],
        },
    }


def test_certificate_foundation_migration_follows_current_head_and_backfills_legacy_method():
    migration_path = (
        Path(__file__).parents[1]
        / "alembic"
        / "versions"
        / "0043_add_certificate_signature_foundation.py"
    )
    spec = importlib.util.spec_from_file_location("certificate_foundation_migration", migration_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "0043_certificate_foundation"
    assert module.down_revision == "0042_feature_guides"
    source = migration_path.read_text(encoding="utf-8")
    assert "UPDATE document_signatures SET signature_method = 'INTERNAL_PASSWORD'" in source
    assert 'ondelete="RESTRICT"' in source
    assert "homologation_signing_targets" in source


def test_certificate_features_default_to_fail_closed():
    assert settings.CERTIFICATE_SIGNING_ENABLED is False
    assert settings.CANONICAL_DOCUMENT_ARTIFACTS_ENABLED is False
    assert settings.SIGNATURE_AGENT_ENABLED is False
    assert settings.HOMOLOGATION_CERTIFICATE_TARGETS_ONLY is True


def test_synthetic_target_seed_only_accepts_marked_isolated_refresh(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "homologation")
    monkeypatch.setattr(
        settings,
        "DATABASE_URL",
        "postgresql+asyncpg://test:test@127.0.0.1:5440/frota_hml_refresh_20260817033000",
    )
    monkeypatch.setenv("HOMOLOGATION_REFRESH", "1")

    require_isolated_refresh()

    monkeypatch.setattr(
        settings,
        "DATABASE_URL",
        "postgresql+asyncpg://test:test@127.0.0.1:5432/frota_db",
    )
    with pytest.raises(RuntimeError, match="homologação isolada"):
        require_isolated_refresh()


def test_canonical_delivery_pdf_is_byte_deterministic_and_ignores_later_events():
    first_snapshot = _delivery_snapshot()
    second_snapshot = deepcopy(first_snapshot)
    first_snapshot["trips"] = [{"sequence": 1, "destination": "Primeira rota"}]
    second_snapshot["trips"] = [{"sequence": 99, "destination": "Rota posterior"}]
    second_snapshot["return"] = {"returned_at": "2026-07-20T12:00:00Z"}
    content_hash = DocumentSignatureService(db=None).build_hash_for_snapshot(
        {key: value for key, value in first_snapshot.items() if key not in {"trips", "return"}}
    )

    first_pdf = PossessionTermPdfService.build_canonical_delivery_pdf(
        first_snapshot,
        content_hash=content_hash,
        homologation_watermark=True,
    )
    second_pdf = PossessionTermPdfService.build_canonical_delivery_pdf(
        second_snapshot,
        content_hash=content_hash,
        homologation_watermark=True,
    )

    assert first_pdf == second_pdf
    assert first_pdf.startswith(b"%PDF-1.4")
    assert hashlib.sha256(first_pdf).hexdigest() == hashlib.sha256(second_pdf).hexdigest()


def test_artifact_storage_is_write_once_and_detects_path_collision(tmp_path):
    path = tmp_path / "document" / "canonical.pdf"
    original = b"%PDF-original"
    original_hash = hashlib.sha256(original).hexdigest()

    DocumentArtifactService._write_once(path, original, expected_sha256=original_hash)
    DocumentArtifactService._write_once(path, original, expected_sha256=original_hash)

    assert path.read_bytes() == original
    with pytest.raises(HTTPException) as exc:
        DocumentArtifactService._write_once(
            path,
            b"%PDF-altered",
            expected_sha256=hashlib.sha256(b"%PDF-altered").hexdigest(),
        )
    assert exc.value.status_code == 409
    assert path.read_bytes() == original


@pytest.mark.asyncio
async def test_canonical_artifact_is_persisted_from_frozen_snapshot(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "CANONICAL_DOCUMENT_ARTIFACTS_ENABLED", True)
    monkeypatch.setattr(settings, "DIGITAL_DOCUMENT_ARTIFACTS_DIR", tmp_path)
    service = DocumentArtifactService(AsyncMock())
    service.artifacts.get_latest = AsyncMock(return_value=None)
    service.artifacts.add = MagicMock()
    service.homologation_targets.get_active = AsyncMock(return_value=SimpleNamespace(id=uuid4()))
    service.audit.record = AsyncMock()
    source_id = uuid4()
    document = SimpleNamespace(
        id=uuid4(),
        document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        source_type="POSSESSION",
        source_id=source_id,
        content_hash="c" * 64,
        snapshot=_delivery_snapshot(),
        title="Termo de teste",
    )
    user = SimpleNamespace(id=uuid4())

    artifact = await service.ensure_canonical_artifact(document, current_user=user)

    stored_path = tmp_path / artifact.storage_path
    assert artifact.artifact_type == DigitalDocumentArtifactType.CANONICAL_PDF
    assert artifact.source_content_hash == document.content_hash
    assert artifact.artifact_metadata["homologation_watermark"] is True
    assert stored_path.is_file()
    assert hashlib.sha256(stored_path.read_bytes()).hexdigest() == artifact.content_sha256
    service.artifacts.add.assert_called_once_with(artifact)
    service.db.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_certificate_signing_guard_requires_flag_and_homologation_target(monkeypatch):
    service = DocumentArtifactService(AsyncMock())
    document = SimpleNamespace(
        document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        source_type="POSSESSION",
        source_id=uuid4(),
    )
    monkeypatch.setattr(settings, "CERTIFICATE_SIGNING_ENABLED", False)
    with pytest.raises(HTTPException) as disabled:
        await service.ensure_certificate_signing_allowed(document)
    assert disabled.value.status_code == 404

    monkeypatch.setattr(settings, "CERTIFICATE_SIGNING_ENABLED", True)
    monkeypatch.setattr(settings, "HOMOLOGATION_CERTIFICATE_TARGETS_ONLY", True)
    service.homologation_targets.get_active = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as not_allowed:
        await service.ensure_certificate_signing_allowed(document)
    assert not_allowed.value.status_code == 403

    service.homologation_targets.get_active = AsyncMock(
        return_value=SimpleNamespace(id=uuid4())
    )
    await service.ensure_certificate_signing_allowed(document)


def test_signature_serialization_keeps_legacy_method_compatible():
    service = DocumentSignatureService(db=None)
    signature = SimpleNamespace(
        id=uuid4(),
        signer_user_id=uuid4(),
        signer_name="Servidor",
        signer_email=None,
        signer_role="PRODUCAO",
        signer_organization_name=None,
        signer_cpf_masked="123.***.***-01",
        content_hash="a" * 64,
        signature_fingerprint="b" * 64,
        signed_at=datetime.now(timezone.utc),
    )

    payload = service._serialize_signature(signature)

    assert payload["signature_method"] == DocumentSignatureMethod.INTERNAL_PASSWORD
    assert payload["artifact_id"] is None
    assert payload["certificate_fingerprint"] is None


def test_document_signature_fk_and_orm_relationship_do_not_cascade_evidence_deletion():
    document_fk = next(
        foreign_key
        for foreign_key in DigitalDocumentArtifact.__table__.foreign_keys
        if foreign_key.parent.name == "document_id"
    )
    assert document_fk.ondelete == "RESTRICT"
    assert DigitalDocument.__mapper__.relationships["artifacts"].passive_deletes is True
    assert "delete-orphan" not in DigitalDocument.__mapper__.relationships["artifacts"].cascade


def test_artifact_serialization_never_exposes_storage_path():
    artifact = SimpleNamespace(
        id=uuid4(),
        document_id=uuid4(),
        artifact_type=DigitalDocumentArtifactType.CANONICAL_PDF,
        version=1,
        source_content_hash="a" * 64,
        content_sha256="b" * 64,
        media_type="application/pdf",
        storage_path="restricted/server/path.pdf",
        size_bytes=123,
        created_at=datetime.now(timezone.utc),
    )

    payload = DocumentArtifactService.serialize_artifact(artifact)

    assert "storage_path" not in payload
    assert payload["download_path"].endswith("/artifacts/canonical")


@pytest.mark.asyncio
async def test_validation_summary_reports_methods_without_reclassifying_legacy_signatures():
    document = SimpleNamespace(
        id=uuid4(),
        document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        status=DigitalDocumentStatus.COMPLETED,
        content_hash="a" * 64,
        signatures=[
            SimpleNamespace(signature_method=None),
            SimpleNamespace(signature_method=DocumentSignatureMethod.ICP_BRASIL_PADES),
        ],
    )
    service = DocumentArtifactService(AsyncMock())
    service.artifacts.list_for_document = AsyncMock(return_value=[])
    service.validations.list_for_document = AsyncMock(return_value=[])

    summary = await service.build_validation_summary(document)

    assert summary["signature_counts_by_method"] == {
        DocumentSignatureMethod.INTERNAL_PASSWORD: 1,
        DocumentSignatureMethod.ICP_BRASIL_PADES: 1,
    }
    assert summary["artifacts"] == []
    assert summary["validations"] == []
