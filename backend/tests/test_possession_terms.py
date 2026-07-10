from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

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
        photos=[SimpleNamespace(photo_path="possession_photos/evidence.jpg")],
        document_path="possession_documents/loan.pdf",
        document_name="loan.pdf",
        return_document_path=None if active else "possession_documents/return.pdf",
        return_document_name=None if active else "return.pdf",
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
async def test_delete_possession_records_audit_deletes_record_and_cleans_files():
    db = FakeDbSession()
    actor = SimpleNamespace(id=uuid4())
    record = build_record(active=False)
    repository = FakePossessionRepository(record)
    audit = FakeAuditService()
    cleaned_paths = []

    service = PossessionService(db=db)
    service.possessions = repository
    service.audit = audit
    service._cleanup_files = lambda paths: cleaned_paths.extend(paths)

    await service.delete(record.id, actor)

    assert repository.deleted is record
    assert db.committed is True
    assert db.rolled_back is False
    assert audit.records[0]["action"] == "DELETE"
    assert audit.records[0]["entity_type"] == "POSSESSION"
    assert audit.records[0]["entity_id"] == record.id
    assert audit.records[0]["details"]["driver_name"] == record.driver_name
    assert audit.records[0]["details"]["is_active"] is False
    assert len(cleaned_paths) == 4
