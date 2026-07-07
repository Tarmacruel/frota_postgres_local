from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import UserRole
from app.repositories.fuel_supply_order_repository import FuelSupplyOrderRepository
from app.schemas.fuel_station import FuelStationCreate
from app.schemas.fuel_supply import FuelSupplyCreate, FuelSupplyOrderConfirm, FuelSupplyOrderCreate
from app.services.fuel_supply_order_service import FuelSupplyOrderService


def test_fuel_station_contact_and_coordinates_are_normalized():
    station = FuelStationCreate(
        name="  Posto Central  ",
        cnpj=None,
        address="  Avenida Principal, 100  ",
        phone="  (73) 99999-0000  ",
        latitude=-17.535,
        longitude=-39.742,
    )

    assert station.name == "Posto Central"
    assert station.address == "Avenida Principal, 100"
    assert station.phone == "(73) 99999-0000"
    assert station.latitude == -17.535
    assert station.longitude == -39.742


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [
        (-90.1, -39.742),
        (90.1, -39.742),
        (-17.535, -180.1),
        (-17.535, 180.1),
    ],
)
def test_fuel_station_rejects_coordinates_outside_valid_range(latitude, longitude):
    with pytest.raises(ValidationError):
        FuelStationCreate(
            name="Posto Central",
            address="Avenida Principal, 100",
            latitude=latitude,
            longitude=longitude,
        )


def test_fuel_supply_order_create_omits_legacy_driver_contact_and_amount_fields():
    assert "driver_id" not in FuelSupplyOrderCreate.model_fields
    assert "requester_contact" not in FuelSupplyOrderCreate.model_fields
    assert "max_amount" not in FuelSupplyOrderCreate.model_fields

    order = FuelSupplyOrderCreate(
        vehicle_id=uuid4(),
        fuel_station_id=uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        notes="  Ordem sem condutor  ",
    )

    assert order.notes == "Ordem sem condutor"


def test_fuel_supply_confirm_requires_amount_and_fuel_type_and_normalizes_additive():
    confirmation = FuelSupplyOrderConfirm(
        odometer_km=12345,
        liters=40,
        total_amount=260.5,
        fuel_type="  Diesel S10  ",
        additive_type="  ARLA 32  ",
    )

    assert confirmation.fuel_type == "Diesel S10"
    assert confirmation.additive_type == "ARLA 32"
    assert confirmation.additive_quantity_liters is None

    with pytest.raises(ValidationError):
        FuelSupplyOrderConfirm(
            odometer_km=12345,
            liters=40,
            fuel_type="Diesel S10",
        )

    with pytest.raises(ValidationError):
        FuelSupplyOrderConfirm(
            odometer_km=12345,
            liters=40,
            total_amount=260.5,
            fuel_type="  ",
        )

    with pytest.raises(ValidationError):
        FuelSupplyOrderConfirm(
            odometer_km=12345,
            liters=40,
            total_amount=260.5,
            fuel_type="Diesel S10",
            additive_quantity_liters=5,
        )


def test_fuel_supply_create_accepts_fuel_type_and_additive_quantity():
    supply = FuelSupplyCreate(
        vehicle_id=uuid4(),
        odometer_km=12345,
        liters=40,
        total_amount=260.5,
        fuel_type="Gasolina comum",
        additive_type="Aditivo combustível",
        additive_quantity_liters=1.5,
    )

    assert supply.fuel_type == "Gasolina comum"
    assert supply.additive_quantity_liters == 1.5


class FakeReceipt:
    content_type = "application/pdf"

    def __init__(self, content: bytes = b"%PDF-1.4 test"):
        self.content = content
        self.closed = False

    async def read(self):
        return self.content

    async def close(self):
        self.closed = True


class FakeDb:
    def __init__(self):
        self.committed = False
        self.rolled_back = False
        self.flushed = False
        self.statements = []

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True

    async def flush(self):
        self.flushed = True

    async def execute(self, statement):
        self.statements.append(str(statement))
        return FakeExecuteResult(len(self.statements))


class FakeExecuteResult:
    def __init__(self, call_number):
        self.call_number = call_number

    def scalar_one(self):
        return 0

    def scalars(self):
        return self

    def unique(self):
        return self

    def all(self):
        return []


class FakeAudit:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


