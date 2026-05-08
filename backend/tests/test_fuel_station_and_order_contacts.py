from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.fuel_station import FuelStationCreate
from app.schemas.fuel_supply import FuelSupplyOrderCreate


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


def test_fuel_supply_order_requester_contact_is_optional_and_normalized():
    order = FuelSupplyOrderCreate(
        vehicle_id=uuid4(),
        fuel_station_id=uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        requester_contact="  (73) 98888-0000  ",
    )

    assert order.requester_contact == "(73) 98888-0000"

    legacy_order = FuelSupplyOrderCreate(
        vehicle_id=uuid4(),
        fuel_station_id=uuid4(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        requester_contact="  ",
    )

    assert legacy_order.requester_contact is None
