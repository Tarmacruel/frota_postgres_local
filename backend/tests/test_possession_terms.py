from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.user import UserRole
from app.services.possession_service import PossessionService


class FakePossessionRepository:
    def __init__(self, record=None):
        self.record = record
        self.deleted = None

    async def has_validation_code(self, _validation_code):
        return False

    async def get_by_id(self, _possession_id):
        return self.record

    async def get_by_loan_term_validation_code(self, _validation_code):
        return self.record

    async def get_by_return_term_validation_code(self, _validation_code):
        return self.record

    async def delete(self, record):
        self.deleted = record


class FakeAuditService:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


class FakeDbSession:
    def __init__(self):
        self.committed = False
        self.rolled_back = False

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


def build_record(*, active=False):
    return SimpleNamespace(
        id=uuid4(),
        vehicle_id=uuid4(),
        driver_id=None,
        vehicle=SimpleNamespace(plate="TOA5G07", brand="VW", model="Nova Track"),
        driver_name="Itamar Alves Rodrigues",
        driver_document="43098",
        driver_contact="73999990000",
        start_date=datetime(2026, 5, 2, 11, 10, tzinfo=timezone.utc),
        end_date=None if active else datetime(2026, 5, 8, 14, 20, tzinfo=timezone.utc),
        start_odometer_km=1861,
        end_odometer_km=None if active else 1940,
        observation="Sem avarias aparentes.",
        created_at=datetime(2026, 5, 2, 11, 10, tzinfo=timezone.utc),
        is_active=active,
        photo_path="possession_photos/legacy.jpg",
        photo_captured_at=datetime(2026, 5, 2, 11, 11, tzinfo=timezone.utc),
        capture_latitude=-17.54,
        capture_longitude=-39.74,
        capture_accuracy_meters=8.0,
        photos=[
            SimpleNamespace(
                id=uuid4(),
                photo_path="possession_photos/evidence.jpg",
                photo_captured_at=datetime(2026, 5, 2, 11, 12, tzinfo=timezone.utc),
                capture_latitude=-17.54,
                capture_longitude=-39.74,
                capture_accuracy_meters=8.0,
            )
        ],
        document_path="possession_documents/loan.pdf",
        document_name="loan.pdf",
        document_uploaded_at=datetime(2026, 5, 2, 11, 15, tzinfo=timezone.utc),
        return_document_path=None if active else "possession_documents/return.pdf",
        return_document_name=None if active else "return.pdf",
        return_document_uploaded_at=None if active else datetime(2026, 5, 8, 14, 25, tzinfo=timezone.utc),
        loan_term_validation_code="TE-ABC123DEF456",
        return_term_validation_code="TD-ABC123DEF456",
    )


@pytest.mark.asyncio
async def test_generate_validation_code_uses_requested_prefix():
    service = PossessionService(db=None)
    service.possessions = FakePossessionRepository()

    code = await service._generate_validation_code("TE")

    assert code.startswith("TE-")
    assert len(code) == 15


@pytest.mark.asyncio
async def test_public_loan_term_masks_driver_document():
    service = PossessionService(db=None)
    service.possessions = FakePossessionRepository(build_record())

    payload = await service.get_public_term("te-abc123def456", term_type="loan")

    assert payload["validation_code"] == "TE-ABC123DEF456"
    assert payload["public_validation_path"] == "/validar/termo-emprestimo/TE-ABC123DEF456"
    assert payload["driver_document_masked"] == "430.***.***-98"
    assert "driver_contact" not in payload
    assert payload["signature_summary"]["status"] == "UNSIGNED"
    assert payload["vehicle_description"] == "TOA5G07 - VW Nova Track"


@pytest.mark.asyncio
async def test_public_return_term_is_unavailable_until_possession_ends():
    service = PossessionService(db=None)
    service.possessions = FakePossessionRepository(build_record(active=True))

    with pytest.raises(HTTPException) as exc:
        await service.get_public_term("TD-ABC123DEF456", term_type="return")

    assert exc.value.status_code == 404
    assert exc.value.detail == "Termo de devolução ainda não disponível"


@pytest.mark.asyncio
async def test_delete_possession_is_denied_audited_and_preserves_record_and_files():
    db = FakeDbSession()
    actor = SimpleNamespace(id=uuid4())
    record = build_record(active=False)
    repository = FakePossessionRepository(record)
    audit = FakeAuditService()
    service = PossessionService(db=db)
    service.possessions = repository
    service.audit = audit

    with pytest.raises(HTTPException) as exc:
        await service.reject_hard_delete(record.id, actor)

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "POSSESSION_HARD_DELETE_DISABLED"
    assert repository.deleted is None
    assert db.committed is True
    assert db.rolled_back is False
    assert audit.records[0]["action"] == "DELETE_DENIED"
    assert audit.records[0]["entity_type"] == "POSSESSION"
    assert audit.records[0]["entity_id"] == record.id
    assert audit.records[0]["details"]["reason"] == "POSSESSION_HARD_DELETE_DISABLED"
    assert audit.records[0]["details"]["is_active"] is False


def test_possession_serialization_applies_role_data_exposure():
    service = PossessionService(db=None)
    record = build_record(active=False)

    restricted = service._serialize(
        record,
        can_view_location=False,
        can_view_personal_data=False,
    )
    operational = service._serialize(
        record,
        can_view_location=True,
        can_view_personal_data=True,
    )

    assert restricted["driver_document"] == "430.***.***-98"
    assert restricted["driver_contact"] is None
    assert restricted["document_url"] is None
    assert restricted["loan_term_url"] is None
    assert restricted["return_term_url"] is None
    assert restricted["capture_location"] is None

    assert operational["driver_document"] == record.driver_document
    assert operational["driver_contact"] == record.driver_contact
    assert operational["document_url"] == f"/api/possession/{record.id}/document"
    assert operational["loan_term_url"] == f"/api/possession/{record.id}/documents/loan-term"
    assert operational["return_term_url"] == f"/api/possession/{record.id}/documents/return-term"
    assert operational["capture_location"]["latitude"] == pytest.approx(-17.54)


@pytest.mark.asyncio
async def test_standard_profile_cannot_download_integral_possession_document():
    service = PossessionService(db=None)
    service.possessions = FakePossessionRepository(build_record(active=False))
    actor = SimpleNamespace(id=uuid4(), role=UserRole.PADRAO)

    with pytest.raises(HTTPException) as exc:
        await service.get_document_file(uuid4(), current_user=actor)

    assert exc.value.status_code == 403


def test_production_profile_has_operational_personal_data_and_location_access():
    service = PossessionService(db=None)
    actor = SimpleNamespace(role=UserRole.PRODUCAO)

    assert service._can_view_personal_data(actor) is True
    assert service._can_view_location(actor) is True


def test_restricted_signature_summary_omits_signer_emails():
    service = PossessionService(db=None)
    summary = {
        "status": "PENDING",
        "signatures": [{"signer_name": "Servidor", "signer_email": "servidor@frota.local"}],
        "requests": [{"requested_signer_name": "Gestor", "requested_signer_email": "gestor@frota.local"}],
    }

    restricted = service._sanitize_signature_summary(summary, can_view_personal_data=False)

    assert "signer_email" not in restricted["signatures"][0]
    assert "requested_signer_email" not in restricted["requests"][0]
    assert summary["signatures"][0]["signer_email"] == "servidor@frota.local"
