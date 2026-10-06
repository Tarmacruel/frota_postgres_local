from datetime import datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers
from unittest.mock import AsyncMock

from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import UserRole
from app.schemas.fuel_supply import FuelSupplyOrderDeadlineUpdate, FuelSupplyRectify
from app.services.fuel_supply_order_service import FuelSupplyOrderService
from app.services.fuel_supply_service import FuelSupplyService


class FakeDb:
    async def scalar(self, statement):
        return uuid4() if statement.selected_columns[0].table.name == 'vehicles' else None

    def __init__(self):
        self.committed = False

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


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
        organization_id=None,
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


@pytest.fixture(autouse=True)
def operational_attribution_collaborator(monkeypatch):
    """These unit tests use fake sessions; temporal scope has PostgreSQL integration tests."""
    from unittest.mock import AsyncMock
    monkeypatch.setattr("app.services.fuel_supply_order_service.attribute_operation", AsyncMock())
    monkeypatch.setattr("app.services.fuel_supply_service.attribute_operation", AsyncMock())


@pytest.fixture
def receipt_correction(tmp_path, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, 'STORAGE_DIR', str(tmp_path))
    now = datetime.now(timezone.utc)
    original = tmp_path / 'fuel_receipts' / 'original.pdf'
    original.parent.mkdir()
    original.write_bytes(b'%PDF-1.4 original')
    target = make_chronological_supply(vehicle_id=uuid4(), supplied_at=now, odometer_km=100, liters=10)
    target.total_amount = Decimal('50')
    target.fuel_type = 'Gasolina comum'
    target.additive_type = target.additive_quantity_liters = target.notes = None
    target.fuel_supply_order_id = uuid4()
    target.vehicle = SimpleNamespace(plate='ABC1D23')
    target.receipt_path = 'fuel_receipts/original.pdf'
    target.receipt_mime_type = 'application/pdf'
    target.receipt_size_bytes = original.stat().st_size
    target.receipt_uploaded_at = now
    service = FuelSupplyService(FakeDb())
    service.supplies = FakeSupplies(target, [target])
    service.audit = FakeAudit()
    service._ensure_supply_visible_to_user = AsyncMock()
    service.get = AsyncMock(return_value={'id': target.id})
    service._recalculate_vehicle_consumption = AsyncMock(return_value=[])
    payload = FuelSupplyRectify(supplied_at=now, odometer_km=100, liters=10,
        total_amount=50, fuel_type=target.fuel_type, reason='Substituição de comprovante incorreto.')
    return service, target, payload, original


def upload(content=b'%PDF-1.4 corrected', mime_type='application/pdf'):
    return UploadFile(file=BytesIO(content), filename='comprovante.pdf', headers=Headers({'content-type': mime_type}))


