from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.services.possession_service import PossessionService


class FakePossessionRepository:
    def __init__(self, record=None):
        self.record = record

    async def has_validation_code(self, _validation_code):
        return False

    async def get_by_loan_term_validation_code(self, _validation_code):
        return self.record

    async def get_by_return_term_validation_code(self, _validation_code):
        return self.record


def build_record(*, active=False):
    return SimpleNamespace(
        id=uuid4(),
        vehicle_id=uuid4(),
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
    assert payload["vehicle_description"] == "TOA5G07 - VW Nova Track"


@pytest.mark.asyncio
async def test_public_return_term_is_unavailable_until_possession_ends():
    service = PossessionService(db=None)
    service.possessions = FakePossessionRepository(build_record(active=True))

    with pytest.raises(HTTPException) as exc:
        await service.get_public_term("TD-ABC123DEF456", term_type="return")

    assert exc.value.status_code == 404
    assert exc.value.detail == "Termo de devolucao ainda nao disponivel"
