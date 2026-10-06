from __future__ import annotations

import base64
import hashlib
import os
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import HTTPException
from sqlalchemy.orm import configure_mappers
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.main import app
from app.models.document_signature import (
    CertificateSigningSessionStatus,
    DigitalDocumentArtifactType,
)
from app.schemas.document_signature import CertificateClaimOut
from app.services.certificate_pades_service import PreparedPadesSignature
from app.services.certificate_signing_session_service import (
    CertificateSigningSessionService,
)
from app.services.document_artifact_service import DocumentArtifactService


def _device_proof(private_key, *, device_id: str, path: str, body: bytes, nonce: str = "ab" * 16):
    timestamp = str(int(datetime.now(UTC).timestamp()))
    canonical = (
        f"{timestamp}\n{nonce}\nPOST\n{path}\n{hashlib.sha256(body).hexdigest()}"
    ).encode("utf-8")
    proof = private_key.sign(
        canonical,
        padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32),
        hashes.SHA256(),
    )
    return {
        "X-Frota-Device-Id": device_id,
        "X-Frota-Device-Timestamp": timestamp,
        "X-Frota-Device-Nonce": nonce,
        "X-Frota-Device-Proof": base64.b64encode(proof).decode("ascii"),
    }


def _artifact(*, artifact_type: str, version: int, document_id, source_hash: str, metadata: dict, based_on=None):
    return SimpleNamespace(
        id=uuid4(),
        document_id=document_id,
        artifact_type=artifact_type,
        version=version,
        source_content_hash=source_hash,
        content_sha256=hashlib.sha256(f"{artifact_type}-{version}".encode()).hexdigest(),
        certified_from_artifact_id=getattr(based_on, "id", None),
        artifact_metadata=metadata,
        created_at=datetime.now(UTC),
    )


def test_device_proof_binds_exact_method_path_and_raw_json(monkeypatch):
    monkeypatch.setattr(settings, "SIGNATURE_AGENT_PROOF_MAX_SKEW_SECONDS", 90)
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    spki = private_key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    device_id = hashlib.sha256(spki).hexdigest()
    path = f"/api/document-signatures/certificate-sessions/{uuid4()}/claim"
    raw_body = b'{"device_id":"' + device_id.encode() + b'","certificate_der":"AA=="}'
    headers = _device_proof(
        private_key, device_id=device_id, path=path, body=raw_body
    )

    result = CertificateSigningSessionService._verify_device_proof(
        public_key_spki_base64=base64.b64encode(spki).decode("ascii"),
        expected_device_id=device_id,
        headers=headers,
        method="POST",
        path=path,
        raw_body=raw_body,
    )
    assert result["nonce"] == "ab" * 16

    with pytest.raises(HTTPException) as tampered:
        CertificateSigningSessionService._verify_device_proof(
            public_key_spki_base64=base64.b64encode(spki).decode("ascii"),
            expected_device_id=device_id,
            headers=headers,
            method="POST",
            path=path,
            raw_body=raw_body + b" ",
        )
    assert tampered.value.status_code == 403


def test_prepared_pades_state_survives_service_restart_and_is_hmac_protected(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "SIGNATURE_PREPARED_STATE_DIR", tmp_path)
    service = CertificateSigningSessionService(AsyncMock())
    signing_session = SimpleNamespace(
        id=uuid4(),
        prepared_pdf_path=None,
        prepared_state=None,
        prepared_state_sha256=None,
    )
    prepared = PreparedPadesSignature(
        prepared_pdf=b"%PDF-1.7\nprepared",
        document_digest=b"digest",
        reserved_region_start=100,
        reserved_region_end=300,
        signed_attributes=b"signed-attributes",
        signing_certificate=b"public-certificate",
        certificate_chain=(b"public-intermediate",),
        signature_algorithm="RS256",
        digest_algorithm="sha256",
        field_name="FrotaICP_test",
        prepared_at=datetime.now(UTC),
    )
    service._persist_prepared_state(signing_session, prepared)

    restarted_service = CertificateSigningSessionService(AsyncMock())
    restored = restarted_service._restore_prepared_state(signing_session)

    assert restored == prepared
    assert signing_session.prepared_pdf_path
    assert (tmp_path / signing_session.prepared_pdf_path).is_file()
    signing_session.prepared_state["field_name"] = "tampered"
    with pytest.raises(HTTPException) as invalid:
        restarted_service._restore_prepared_state(signing_session)
    assert invalid.value.status_code == 409


