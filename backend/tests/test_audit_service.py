from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import UserRole
from app.services.audit_service import AuditService
from app.core.request_context import (
    RequestAuditContext,
    reset_request_audit_context,
    set_request_audit_context,
)


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


@pytest.mark.asyncio
async def test_record_adds_request_context_and_redacts_sensitive_details():
    repository = FakeAuditRepository()
    service = AuditService(db=None)
    service.audit_logs = repository
    actor = SimpleNamespace(
        id=uuid4(),
        name="Administrador",
        email="admin@frota.local",
        role=UserRole.ADMIN,
    )
    context = RequestAuditContext(
        request_id="audit-12345678",
        ip_address="198.51.100.20",
        user_agent="pytest-agent",
        method="POST",
        path="/api/possession",
        timestamp=datetime(2026, 7, 11, 12, 30, tzinfo=timezone.utc),
    )
    token = set_request_audit_context(context)
    try:
        audit_log = await service.record(
            actor=actor,
            action="UPDATE",
            entity_type="POSSESSION",
            entity_id=uuid4(),
            entity_label="ABC1D23",
            details={
                "driver_document": "52998224725",
                "driver_contact": "+55 31 99999-1234",
                "access_token": "must-not-be-recorded",
                "attachment": b"binary-content",
            },
        )
    finally:
        reset_request_audit_context(token)

    assert audit_log.details["request_context"] == context.as_dict()
    assert audit_log.details["driver_document"] == "***4725"
    assert audit_log.details["driver_contact"] == "***1234"
    assert audit_log.details["access_token"] == "[REDACTED]"
    assert audit_log.details["attachment"] == "[BINARY_OMITTED]"
    assert "must-not-be-recorded" not in str(audit_log.details)
