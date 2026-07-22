from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import UserRole
from app.schemas.fuel_supply import FuelSupplyOrderDeadlineUpdate, FuelSupplyRectify
from app.services.fuel_supply_order_service import FuelSupplyOrderService
from app.services.fuel_supply_service import FuelSupplyService


class FakeDb:
    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True


class FakeAudit:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


class FakeSupplies:
    def __init__(self, target, chronological):
        self.target = target
        self.chronological = chronological

    async def get_by_id(self, supply_id):
        return self.target if supply_id == self.target.id else None

    async def list_for_vehicle_chronological(self, vehicle_id):
        return self.chronological


class FakeOrders:
    def __init__(self, order):
        self.order = order

    async def get_by_id(self, order_id):
        return self.order if order_id == self.order.id else None


def make_user(role=UserRole.ADMIN):
    return SimpleNamespace(id=uuid4(), role=role, name="Operador", email="operador@example.test")


def make_chronological_supply(*, vehicle_id, supplied_at, odometer_km, liters):
    return SimpleNamespace(
        id=uuid4(),
        vehicle_id=vehicle_id,
        supplied_at=supplied_at,
        created_at=supplied_at,
        odometer_km=odometer_km,
        liters=liters,
        consumption_km_l=None,
        is_consumption_anomaly=False,
        anomaly_details=None,
    )


@pytest.mark.asyncio
async def test_rectify_order_confirmation_requires_reason_and_audits_changes():
    now = datetime.now(timezone.utc)
    vehicle_id = uuid4()
    previous = make_chronological_supply(
        vehicle_id=vehicle_id,
        supplied_at=now - timedelta(days=2),
        odometer_km=100,
        liters=10,
    )
    target = make_chronological_supply(
        vehicle_id=vehicle_id,
        supplied_at=now - timedelta(days=1),
        odometer_km=130,
        liters=10,
    )
    target.total_amount = Decimal("30.00")
    target.fuel_type = "Gasolina comum"
    target.additive_type = None
    target.additive_quantity_liters = None
    target.notes = None
    target.fuel_supply_order_id = uuid4()
    target.vehicle = SimpleNamespace(plate="THE3C94")
    target.updated_at = now - timedelta(days=1)
    next_supply = make_chronological_supply(
        vehicle_id=vehicle_id,
        supplied_at=now,
        odometer_km=160,
        liters=20,
    )

    service = FuelSupplyService(FakeDb())
    service.supplies = FakeSupplies(target, [previous, target, next_supply])
    service.audit = FakeAudit()

    async def allow_visibility(supply, current_user):
        return None

    async def fake_get(supply_id, current_user=None):
        return {"id": supply_id, "total_amount": float(target.total_amount)}

    service._ensure_supply_visible_to_user = allow_visibility
    service.get = fake_get
    payload = FuelSupplyRectify(
        supplied_at=target.supplied_at,
        odometer_km=target.odometer_km,
        liters=20,
        total_amount=225.30,
        fuel_type=target.fuel_type,
        reason="Valor corrigido conforme comprovante fiscal.",
    )

    result = await service.rectify(target.id, payload, make_user())

    assert result["total_amount"] == 225.30
    assert target.total_amount == Decimal("225.3")
    assert service.db.committed is True
    assert service.audit.records[0]["action"] == "ORDER_CONFIRM_RECTIFIED"
    assert service.audit.records[0]["details"]["reason"] == payload.reason
    assert service.audit.records[0]["details"]["changes"]["total_amount"] == {
        "before": Decimal("30.00"),
        "after": Decimal("225.3"),
    }
    assert target.consumption_km_l == 1.5
    assert next_supply.consumption_km_l == 1.5


@pytest.mark.asyncio
async def test_reopen_expired_order_with_new_deadline_and_audit():
    now = datetime.now(timezone.utc)
    order = SimpleNamespace(
        id=uuid4(),
        status=FuelSupplyOrderStatus.EXPIRED,
        expires_at=now - timedelta(hours=2),
        updated_at=now - timedelta(hours=2),
        vehicle_id=uuid4(),
        vehicle=SimpleNamespace(plate="THE3C94"),
    )
    service = FuelSupplyOrderService(FakeDb())
    service.orders = FakeOrders(order)
    service.audit = FakeAudit()

    async def allow_visibility(current_order, current_user):
        return None

    async def fake_get_order(order_id, current_user=None):
        return {"id": order_id, "status": order.status, "expires_at": order.expires_at}

    service._ensure_order_visible_to_user = allow_visibility
    service.get_order = fake_get_order
    payload = FuelSupplyOrderDeadlineUpdate(
        expires_at=now + timedelta(hours=24),
        reason="Prazo reaberto para anexar o comprovante fiscal.",
    )

    result = await service.update_deadline(order.id, payload, make_user())

    assert result["status"] == FuelSupplyOrderStatus.OPEN
    assert order.expires_at == payload.expires_at
    assert service.db.committed is True
    assert service.audit.records[0]["action"] == "ORDER_REOPENED"
    assert service.audit.records[0]["details"]["previous_status"] == "EXPIRED"
    assert service.audit.records[0]["details"]["reason"] == payload.reason


@pytest.mark.asyncio
async def test_station_operator_cannot_adjust_order_deadline():
    service = FuelSupplyOrderService(FakeDb())
    payload = FuelSupplyOrderDeadlineUpdate(
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        reason="Tentativa indevida de alterar o prazo da ordem.",
    )

    with pytest.raises(HTTPException) as exc_info:
        await service.update_deadline(uuid4(), payload, make_user(UserRole.POSTO))

    assert exc_info.value.status_code == 403
