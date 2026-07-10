from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.document_signature import DigitalDocumentStatus, DigitalDocumentType, DocumentSignatureRequestStatus
from app.models.user import UserRole
from app.services.document_signature_service import DocumentSignatureService


def test_document_hash_is_deterministic_for_canonical_snapshot():
    service = DocumentSignatureService(db=None)

    first = {
        "vehicle": {"plate": "ABC1D23", "model": "Track"},
        "driver": {"name": "Servidor", "document_sha256": "abc"},
    }
    second = {
        "driver": {"document_sha256": "abc", "name": "Servidor"},
        "vehicle": {"model": "Track", "plate": "ABC1D23"},
    }

    assert service.build_hash_for_snapshot(first) == service.build_hash_for_snapshot(second)


@pytest.mark.asyncio
async def test_joint_signature_requires_creator_and_requested_signer():
    creator_id = uuid4()
    signer_id = uuid4()
    now = datetime.now(timezone.utc)
    service = DocumentSignatureService(db=None)
    document = SimpleNamespace(
        created_by_user_id=creator_id,
        required_signatures=2,
        status=DigitalDocumentStatus.PENDING,
        completed_at=None,
        updated_at=None,
        signatures=[SimpleNamespace(signer_user_id=signer_id)],
        signature_requests=[SimpleNamespace(status=DocumentSignatureRequestStatus.SIGNED)],
    )

    await service._refresh_document_status(document, now=now)

    assert document.status == DigitalDocumentStatus.PENDING
    assert document.required_signatures == 2
    assert document.completed_at is None

    document.signatures.append(SimpleNamespace(signer_user_id=creator_id))
    await service._refresh_document_status(document, now=now)

    assert document.status == DigitalDocumentStatus.COMPLETED
    assert document.completed_at == now


def test_joint_signature_request_requires_requested_signer_cpf():
    service = DocumentSignatureService(db=None)
    current_user = SimpleNamespace(role=UserRole.ADMIN, organization_id=None)
    requested_signer = SimpleNamespace(must_change_password=False, cpf=None, organization_id=None)

    with pytest.raises(HTTPException) as exc:
        service._ensure_signer_can_be_requested(current_user=current_user, requested_signer=requested_signer)

    assert exc.value.status_code == 409


def test_signature_serialization_exposes_only_masked_cpf():
    service = DocumentSignatureService(db=None)
    signed_at = datetime.now(timezone.utc)
    signature = SimpleNamespace(
        id=uuid4(),
        signer_user_id=uuid4(),
        signer_name="Servidor",
        signer_email="servidor@frota.local",
        signer_role="PRODUCAO",
        signer_organization_name="Secretaria",
        signer_cpf_masked="529.***.***-25",
        signer_cpf_hash="secret-hash",
        content_hash="content",
        signature_fingerprint="fingerprint",
        signed_at=signed_at,
    )

    payload = service._serialize_signature(signature)

    assert payload["signer_cpf_masked"] == "529.***.***-25"
    assert "signer_cpf_hash" not in payload


def test_standard_profile_cannot_mutate_legacy_possession_term_signature():
    service = DocumentSignatureService(db=None)
    user = SimpleNamespace(role=UserRole.PADRAO)

    with pytest.raises(HTTPException) as exc:
        service._ensure_possession_term_mutation_allowed(user, DigitalDocumentType.POSSESSION_LOAN_TERM)

    assert exc.value.status_code == 403


def test_production_profile_can_mutate_legacy_possession_term_signature():
    service = DocumentSignatureService(db=None)
    user = SimpleNamespace(role=UserRole.PRODUCAO)

    service._ensure_possession_term_mutation_allowed(user, DigitalDocumentType.POSSESSION_RETURN_TERM)
