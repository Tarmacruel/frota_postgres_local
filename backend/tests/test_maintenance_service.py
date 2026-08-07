from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import app.services.maintenance_service as maintenance_service_module
from app.api.routes.maintenance import list_maintenance
from app.models.user import UserRole
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate
from app.services.maintenance_service import MaintenanceService


def _user(role: UserRole = UserRole.ADMIN, organization_id=None):
    return SimpleNamespace(
        id=uuid4(),
        name="Usuario de teste",
        email="maintenance@example.test",
        role=role,
        organization_id=organization_id,
    )


def _record(*, start_date: datetime | None = None, end_date: datetime | None = None):
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=uuid4(),
        vehicle_id=uuid4(),
        vehicle=SimpleNamespace(plate="ABC1D23"),
        start_date=start_date or now - timedelta(days=1),
        end_date=end_date,
        service_description="Troca preventiva de oleo e filtros",
        parts_replaced="Filtro de oleo",
        total_cost=Decimal("250.00"),
        created_by=uuid4(),
        created_at=now,
        updated_at=now,
    )


def _service():
    db = AsyncMock()
    return MaintenanceService(db), db


@pytest.mark.asyncio
async def test_get_route_returns_empty_list_without_contract_error():
    result = MagicMock()
    result.scalars.return_value.unique.return_value.all.return_value = []
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)

    response = await list_maintenance(
        vehicle_id=None,
        start=None,
        end=None,
        db=db,
        current_user=_user(),
    )

    assert response == []
    db.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_list_accepts_route_user_with_empty_table():
    service, _db = _service()
    service.records.list = AsyncMock(return_value=[])
    current_user = _user()

    result = await service.list(current_user=current_user)

    assert result == []
    service.records.list.assert_awaited_once_with(
        vehicle_id=None,
        start=None,
        end=None,
        organization_id=None,
    )


@pytest.mark.asyncio
async def test_list_serializes_eager_loaded_vehicle():
    service, _db = _service()
    record = _record()
    service.records.list = AsyncMock(return_value=[record])

    result = await service.list(current_user=_user())

    assert result[0]["id"] == record.id
    assert result[0]["vehicle_plate"] == "ABC1D23"


@pytest.mark.asyncio
async def test_paginated_list_keeps_production_organization_scope():
    service, _db = _service()
    organization_id = uuid4()
    service.records.list_paginated = AsyncMock(return_value=([], 0))

    result = await service.list_paginated(
        page=1,
        limit=10,
        current_user=_user(UserRole.PRODUCAO, organization_id),
    )

    assert result.data == []
    assert result.pagination.total == 0
    assert service.records.list_paginated.await_args.kwargs["organization_id"] == organization_id


@pytest.mark.asyncio
async def test_get_accepts_route_user_and_serializes_related_vehicle():
    service, _db = _service()
    record = _record()
    service.records.get_by_id = AsyncMock(return_value=record)

    result = await service.get(record.id, current_user=_user())

    assert result["vehicle_plate"] == "ABC1D23"


@pytest.mark.asyncio
async def test_create_uses_explicitly_loaded_vehicle_without_lazy_loading(monkeypatch):
    class GuardedMaintenanceRecord:
        def __init__(self, **values):
            self.__dict__.update(values)
            self.id = uuid4()

        @property
        def vehicle(self):
            raise AssertionError("create tentou carregar record.vehicle implicitamente")

    monkeypatch.setattr(maintenance_service_module, "MaintenanceRecord", GuardedMaintenanceRecord)
    service, db = _service()
    current_user = _user()
    vehicle_id = uuid4()
    vehicle = SimpleNamespace(id=vehicle_id, plate="XYZ9Z99")
    service.vehicles.get_by_id = AsyncMock(return_value=vehicle)
    service.records.create = AsyncMock(side_effect=lambda record: record)
    service.audit.record = AsyncMock()
    expected = {"id": uuid4(), "vehicle_plate": vehicle.plate}
    service.get = AsyncMock(return_value=expected)
    data = MaintenanceCreate(
        vehicle_id=vehicle_id,
        start_date=datetime.now(timezone.utc),
        service_description="Revisao completa do sistema de freios",
        parts_replaced="Pastilhas dianteiras",
        total_cost=Decimal("800.00"),
    )

    result = await service.create(data, current_user)

    assert result == expected
    assert service.audit.record.await_args.kwargs["entity_label"].startswith("XYZ9Z99 - ")
    service.get.assert_awaited_once_with(service.records.create.await_args.args[0].id, current_user=current_user)
    db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_commits_and_returns_refreshed_record():
    service, db = _service()
    current_user = _user()
    record = _record()
    service.records.get_by_id = AsyncMock(return_value=record)
    service.audit.record = AsyncMock()
    expected = {"id": record.id, "total_cost": Decimal("300.00")}
    service.get = AsyncMock(return_value=expected)

    result = await service.update(
        record.id,
        MaintenanceUpdate(total_cost=Decimal("300.00")),
        current_user,
    )

    assert result == expected
    assert record.total_cost == Decimal("300.00")
    db.flush.assert_awaited_once()
    db.commit.assert_awaited_once()
    service.get.assert_awaited_once_with(record.id, current_user=current_user)


@pytest.mark.asyncio
async def test_update_rejects_end_date_before_start_date():
    service, db = _service()
    record = _record()
    service.records.get_by_id = AsyncMock(return_value=record)

    with pytest.raises(HTTPException) as exc:
        await service.update(
            record.id,
            MaintenanceUpdate(end_date=record.start_date - timedelta(minutes=1)),
            _user(),
        )

    assert exc.value.status_code == 400
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_delete_uses_eager_vehicle_and_commits():
    service, db = _service()
    record = _record()
    service.records.get_by_id = AsyncMock(return_value=record)
    service.records.delete = AsyncMock()
    service.audit.record = AsyncMock()

    await service.delete(record.id, _user())

    service.records.delete.assert_awaited_once_with(record)
    db.commit.assert_awaited_once()


def test_create_schema_rejects_invalid_dates_and_negative_cost():
    start_date = datetime.now(timezone.utc)
    valid_data = {
        "vehicle_id": uuid4(),
        "start_date": start_date,
        "service_description": "Revisao completa para validacao",
        "total_cost": Decimal("10.00"),
    }

    with pytest.raises(ValidationError):
        MaintenanceCreate(**valid_data, end_date=start_date - timedelta(seconds=1))

    with pytest.raises(ValidationError):
        MaintenanceCreate(**{**valid_data, "total_cost": Decimal("-0.01")})