@pytest.mark.asyncio
async def test_unmarked_old_certified_pdf_is_not_selected_after_watermarked_canonical_revision():
    service = CertificateSigningSessionService(AsyncMock())
    document_id = uuid4()
    source_hash = "a" * 64
    target_id = str(uuid4())
    document = SimpleNamespace(id=document_id, content_hash=source_hash)
    old_canonical = _artifact(
        artifact_type=DigitalDocumentArtifactType.CANONICAL_PDF,
        version=1,
        document_id=document_id,
        source_hash=source_hash,
        metadata={"homologation_watermark": False},
    )
    old_certified = _artifact(
        artifact_type=DigitalDocumentArtifactType.CERTIFIED_PDF,
        version=1,
        document_id=document_id,
        source_hash=source_hash,
        metadata={"homologation_watermark": False},
        based_on=old_canonical,
    )
    current_canonical = _artifact(
        artifact_type=DigitalDocumentArtifactType.CANONICAL_PDF,
        version=2,
        document_id=document_id,
        source_hash=source_hash,
        metadata={
            "homologation_watermark": True,
            "homologation_target_id": target_id,
        },
    )
    service.artifacts.list_for_document = AsyncMock(
        return_value=[old_canonical, old_certified, current_canonical]
    )

    selected = await service._select_current_signing_input(
        document=document,
        canonical=current_canonical,
        homologation_target_id=target_id,
    )
    assert selected.id == current_canonical.id

    current_certified = _artifact(
        artifact_type=DigitalDocumentArtifactType.CERTIFIED_PDF,
        version=2,
        document_id=document_id,
        source_hash=source_hash,
        metadata={
            "homologation_watermark": True,
            "homologation_target_id": target_id,
        },
        based_on=current_canonical,
    )
    service.artifacts.list_for_document = AsyncMock(
        return_value=[
            old_canonical,
            old_certified,
            current_canonical,
            current_certified,
        ]
    )
    selected = await service._select_current_signing_input(
        document=document,
        canonical=current_canonical,
        homologation_target_id=target_id,
    )
    assert selected.id == current_certified.id


def test_session_polling_never_serializes_token_or_prepared_public_certificate():
    session = SimpleNamespace(
        id=uuid4(),
        document_id=uuid4(),
        canonical_artifact_id=uuid4(),
        input_artifact_id=uuid4(),
        device=SimpleNamespace(public_key_fingerprint="f" * 64),
        signer_user_id=uuid4(),
        status=CertificateSigningSessionStatus.AWAITING_SIGNATURE,
        expected_content_sha256="a" * 64,
        failure_code=None,
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        claimed_at=datetime.now(UTC),
        completed_at=None,
        cancelled_at=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        one_time_token_hash="secret-hash",
        prepared_state={"signing_certificate": "public-but-ephemeral"},
    )
    payload = CertificateSigningSessionService.serialize_session(session)
    assert "one_time_token" not in payload
    assert "one_time_token_hash" not in payload
    assert "prepared_state" not in payload


def test_certificate_cpf_uses_domain_separated_hmac_not_plain_sha256():
    service = CertificateSigningSessionService(AsyncMock())
    cpf = "52998224725"
    protected = service._protected_cpf_hash(cpf)
    assert protected != hashlib.sha256(cpf.encode()).hexdigest()
    assert cpf not in protected


