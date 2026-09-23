from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.core.config import settings
from app.models.data_import import DataImportEntityType
from app.models.driver import Driver, DriverLicenseCategory
from app.models.user import UserRole
from app.schemas.driver import DriverCreate, DriverUpdate
from app.schemas.fine import FineCreate, FineUpdate
from app.schemas.fuel_supply import FuelSupplyCreate
from app.services.claim_service import ClaimService
from app.services.data_import_service import DataImportService
from app.services.driver_service import DriverService
from app.services.fine_service import FineService
from app.services.fuel_supply_service import FuelSupplyService
from app.services.possession_service import PossessionService


def create_payload(**fields):
    return dict(nome_completo="Condutor Teste", documento="12345678900",
                organization_id=uuid4(), cnh_categoria="B", **fields)


@pytest.mark.parametrize("fields", [{}, {"matricula": None}, {"matricula": ""}, {"matricula": "   "}, {"matricula": "X" * 31}])
def test_create_requires_nonempty_registration(fields):
    with pytest.raises(ValidationError) as exc:
        DriverCreate(**create_payload(**fields))
    assert exc.value.errors()[0]["loc"] == ("matricula",)


@pytest.mark.parametrize("value", [None, "", "   ", "X" * 31])
def test_update_cannot_erase_registration(value):
    with pytest.raises(ValidationError):
        DriverUpdate(matricula=value)


def test_registration_preserves_leading_zeros_and_supports_partial_updates():
    assert DriverCreate(**create_payload(matricula=" 00012-A ")).matricula == "00012-A"
    assert DriverUpdate(matricula=" 00012-A ").matricula == "00012-A"
    assert "matricula" not in DriverUpdate(contato="73999990000").model_dump(exclude_unset=True)


@pytest.mark.asyncio
async def test_legacy_registration_update_is_saved_and_audited():
    driver = Driver(id=uuid4(), nome_completo="Condutor legado", documento="12345678900",
                    cnh_categoria=DriverLicenseCategory.B, ativo=True)
    service = DriverService(AsyncMock())
    service.drivers = SimpleNamespace(get_by_id=AsyncMock(return_value=driver))
    service.audit = SimpleNamespace(record=AsyncMock())
    actor = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)
    result = await service.update(driver.id, DriverUpdate(matricula=" 000123 "), actor)
    assert result["matricula"] == "000123"
    details = service.audit.record.call_args.kwargs["details"]
    assert details["before"]["matricula"] is None
    assert details["after"]["matricula"] == "000123"
    service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("operation", ["possession", "claim", "fine_create", "fine_update", "fuel_supply"])
@pytest.mark.parametrize("matricula", [None, "", "   "])
async def test_operations_reject_legacy_driver_until_registration_is_saved(operation, matricula, monkeypatch):
    driver = Driver(id=uuid4(), nome_completo="Condutor legado", matricula=matricula,
                    documento="12345678900", cnh_categoria=DriverLicenseCategory.B, ativo=True)
    actor = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)
    vehicle_id = uuid4()
    db = AsyncMock()
    if operation == "possession":
        service = PossessionService(db)
        call = lambda: service._resolve_driver_snapshot(driver_id=driver.id, fallback_name="Legado", fallback_document=None, fallback_contact=None)
    elif operation == "claim":
        service = ClaimService(db)
        service.possessions = SimpleNamespace(driver_had_vehicle_at=AsyncMock(return_value=True))
        call = lambda: service._require_driver_if_needed(driver.id, datetime.now(timezone.utc), vehicle_id)
    elif operation.startswith("fine"):
        service = FineService(db)
        service._ensure_vehicle_visible_to_user = AsyncMock()
        service.vehicles = SimpleNamespace(get_by_id=AsyncMock(return_value=SimpleNamespace(id=vehicle_id)))
        service._require_active_infraction = AsyncMock(return_value=SimpleNamespace(description="Teste"))
        if operation == "fine_create":
            payload = FineCreate(vehicle_id=vehicle_id, driver_id=driver.id, infraction_type_id=uuid4(), ticket_number="TESTE123", infraction_date=date.today(), amount=100)
            call = lambda: service.create(payload, actor)
        else:
            fine = SimpleNamespace(id=uuid4(), vehicle_id=vehicle_id, driver_id=driver.id)
            service.fines = SimpleNamespace(get_by_id=AsyncMock(return_value=fine))
            call = lambda: service.update(fine.id, FineUpdate(notes="Atualização"), actor)
    else:
        monkeypatch.setattr(settings, "ENABLE_LEGACY_FUEL_SUPPLY_CREATE", True)
        service = FuelSupplyService(db)
        service._ensure_vehicle_visible_to_user = AsyncMock()
        service.vehicles = SimpleNamespace(get_by_id=AsyncMock(return_value=SimpleNamespace(id=vehicle_id)))
        payload = FuelSupplyCreate(vehicle_id=vehicle_id, driver_id=driver.id, odometer_km=100, liters=10, total_amount=50, fuel_type="Diesel")
        call = lambda: service.create(payload, None, actor)
    service.drivers = SimpleNamespace(get_by_id=AsyncMock(return_value=driver))
    with pytest.raises(HTTPException) as exc:
        await call()
    assert exc.value.status_code == 409
    assert "matrícula" in exc.value.detail
    db.commit.assert_not_awaited()


@pytest.mark.parametrize("matricula", [None, "", "   ", "X" * 31])
def test_import_cannot_create_driver_without_valid_registration(matricula):
    service = DataImportService(None)
    errors = service._apply_validation_errors(DataImportEntityType.DRIVER, create_payload(matricula=matricula))
    assert len(errors) == 1
    assert "matricula" in errors[0] or "Matrícula" in errors[0]
