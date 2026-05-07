from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import UserRole
from app.services.audit_service import AuditService


class FakeAuditRepository:
    def __init__(self):
        self.created = None

    async def create(self, audit_log):
        self.created = audit_log
        return audit_log


@pytest.mark.asyncio
async def test_record_json_encodes_details():
    repository = FakeAuditRepository()
    service = AuditService(db=None)
    service.audit_logs = repository

    actor = SimpleNamespace(
        id=uuid4(),
        name="Administrador",
        email="admin@frota.local",
        role=UserRole.ADMIN,
    )
    entity_id = uuid4()
    detail_id = uuid4()

    audit_log = await service.record(
        actor=actor,
        action="ORDER_CREATED",
        entity_type="FUEL_SUPPLY_ORDER",
        entity_id=entity_id,
        entity_label="TOA5G37",
        details={
            "id": detail_id,
            "status": FuelSupplyOrderStatus.OPEN,
            "created_at": datetime(2026, 4, 24, 12, 30, tzinfo=timezone.utc),
        },
    )

    assert repository.created is audit_log
    assert audit_log.details["id"] == str(detail_id)
    assert audit_log.details["status"] == "OPEN"
    assert audit_log.details["created_at"] == "2026-04-24T12:30:00+00:00"
