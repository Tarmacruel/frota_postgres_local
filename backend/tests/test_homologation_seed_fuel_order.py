from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.models.document_signature import DigitalDocumentType, HomologationSigningTarget
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.user import UserRole
from scripts import seed_homologation_signing_targets as seed_module
from scripts.seed_homologation_signing_targets import (
    FIXED_DELIVERY_AT,
    FIXED_ORDER_EXPIRES_AT,
    SYNTHETIC_ORDER_NOTES,
    SYNTHETIC_ORDER_VALIDATION_CODE,
    SYNTHETIC_REASON,
    SYNTHETIC_USER_EMAIL,
    _ensure_fuel_order,
    _ensure_synthetic_user,
    _ensure_target,
)


def _resources():
    return {
        "organization": SimpleNamespace(id=uuid4()),
        "vehicle": SimpleNamespace(id=uuid4()),
        "driver": SimpleNamespace(id=uuid4()),
        "station": SimpleNamespace(id=uuid4()),
        "creator": SimpleNamespace(id=uuid4()),
    }


def _session_with_scalar(value):
    return SimpleNamespace(
        scalar=AsyncMock(return_value=value),
        add=MagicMock(),
        flush=AsyncMock(),
    )


def _existing_order(resources) -> FuelSupplyOrder:
    order = FuelSupplyOrder(
        vehicle_id=resources["vehicle"].id,
        driver_id=resources["driver"].id,
        organization_id=resources["organization"].id,
        fuel_station_id=resources["station"].id,
        validation_code=SYNTHETIC_ORDER_VALIDATION_CODE,
        status=FuelSupplyOrderStatus.OPEN,
        expires_at=FIXED_ORDER_EXPIRES_AT,
        created_by_user_id=resources["creator"].id,
        confirmed_by_user_id=None,
        requested_liters=Decimal("40.000"),
        max_amount=None,
        requester_contact=None,
        notes=SYNTHETIC_ORDER_NOTES,
        confirmed_at=None,
        created_at=FIXED_DELIVERY_AT,
        updated_at=FIXED_DELIVERY_AT,
    )
    order.id = uuid4()
    return order


@pytest.mark.asyncio
async def test_seed_builds_reserved_fuel_order_without_touching_existing_records():
    resources = _resources()
    session = _session_with_scalar(None)

    order = await _ensure_fuel_order(session, **resources)

    assert order.validation_code == SYNTHETIC_ORDER_VALIDATION_CODE
    assert order.status == FuelSupplyOrderStatus.OPEN
    assert order.vehicle_id == resources["vehicle"].id
    assert order.driver_id == resources["driver"].id
    assert order.organization_id == resources["organization"].id
    assert order.fuel_station_id == resources["station"].id
    assert order.created_by_user_id == resources["creator"].id
    assert order.requested_liters == Decimal("40.000")
    assert order.created_at == FIXED_DELIVERY_AT
    assert order.expires_at == FIXED_ORDER_EXPIRES_AT
    session.add.assert_called_once_with(order)
    session.flush.assert_awaited_once()


