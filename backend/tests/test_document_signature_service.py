from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.document_signature import DigitalDocumentStatus, DigitalDocumentType, DocumentSignatureRequestStatus
from app.models.user import UserRole
from app.core.possession_responsibility import (
    RESPONSIBILITY_ACCEPTANCE_TEXT,
    RESPONSIBILITY_ACCEPTANCE_VERSION,
    RESPONSIBILITY_TERM_MODEL_VERSION,
)
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
async def test_document_creation_rebuilds_source_context_after_lock():
    service = DocumentSignatureService(db=AsyncMock())
    source_id = uuid4()
    events = []
    old_context = {"content_hash": "old"}
    fresh_context = {"content_hash": "fresh"}
    existing = SimpleNamespace(content_hash="fresh")

    async def build_context(*_args, **kwargs):
        events.append(("context", kwargs.get("refresh_source", False)))
        return fresh_context if kwargs.get("refresh_source") else old_context

    async def lock_source(*_args):
        events.append(("lock", None))

    service._build_document_context = AsyncMock(side_effect=build_context)
    service._lock_source = AsyncMock(side_effect=lock_source)
    service._get_active_document = AsyncMock(return_value=existing)
    service._serialize_document = MagicMock(return_value={"content_hash": "fresh"})
    user = SimpleNamespace(
        id=uuid4(),
        role=UserRole.PRODUCAO,
        permissions={"possession": {"can_edit": True}},
    )

    result = await service.create_document(
        SimpleNamespace(
            document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            source_id=source_id,
        ),
        user,
    )

    assert result["content_hash"] == "fresh"
    assert events == [("context", False), ("lock", None), ("context", True)]
    service._get_active_document.assert_awaited_once_with(
        DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        source_id,
        for_update=True,
    )
    service.db.commit.assert_not_awaited()


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


@pytest.mark.asyncio
async def test_declined_joint_request_no_longer_blocks_completed_primary_signature():
    creator_id = uuid4()
    now = datetime.now(timezone.utc)
    service = DocumentSignatureService(db=None)
    document = SimpleNamespace(
        created_by_user_id=creator_id,
        required_signatures=2,
        status=DigitalDocumentStatus.PENDING,
        completed_at=None,
        updated_at=None,
        signatures=[SimpleNamespace(signer_user_id=creator_id)],
        signature_requests=[
            SimpleNamespace(
                status=DocumentSignatureRequestStatus.DECLINED,
                requested_signer_user_id=uuid4(),
            )
        ],
    )

    await service._refresh_document_status(document, now=now)

    assert document.status == DigitalDocumentStatus.COMPLETED
    assert document.required_signatures == 1
    assert document.completed_at == now


@pytest.mark.asyncio
async def test_signing_updates_loaded_collection_before_recalculating_status(monkeypatch):
    service = DocumentSignatureService(db=AsyncMock())
    user_id = uuid4()
    document = SimpleNamespace(
        id=uuid4(),
        document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        source_type="POSSESSION",
        source_id=uuid4(),
        content_hash="a" * 64,
        status=DigitalDocumentStatus.PENDING,
        created_by_user_id=user_id,
        required_signatures=1,
        completed_at=None,
        updated_at=None,
        signatures=[],
        signature_requests=[],
    )
    user = SimpleNamespace(
        id=user_id,
        name="Servidor responsável",
        email="servidor@example.test",
        role=UserRole.PRODUCAO,
        organization_id=None,
        organization_name=None,
        cpf="52998224725",
        password_hash="hash",
        must_change_password=False,
        permissions={"possession": {"can_edit": True}},
    )
    service._require_document = AsyncMock(return_value=document)
    service._lock_source = AsyncMock()
    service._ensure_document_visible = AsyncMock()
    service._record_audit = AsyncMock()
    service._serialize_document = MagicMock(return_value={"status": "COMPLETED"})
    monkeypatch.setattr("app.services.document_signature_service.verify_password", lambda *_: True)

    result = await service.sign_document(
        document.id,
        SimpleNamespace(current_password="senha-segura"),
        user,
    )

    assert result["status"] == "COMPLETED"
    assert len(document.signatures) == 1
    assert document.status == DigitalDocumentStatus.COMPLETED
    service.db.commit.assert_awaited_once()


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


