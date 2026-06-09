from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.document_signature import DigitalDocumentStatus, DocumentSignatureRequestStatus
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