@pytest.mark.asyncio
async def test_seed_reuses_an_exact_synthetic_fuel_order_idempotently():
    resources = _resources()
    existing = _existing_order(resources)
    session = _session_with_scalar(existing)

    first = await _ensure_fuel_order(session, **resources)
    second = await _ensure_fuel_order(session, **resources)

    assert first is existing
    assert second is existing
    session.add.assert_not_called()
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_seed_fails_closed_when_reserved_order_code_collides():
    resources = _resources()
    collision = _existing_order(resources)
    collision.notes = "Registro operacional não sintético"
    session = _session_with_scalar(collision)

    with pytest.raises(RuntimeError, match="código reservado"):
        await _ensure_fuel_order(session, **resources)

    assert collision.notes == "Registro operacional não sintético"
    session.add.assert_not_called()
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_seed_fails_closed_when_reserved_user_email_collides():
    organization = SimpleNamespace(id=uuid4())
    collision = SimpleNamespace(
        email=SYNTHETIC_USER_EMAIL,
        name="Usuário operacional",
        organization_id=uuid4(),
        cpf=None,
        password_hash="different",
        must_change_password=False,
        role=UserRole.PRODUCAO,
    )
    session = _session_with_scalar(collision)

    with pytest.raises(RuntimeError, match="e-mail reservado"):
        await _ensure_synthetic_user(session, organization)

    session.add.assert_not_called()
    session.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_seed_target_is_idempotent_but_rejects_foreign_allowlist_entry():
    creator = SimpleNamespace(id=uuid4())
    source_id = uuid4()
    target = HomologationSigningTarget(
        document_type=DigitalDocumentType.FUEL_SUPPLY_ORDER,
        source_type="FUEL_SUPPLY_ORDER",
        source_id=source_id,
        reason=SYNTHETIC_REASON,
        is_active=False,
        created_by_user_id=creator.id,
    )
    session = _session_with_scalar(target)

    reused = await _ensure_target(
        session,
        document_type=DigitalDocumentType.FUEL_SUPPLY_ORDER,
        source_type="FUEL_SUPPLY_ORDER",
        source_id=source_id,
        creator=creator,
    )

    assert reused is target
    assert target.is_active is True
    assert target.expires_at is None
    session.add.assert_not_called()

    target.reason = "Autorização manual"
    target.is_active = False
    with pytest.raises(RuntimeError, match="não gerenciada"):
        await _ensure_target(
            session,
            document_type=DigitalDocumentType.FUEL_SUPPLY_ORDER,
            source_type="FUEL_SUPPLY_ORDER",
            source_id=source_id,
            creator=creator,
        )
    assert target.reason == "Autorização manual"
    assert target.is_active is False


@pytest.mark.asyncio
async def test_seed_orchestrates_both_synthetic_allowlist_targets(monkeypatch):
    organization = SimpleNamespace(id=uuid4())
    allocation = SimpleNamespace(id=uuid4())
    vehicle = SimpleNamespace(id=uuid4())
    driver = SimpleNamespace(id=uuid4())
    possession = SimpleNamespace(id=uuid4())
    creator = SimpleNamespace(id=uuid4())
    station = SimpleNamespace(id=uuid4())
    fuel_order = SimpleNamespace(id=uuid4())
    session = SimpleNamespace(execute=AsyncMock(), begin=MagicMock())

    class AsyncContext:
        def __init__(self, value):
            self.value = value

        async def __aenter__(self):
            return self.value

        async def __aexit__(self, *_args):
            return False

    session.begin.return_value = AsyncContext(None)
    monkeypatch.setattr(seed_module, "AsyncSessionFactory", lambda: AsyncContext(session))
    monkeypatch.setattr(seed_module, "require_isolated_refresh", MagicMock())
    monkeypatch.setattr(seed_module, "_ensure_organization", AsyncMock(return_value=organization))
    monkeypatch.setattr(seed_module, "_ensure_allocation", AsyncMock(return_value=allocation))
    monkeypatch.setattr(seed_module, "_ensure_vehicle", AsyncMock(return_value=vehicle))
    monkeypatch.setattr(seed_module, "_ensure_driver", AsyncMock(return_value=driver))
    monkeypatch.setattr(seed_module, "_ensure_possession", AsyncMock(return_value=possession))
    monkeypatch.setattr(seed_module, "_ensure_synthetic_user", AsyncMock(return_value=creator))
    monkeypatch.setattr(seed_module, "_ensure_synthetic_station", AsyncMock(return_value=station))
    monkeypatch.setattr(seed_module, "_ensure_fuel_order", AsyncMock(return_value=fuel_order))
    ensure_target = AsyncMock()
    monkeypatch.setattr(seed_module, "_ensure_target", ensure_target)

    await seed_module.seed()

    assert ensure_target.await_count == 2
    assert ensure_target.await_args_list[0].kwargs == {
        "document_type": DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        "source_type": "POSSESSION",
        "source_id": possession.id,
        "creator": creator,
    }
    assert ensure_target.await_args_list[1].kwargs == {
        "document_type": DigitalDocumentType.FUEL_SUPPLY_ORDER,
        "source_type": "FUEL_SUPPLY_ORDER",
        "source_id": fuel_order.id,
        "creator": creator,
    }