@pytest.mark.asyncio
async def test_unique_responsibility_signature_hashes_canonical_delivery_scope_only():
    service = DocumentSignatureService(db=AsyncMock())
    possession_id = uuid4()
    record = SimpleNamespace(
        id=possession_id,
        public_number=358,
        vehicle_id=uuid4(),
        vehicle=SimpleNamespace(plate="ABC1D23", brand="Marca", model="Modelo"),
        driver_id=uuid4(),
        driver=SimpleNamespace(organization_id=None),
        driver_name="Condutor de teste",
        driver_document="12345678901",
        driver_contact="75999999999",
        start_date=datetime(2026, 7, 13, 19, 0, tzinfo=timezone.utc),
        start_odometer_km=100.0,
        observation="Entrega conferida",
        photos=[],
        trips=[SimpleNamespace(sequence_number=1, origin="Primeira rota")],
    )
    service.possessions.get_term_graph = AsyncMock(return_value=record)
    service._ensure_vehicle_visible_to_user = AsyncMock()
    user = SimpleNamespace(role=UserRole.PRODUCAO, organization_id=None)

    first = await service._build_possession_responsibility_context(possession_id, current_user=user)
    record.trips.append(SimpleNamespace(sequence_number=2, origin="Nova rota"))
    second = await service._build_possession_responsibility_context(possession_id, current_user=user)

    assert first["content_hash"] == second["content_hash"]
    assert first["public_validation_code"] is None
    assert first["public_validation_path"] is None
    assert first["snapshot"]["document_model_version"] == RESPONSIBILITY_TERM_MODEL_VERSION
    assert first["snapshot"]["acceptance"] == {
        "version": RESPONSIBILITY_ACCEPTANCE_VERSION,
        "text": RESPONSIBILITY_ACCEPTANCE_TEXT,
    }
    assert "trips" not in first["snapshot"]
    altered = {**first["snapshot"], "acceptance": {"version": "1.1", "text": "Texto alterado"}}
    assert service.build_hash_for_snapshot(altered) != first["content_hash"]


