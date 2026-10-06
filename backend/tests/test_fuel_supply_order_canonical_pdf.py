from __future__ import annotations

import hashlib
from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.models.document_signature import (
    DigitalDocumentArtifactType,
    DigitalDocumentType,
)
from app.services.document_artifact_service import DocumentArtifactService
from app.services.document_signature_service import DocumentSignatureService
from app.services.fuel_supply_order_pdf_service import (
    FUEL_SUPPLY_ORDER_CANONICAL_SCHEMA,
    FuelSupplyOrderPdfService,
)


def _fuel_order_snapshot() -> dict:
    return {
        "schema_version": "fuel-supply-order.v1",
        "document_type": DigitalDocumentType.FUEL_SUPPLY_ORDER,
        "source_type": "FUEL_SUPPLY_ORDER",
        "source_id": str(uuid4()),
        "title": "Ordem de abastecimento AB-12345678",
        "request_number": "AB-12345678",
        "validation_code": "OA-ABCDEF123456",
        "public_validation_path": "/validar/ordem-abastecimento/OA-ABCDEF123456",
        "status": "OPEN",
        "vehicle": {
            "id": str(uuid4()),
            "plate": "ABC1D23",
            "brand": "Marca",
            "model": "Modelo",
        },
        "organization": {
            "id": str(uuid4()),
            "name": "Secretaria de Testes",
        },
        "fuel_station": {
            "id": str(uuid4()),
            "name": "Posto Sintético HML",
            "cnpj": "00.000.000/0001-00",
            "address": "Rua de Homologação, 10",
            "phone": "(73) 3000-0000",
        },
        "created_by_name": "Servidor de homologação",
        "confirmed_by_name": None,
        "requested_liters": 42.5,
        "notes": "Registro sintético exclusivo para testes.",
        "expires_at": "2026-08-18T15:30:00Z",
        "confirmed_at": None,
        "created_at": "2026-08-17T15:30:00Z",
    }


def _snapshot_hash(snapshot: dict) -> str:
    return DocumentSignatureService(db=None).build_hash_for_snapshot(snapshot)


def test_fuel_order_canonical_pdf_is_byte_deterministic_and_uses_only_snapshot():
    snapshot = _fuel_order_snapshot()
    content_hash = _snapshot_hash(snapshot)

    first = FuelSupplyOrderPdfService.build_canonical_pdf(
        snapshot,
        content_hash=content_hash,
        homologation_watermark=True,
    )
    second = FuelSupplyOrderPdfService.build_canonical_pdf(
        deepcopy(snapshot),
        content_hash=content_hash,
        homologation_watermark=True,
    )

    assert first == second
    assert first.startswith(b"%PDF-1.4")
    assert hashlib.sha256(first).hexdigest() == hashlib.sha256(second).hexdigest()


def test_fuel_order_canonical_pdf_changes_when_frozen_source_changes():
    original = _fuel_order_snapshot()
    changed = deepcopy(original)
    changed["notes"] = "Outra autorização sintética."

    first = FuelSupplyOrderPdfService.build_canonical_pdf(
        original,
        content_hash=_snapshot_hash(original),
    )
    second = FuelSupplyOrderPdfService.build_canonical_pdf(
        changed,
        content_hash=_snapshot_hash(changed),
    )

    assert first != second
    assert hashlib.sha256(first).hexdigest() != hashlib.sha256(second).hexdigest()


def test_fuel_order_canonical_pdf_rejects_wrong_document_type_and_invalid_hash():
    snapshot = _fuel_order_snapshot()
    snapshot["document_type"] = DigitalDocumentType.POSSESSION_LOAN_TERM

    with pytest.raises(ValueError, match="ordem de abastecimento"):
        FuelSupplyOrderPdfService.build_canonical_pdf(snapshot, content_hash="a" * 64)

    snapshot["document_type"] = DigitalDocumentType.FUEL_SUPPLY_ORDER
    with pytest.raises(ValueError, match="Hash"):
        FuelSupplyOrderPdfService.build_canonical_pdf(snapshot, content_hash="not-a-sha256")


@pytest.mark.asyncio
async def test_fuel_order_artifact_is_persisted_with_versioned_renderer_metadata(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "CANONICAL_DOCUMENT_ARTIFACTS_ENABLED", True)
    monkeypatch.setattr(settings, "DIGITAL_DOCUMENT_ARTIFACTS_DIR", tmp_path)
    service = DocumentArtifactService(AsyncMock())
    service.artifacts.get_latest = AsyncMock(return_value=None)
    service.artifacts.add = MagicMock()
    target_id = uuid4()
    service.homologation_targets.get_active = AsyncMock(return_value=SimpleNamespace(id=target_id))
    service.audit.record = AsyncMock()
    snapshot = _fuel_order_snapshot()
    document = SimpleNamespace(
        id=uuid4(),
        document_type=DigitalDocumentType.FUEL_SUPPLY_ORDER,
        source_type="FUEL_SUPPLY_ORDER",
        source_id=uuid4(),
        content_hash=_snapshot_hash(snapshot),
        snapshot=snapshot,
        title="Ordem sintética",
    )
    user = SimpleNamespace(id=uuid4())

    artifact = await service.ensure_canonical_artifact(document, current_user=user)

    stored_path = tmp_path / artifact.storage_path
    assert artifact.artifact_type == DigitalDocumentArtifactType.CANONICAL_PDF
    assert artifact.source_content_hash == document.content_hash
    assert artifact.artifact_metadata == {
        "schema_version": FUEL_SUPPLY_ORDER_CANONICAL_SCHEMA,
        "scope": "FUEL_SUPPLY_ORDER_AUTHORIZATION",
        "deterministic": True,
        "homologation_watermark": True,
        "homologation_target_id": str(target_id),
    }
    assert stored_path.is_file()
    assert hashlib.sha256(stored_path.read_bytes()).hexdigest() == artifact.content_sha256
    service.artifacts.add.assert_called_once_with(artifact)
    service.db.flush.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "document_type",
    [
        DigitalDocumentType.POSSESSION_LOAN_TERM,
        DigitalDocumentType.POSSESSION_RETURN_TERM,
    ],
)
async def test_historical_terms_fail_explicitly_when_original_bytes_are_not_preserved(
    monkeypatch,
    document_type,
):
    monkeypatch.setattr(settings, "CANONICAL_DOCUMENT_ARTIFACTS_ENABLED", True)
    service = DocumentArtifactService(AsyncMock())
    service.artifacts.get_latest = AsyncMock()
    document = SimpleNamespace(document_type=document_type)

    with pytest.raises(HTTPException) as exc:
        await service.ensure_canonical_artifact(
            document,
            current_user=SimpleNamespace(id=uuid4()),
        )

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "HISTORICAL_CANONICAL_SOURCE_INSUFFICIENT"
    service.artifacts.get_latest.assert_not_awaited()


def test_canonical_capability_declares_fuel_and_excludes_historical_terms():
    assert DocumentArtifactService.supports_canonical_artifact(DigitalDocumentType.FUEL_SUPPLY_ORDER)
    assert DocumentArtifactService.supports_canonical_artifact(
        DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM
    )
    assert not DocumentArtifactService.supports_canonical_artifact(DigitalDocumentType.POSSESSION_LOAN_TERM)
    assert not DocumentArtifactService.supports_canonical_artifact(DigitalDocumentType.POSSESSION_RETURN_TERM)