class FakeStations:
    def __init__(self, station):
        self.station = station

    async def get(self, station_id):
        if station_id == self.station.id:
            return self.station
        return None


class FakeSupplies:
    def __init__(self, order):
        self.order = order
        self.created = None

    async def get_latest_for_vehicle(self, vehicle_id, *, before_supply_at=None):
        return None

    async def get_vehicle_consumption_average(self, vehicle_id):
        return None

    async def create(self, supply):
        supply.id = uuid4()
        self.created = supply
        self.order.supply = supply
        return supply


class FakeOrders:
    def __init__(self, order):
        self.order = order

    async def get_by_id(self, order_id):
        if order_id == self.order.id:
            return self.order
        return None

    async def expire_overdue(self, *, reference_time):
        return 0


class FakeDocumentSignatureService:
    def __init__(self, db):
        self.db = db

    async def mark_source_documents_superseded(self, **kwargs):
        return None

    async def get_summary_for_source(self, *args, **kwargs):
        return None


def make_order():
    now = datetime.now(timezone.utc)
    station = SimpleNamespace(
        id=uuid4(),
        name="Posto Central",
        cnpj="00.000.000/0001-00",
        address="Avenida Principal, 100",
        phone="(73) 99999-0000",
        latitude=None,
        longitude=None,
        active=True,
    )
    order = SimpleNamespace(
        id=uuid4(),
        validation_code="OA-TESTE",
        status=FuelSupplyOrderStatus.OPEN,
        vehicle_id=uuid4(),
        vehicle=SimpleNamespace(plate="ABC1D23", brand="VW", model="Gol"),
        driver_id=None,
        driver=None,
        organization_id=uuid4(),
        organization=SimpleNamespace(name="Secretaria de Administração"),
        fuel_station_id=station.id,
        fuel_station_ref=station,
        created_by_user_id=uuid4(),
        creator=SimpleNamespace(name="Solicitante"),
        requester_contact=None,
        confirmed_by_user_id=None,
        confirmer=None,
        expires_at=now + timedelta(hours=2),
        requested_liters=40,
        max_amount=None,
        notes=None,
        confirmed_at=None,
        created_at=now,
        updated_at=now,
        supply=None,
    )
    return order, station


@pytest.mark.asyncio
async def test_confirm_order_links_created_supply_and_serializes_real_values(monkeypatch):
    from app.services import fuel_supply_order_service as order_service_module

    monkeypatch.setattr(order_service_module, "DocumentSignatureService", FakeDocumentSignatureService)
    order, station = make_order()
    service = FuelSupplyOrderService(FakeDb())
    service.orders = FakeOrders(order)
    service.supplies = FakeSupplies(order)
    service.fuel_stations = FakeStations(station)
    service.audit = FakeAudit()
    service._store_file = lambda path, content: None
    service._build_receipt_storage_paths = lambda supply_id, mime_type: ("fuel_receipts/test.pdf", None)

    user = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN, name="Admin", email="admin@example.test")
    data = FuelSupplyOrderConfirm(
        supplied_at=datetime(2026, 6, 10, 9, 30, tzinfo=timezone.utc),
        odometer_km=12345,
        liters=38.5,
        total_amount=250.75,
        fuel_type="Diesel S10",
    )

    result = await service.confirm_order(order.id, data, FakeReceipt(), user)

    assert service.supplies.created.fuel_supply_order_id == order.id
    assert order.status == FuelSupplyOrderStatus.COMPLETED
    assert result["supply_id"] == service.supplies.created.id
    assert result["supply_liters"] == 38.5
    assert result["supply_total_amount"] == 250.75
    assert result["supply_fuel_type"] == "Diesel S10"
    assert result["supply_odometer_km"] == 12345
    assert result["supply_receipt_url"] == f"/api/fuel-supplies/{service.supplies.created.id}/receipt"


@pytest.mark.asyncio
async def test_order_repository_applies_created_period_filters():
    db = FakeDb()
    repository = FuelSupplyOrderRepository(db)
    start = datetime(2026, 6, 1, tzinfo=timezone.utc)
    end = datetime(2026, 6, 7, 23, 59, tzinfo=timezone.utc)

    await repository.list_paginated(page=1, limit=10, created_from=start, created_to=end)

    compiled = "\n".join(db.statements)
    assert "fuel_supply_orders.created_at >= " in compiled
    assert "fuel_supply_orders.created_at <= " in compiled