def test_standard_profile_cannot_mutate_unique_responsibility_signature():
    service = DocumentSignatureService(db=None)
    with pytest.raises(HTTPException) as exc:
        service._ensure_possession_term_mutation_allowed(
            SimpleNamespace(role=UserRole.PADRAO),
            DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_document_lookup_enforces_module_permission_before_loading_source_context():
    service = DocumentSignatureService(db=AsyncMock())
    document = SimpleNamespace(document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM)
    service._require_document = AsyncMock(return_value=document)
    service._ensure_document_visible = AsyncMock()
    user = SimpleNamespace(
        role=UserRole.POSTO,
        permissions={"possession": {"can_view": False}},
    )

    with pytest.raises(HTTPException) as exc:
        await service.get_document(uuid4(), user)

    assert exc.value.status_code == 403
    service._ensure_document_visible.assert_not_awaited()


@pytest.mark.asyncio
async def test_joint_signature_rejects_non_writer_before_stale_document_check():
    service = DocumentSignatureService(db=AsyncMock())
    document = SimpleNamespace(document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM)
    service._require_document = AsyncMock(return_value=document)
    service._ensure_document_visible = AsyncMock()
    user = SimpleNamespace(
        role=UserRole.PADRAO,
        permissions={"possession": {"can_view": True, "can_edit": False}},
    )

    with pytest.raises(HTTPException) as exc:
        await service.request_joint_signature(
            uuid4(),
            SimpleNamespace(requested_signer_user_id=uuid4(), message=None),
            user,
        )

    assert exc.value.status_code == 403
    service._ensure_document_visible.assert_not_awaited()


@pytest.mark.asyncio
async def test_standard_document_lookup_omits_snapshot_evidence_and_signature_contact_data():
    service = DocumentSignatureService(db=AsyncMock())
    document = SimpleNamespace(document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM)
    service._require_document = AsyncMock(return_value=document)
    service._ensure_document_visible = AsyncMock()
    service._serialize_document = MagicMock(return_value={
        "document_id": uuid4(),
        "document_type": DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        "source_id": uuid4(),
        "status": DigitalDocumentStatus.COMPLETED,
        "content_hash": "a" * 64,
        "content_hash_short": "a" * 12,
        "required_signatures": 1,
        "signed_count": 1,
        "pending_count": 0,
        "declined_count": 0,
        "is_complete": True,
        "signatures": [{
            "signer_name": "Servidor",
            "signer_email": "servidor@example.test",
            "signer_cpf_masked": "123.***.***-01",
            "signer_organization_name": "Secretaria",
        }],
        "requests": [{
            "requested_signer_name": "Coassinante",
            "requested_signer_email": "coassinante@example.test",
            "message": "Mensagem interna",
        }],
    })
    user = SimpleNamespace(
        role=UserRole.PADRAO,
        permissions={"possession": {"can_view": True}},
    )

    payload = await service.get_document(uuid4(), user)

    service._serialize_document.assert_called_once_with(
        document,
        include_snapshot=False,
        include_evidence=False,
    )
    assert payload["document_id"] is None
    assert payload["source_id"] is None
    assert payload["content_hash"] is None
    assert payload["content_hash_short"] is None
    assert payload["signatures"] == []
    assert payload["requests"] == []
    assert payload["status"] == DigitalDocumentStatus.COMPLETED
    assert payload["signed_count"] == 1


@pytest.mark.asyncio
async def test_validated_summary_supersedes_stale_signature_before_pdf_use():
    service = DocumentSignatureService(db=AsyncMock())
    source_id = uuid4()
    document = SimpleNamespace(content_hash="old", document_type=DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM)
    service._get_active_document = AsyncMock(return_value=document)
    service._build_document_context = AsyncMock(return_value={"content_hash": "new"})
    service._lock_source = AsyncMock()
    service._supersede_document = AsyncMock()
    user = SimpleNamespace(permissions={"possession": {"can_view": True}})

    summary = await service.get_validated_summary_for_source(
        DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        source_id,
        current_user=user,
    )

    assert summary["status"] == "UNSIGNED"
    service._supersede_document.assert_awaited_once()
    service.db.flush.assert_awaited_once()
    service.db.commit.assert_not_awaited()


def test_individual_override_cannot_expand_signature_mutation_permission():
    service = DocumentSignatureService(db=None)
    user = SimpleNamespace(
        role=UserRole.PRODUCAO,
        permissions={"possession": {"can_view": True, "can_edit": False}},
    )
    with pytest.raises(HTTPException) as exc:
        service._ensure_module_permission(
            user,
            DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            "edit",
        )
    assert exc.value.status_code == 403


def test_legacy_public_projection_preserves_validation_and_minimizes_people_data():
    document_id = uuid4()
    summary = {
        "document_id": document_id,
        "status": DigitalDocumentStatus.COMPLETED,
        "content_hash": "a" * 64,
        "evidence_hmac": "secret",
        "snapshot": {"driver_document": "restricted"},
        "created_by_user_id": uuid4(),
        "signatures": [
            {
                "id": uuid4(),
                "signer_name": "Servidor histórico",
                "signer_email": "restricted@example.test",
                "signer_cpf_masked": "123.***.***-01",
                "signer_organization_name": "Unidade interna",
                "content_hash": "a" * 64,
                "signature_fingerprint": "b" * 64,
                "signed_at": datetime.now(timezone.utc),
            }
        ],
        "requests": [{"message": "restrita"}],
    }

    public = DocumentSignatureService.sanitize_summary_for_legacy_public_view(summary)

    assert public["document_id"] == document_id
    assert public["content_hash"] == "a" * 64
    assert public["signatures"][0]["signer_name"] == "Servidor histórico"
    assert "signer_email" not in public["signatures"][0]
    assert "signer_cpf_masked" not in public["signatures"][0]
    assert "signer_organization_name" not in public["signatures"][0]
    assert public["requests"] == []
    assert "snapshot" not in public
    assert "evidence_hmac" not in public
