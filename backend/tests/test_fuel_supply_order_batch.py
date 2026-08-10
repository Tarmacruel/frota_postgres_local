from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.models.user import UserRole
from app.schemas.fuel_supply import FuelSupplyOrderBatchCreate, FuelSupplyOrderBatchItem
from app.services.fuel_supply_order_service import FuelSupplyOrderService


class FakeDb:
    def __init__(self):
        self.commit_calls = 0
        self.rollback_calls = 0

    async def commit(self):
        self.commit_calls += 1

    async def rollback(self):
        self.rollback_calls += 1


class FakeOrders:
    def __init__(self, *, fail_on_create: int | None = None):
        self.fail_on_create = fail_on_create
        self.created = []
        self.records_by_id = {}

    async def get_by_validation_code(self, _validation_code):
        return None

    async def create(self, record):
        if self.fail_on_create and len(self.created) + 1 == self.fail_on_create:
            raise IntegrityError("INSERT fuel_supply_orders", {}, RuntimeError("constraint failure"))
        record.id = uuid4()
        self.created.append(record)
        self.records_by_id[record.id] = record
        return record

    async def get_by_id(self, order_id):
        return self.records_by_id.get(order_id)


class FakeVehicles:
    def __init__(self, vehicles):
        self.vehicles = vehicles

    async def get_by_id(self, vehicle_id):
        return self.vehicles.get(vehicle_id)


class FakeStations:
    def __init__(self, station):
        self.station = station

    async def get(self, station_id):
        return self.station if station_id == self.station.id else None


class FakeAudit:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


def make_user():
    return SimpleNamespace(
        id=uuid4(),
        role=UserRole.ADMIN,
        name="Admin de homologacao",
        email="admin@example.test",
    )


def make_batch_data(*vehicle_ids):
    return FuelSupplyOrderBatchCreate(
        items=[
            FuelSupplyOrderBatchItem(vehicle_id=vehicle_id, requested_liters=20 + index)
            for index, vehicle_id in enumerate(vehicle_ids)
        ],
        fuel_station_id=uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        notes="  Abastecimento coletivo  ",
    )


def make_service(*, data, fail_on_create=None, missing_vehicle_id=None):
    db = FakeDb()
    vehicles = {
        item.vehicle_id: SimpleNamespace(id=item.vehicle_id, plate=f"ABC{index}D2{index}")
        for index, item in enumerate(data.items, start=1)
        if item.vehicle_id != missing_vehicle_id
    }
    station = SimpleNamespace(id=data.fuel_station_id, active=True, name="Posto de teste")
    service = FuelSupplyOrderService(db)
    service.orders = FakeOrders(fail_on_create=fail_on_create)
    service.vehicles = FakeVehicles(vehicles)
    service.fuel_stations = FakeStations(station)
    service.audit = FakeAudit()
    service._serialize_order = lambda item: {"id": item.id, "vehicle_id": item.vehicle_id}

    async def serialize_order_with_signatures(item):
        return service._serialize_order(item)

    service._serialize_order_with_signatures = serialize_order_with_signatures
    return service, db


@pytest.mark.asyncio
async def test_create_batch_creates_independent_orders_and_audits_once_per_vehicle():
    vehicle_ids = [uuid4(), uuid4()]
    data = make_batch_data(*vehicle_ids)
    service, db = make_service(data=data)

    result = await service.create_batch(data, make_user())

    assert result["created_count"] == 2
    assert [item["vehicle_id"] for item in result["orders"]] == vehicle_ids
    assert [order.requested_liters for order in service.orders.created] == [20, 21]
    assert all(order.notes == "Abastecimento coletivo" for order in service.orders.created)
    assert db.commit_calls == 1
    assert db.rollback_calls == 0
    assert len(service.audit.records) == 2
    assert all(record["action"] == "ORDER_CREATED" for record in service.audit.records)
    assert [record["entity_id"] for record in service.audit.records] == [order.id for order in service.orders.created]


@pytest.mark.asyncio
async def test_create_batch_rejects_duplicate_vehicle_ids_before_creating_any_order():
    vehicle_id = uuid4()
    with pytest.raises(ValidationError):
        make_batch_data(vehicle_id, vehicle_id)

    data = FuelSupplyOrderBatchCreate.model_construct(
        items=[
            FuelSupplyOrderBatchItem(vehicle_id=vehicle_id, requested_liters=20),
            FuelSupplyOrderBatchItem(vehicle_id=vehicle_id, requested_liters=30),
        ],
        fuel_station_id=uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        notes=None,
    )
    service, db = make_service(data=data)

    with pytest.raises(HTTPException) as exc_info:
        await service.create_batch(data, make_user())

    assert exc_info.value.status_code == 422
    assert service.orders.created == []
    assert db.commit_calls == 0
    assert db.rollback_calls == 0


@pytest.mark.asyncio
async def test_create_batch_rolls_back_all_orders_when_any_insert_fails():
    data = make_batch_data(uuid4(), uuid4())
    service, db = make_service(data=data, fail_on_create=2)

    with pytest.raises(HTTPException) as exc_info:
        await service.create_batch(data, make_user())

    assert exc_info.value.status_code == 409
    assert db.commit_calls == 0
    assert db.rollback_calls == 1
    assert len(service.orders.created) == 1
    assert service.audit.records == []


@pytest.mark.asyncio
async def test_create_batch_validates_all_vehicles_before_any_order_is_written():
    vehicle_ids = [uuid4(), uuid4()]
    data = make_batch_data(*vehicle_ids)
    service, db = make_service(data=data, missing_vehicle_id=vehicle_ids[1])

    with pytest.raises(HTTPException) as exc_info:
        await service.create_batch(data, make_user())

    assert exc_info.value.status_code == 404
    assert service.orders.created == []
    assert db.commit_calls == 0
    assert db.rollback_calls == 0