@pytest.mark.asyncio
@pytest.mark.parametrize('mime_type', ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
async def test_receipt_only_correction_preserves_original_and_audits(receipt_correction, mime_type):
    service, target, payload, original = receipt_correction
    old_uploaded_at = target.receipt_uploaded_at
    await service.rectify(target.id, payload, make_user(), receipt=upload(mime_type=mime_type))
    new_path = service._resolve_receipt_path(target.receipt_path)
    assert new_path != original
    assert original.read_bytes() == b'%PDF-1.4 original'
    assert new_path.read_bytes() == b'%PDF-1.4 corrected'
    assert target.receipt_mime_type == mime_type
    assert target.receipt_size_bytes == new_path.stat().st_size
    assert service.db.committed
    details = service.audit.records[0]['details']
    assert details['reason'] == payload.reason
    assert details['changes']['receipt']['before']['receipt_path'] == 'fuel_receipts/original.pdf'
    assert details['changes']['receipt']['before']['receipt_uploaded_at'] == old_uploaded_at
    assert details['changes']['receipt']['after']['receipt_path'] == target.receipt_path
    service._recalculate_vehicle_consumption.assert_not_awaited()
    response = await service.get_receipt_file(target.id, current_user=make_user())
    assert response.path == new_path
    assert response.media_type == mime_type


@pytest.mark.asyncio
async def test_correction_without_upload_preserves_receipt(receipt_correction):
    service, target, payload, original = receipt_correction
    payload.total_amount = 60
    await service.rectify(target.id, payload, make_user())
    assert target.receipt_path == 'fuel_receipts/original.pdf'
    assert original.read_bytes() == b'%PDF-1.4 original'
    assert 'receipt' not in service.audit.records[0]['details']['changes']


@pytest.mark.asyncio
async def test_receipt_and_data_are_corrected_together(receipt_correction):
    service, target, payload, original = receipt_correction
    payload.liters = 20
    await service.rectify(target.id, payload, make_user(), receipt=upload())
    assert target.liters == 20
    assert original.exists()
    assert set(service.audit.records[0]['details']['changes']) == {'liters', 'receipt'}
    service._recalculate_vehicle_consumption.assert_awaited_once_with(target.vehicle_id)


@pytest.mark.asyncio
@pytest.mark.parametrize('content,mime_type,code', [
    (b'', 'application/pdf', 400), (b'text', 'text/plain', 400),
    (b'x' * (8 * 1024 * 1024 + 1), 'application/pdf', 413),
], ids=['empty', 'unsupported-type', 'oversized'])
async def test_invalid_receipt_does_not_modify_supply(receipt_correction, content, mime_type, code):
    service, target, payload, original = receipt_correction
    payload.total_amount = 60
    with pytest.raises(HTTPException) as caught:
        await service.rectify(target.id, payload, make_user(), receipt=upload(content, mime_type))
    assert caught.value.status_code == code
    assert target.total_amount == Decimal('50')
    assert target.receipt_path == 'fuel_receipts/original.pdf'
    assert list(original.parent.iterdir()) == [original]
    assert not service.db.committed
    assert not service.audit.records


@pytest.mark.asyncio
@pytest.mark.parametrize('failure_stage', ['storage', 'audit', 'commit'])
async def test_failure_rolls_back_and_removes_only_new_file(receipt_correction, monkeypatch, failure_stage):
    service, target, payload, original = receipt_correction
    if failure_stage == 'storage':
        def fail_storage(path, content):
            path.write_bytes(content[:4])
            raise OSError('Disco indisponível')
        monkeypatch.setattr(service, '_store_file', fail_storage)
    else:
        owner, method = (service.audit, 'record') if failure_stage == 'audit' else (service.db, 'commit')
        monkeypatch.setattr(owner, method, AsyncMock(side_effect=RuntimeError('Falha de gravação')))
    with pytest.raises((OSError, RuntimeError)):
        await service.rectify(target.id, payload, make_user(), receipt=upload())
    assert service.db.rolled_back
    assert not service.db.committed
    assert list(original.parent.iterdir()) == [original]
    assert original.read_bytes() == b'%PDF-1.4 original'


@pytest.mark.asyncio
@pytest.mark.parametrize('role', [UserRole.POSTO, UserRole.PADRAO])
async def test_receipt_correction_keeps_role_restriction(receipt_correction, role):
    service, target, payload, original = receipt_correction
    with pytest.raises(HTTPException) as caught:
        await service.rectify(target.id, payload, make_user(role), receipt=upload())
    assert caught.value.status_code == 403
    assert list(original.parent.iterdir()) == [original]


@pytest.mark.asyncio
async def test_receipt_correction_keeps_visibility_restriction(receipt_correction):
    service, target, payload, original = receipt_correction
    service._ensure_supply_visible_to_user.side_effect = HTTPException(404, 'Abastecimento não encontrado')
    with pytest.raises(HTTPException) as caught:
        await service.rectify(target.id, payload, make_user(), receipt=upload())
    assert caught.value.status_code == 404
    assert list(original.parent.iterdir()) == [original]
