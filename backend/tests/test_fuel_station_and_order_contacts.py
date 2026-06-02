from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.fuel_station import FuelStationCreate
from app.schemas.fuel_supply import FuelSupplyCreate, FuelSupplyOrderConfirm, FuelSupplyOrderCreate


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