def test_claim_contract_and_openapi_include_authoritative_metadata_and_agent_paths():
    payload = CertificateClaimOut(
        to_be_signed="AA==",
        signature_algorithm="RS256",
        completion_token="x" * 48,
        document_title="Termo sintÃ©tico",
        document_type="POSSESSION_RESPONSIBILITY_TERM",
        content_hash="a" * 64,
        environment="HOMOLOGACAO",
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
    ).model_dump()
    assert payload["environment"] == "HOMOLOGACAO"
    assert payload["document_title"] == "Termo sintÃ©tico"

    paths = app.openapi()["paths"]
    assert "/api/documents/{document_id}/certificate-sessions" in paths
    assert "/api/certificate-sessions/{session_id}" in paths
    assert "/api/document-signatures/certificate-sessions/{session_id}/claim" in paths
    assert "/api/document-signatures/certificate-sessions/{session_id}/complete" in paths
    assert "/api/document-signatures/agent/pairings/{pairing_id}/complete" in paths
    assert "/api/signature-agent/devices/{device_id}" in paths


def test_certificate_orm_mappers_include_persistent_pairing_and_prepared_state():
    configure_mappers()
    from app.models.document_signature import CertificateSigningSession, SignatureAgentPairing

    assert "prepared_state" in CertificateSigningSession.__table__.columns
    assert "input_artifact_id" in CertificateSigningSession.__table__.columns
    assert "attempt_count" in SignatureAgentPairing.__table__.columns
    assert "consumed_at" in SignatureAgentPairing.__table__.columns


@pytest.mark.asyncio
async def test_certified_file_is_compensated_when_database_flush_rolls_back(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "DIGITAL_DOCUMENT_ARTIFACTS_DIR", tmp_path)
    db = AsyncMock()
    db.flush.side_effect = IntegrityError("insert", {}, RuntimeError("simulated"))
    service = DocumentArtifactService(db)
    service.artifacts.get_latest = AsyncMock(return_value=None)
    service.artifacts.get_by_storage_path = AsyncMock(return_value=None)
    service.artifacts.add = MagicMock()
    document_id = uuid4()
    based_on = SimpleNamespace(
        id=uuid4(),
        document_id=document_id,
        artifact_metadata={
            "homologation_watermark": True,
            "homologation_target_id": str(uuid4()),
        },
    )
    document = SimpleNamespace(
        id=document_id,
        content_hash="a" * 64,
        title="Documento sintÃ©tico",
    )
    user = SimpleNamespace(id=uuid4())

    with pytest.raises(IntegrityError):
        await service.store_certified_artifact(
            document=document,
            based_on=based_on,
            signed_pdf=b"%PDF-1.7\nsigned",
            current_user=user,
        )

    db.rollback.assert_awaited_once()
    assert list(tmp_path.rglob("certified-*.pdf")) == []


@pytest.mark.asyncio
async def test_reconciler_only_removes_old_hash_valid_unreferenced_certified_files(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "DIGITAL_DOCUMENT_ARTIFACTS_DIR", tmp_path)
    document_directory = tmp_path / str(uuid4())
    document_directory.mkdir(parents=True)
    payload = b"%PDF-1.7\norphan"
    digest = hashlib.sha256(payload).hexdigest()
    orphan = document_directory / f"certified-v1-{digest}.pdf"
    orphan.write_bytes(payload)
    old = datetime.now(UTC).timestamp() - 7200
    os.utime(orphan, (old, old))
    unrelated = document_directory / "notes.txt"
    unrelated.write_text("preserve", encoding="utf-8")

    service = DocumentArtifactService(AsyncMock())
    service.artifacts.list_storage_paths = AsyncMock(return_value=set())
    removed = await service.reconcile_orphaned_certified_files(
        minimum_age_seconds=3600
    )

    assert removed == [orphan.relative_to(tmp_path).as_posix()]
    assert not orphan.exists()
    assert unrelated.is_file()
