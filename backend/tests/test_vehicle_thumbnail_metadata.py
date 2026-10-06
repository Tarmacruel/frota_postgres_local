"""Read metadata keeps the registered type across all existing thumbnail contexts."""
import pytest
from uuid import uuid4

from app.models.vehicle import Vehicle, VehicleType
from app.models.claim import Claim
from app.models.fine import Fine
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder
from app.models.maintenance import MaintenanceRecord
from app.models.possession import VehiclePossession
from app.schemas.claim import ClaimOut
from app.schemas.fine import FineOut
from app.schemas.fuel_supply import FuelSupplyOut, FuelSupplyOrderOut
from app.schemas.maintenance import MaintenanceOut
from app.schemas.possession import PossessionOut
from app.services.claim_service import ClaimService
from app.services.fine_service import FineService
from app.services.fuel_supply_service import FuelSupplyService
from app.services.fuel_supply_order_service import FuelSupplyOrderService
from app.services.maintenance_service import MaintenanceService
from app.services.possession_service import PossessionService


@pytest.mark.parametrize('vehicle_type', [*VehicleType, None])
@pytest.mark.parametrize('model,service,schema,method,kwargs', [
    (Claim, ClaimService, ClaimOut, '_serialize', {}),
    (Fine, FineService, FineOut, '_serialize', {}),
    (FuelSupply, FuelSupplyService, FuelSupplyOut, '_serialize', {}),
    (FuelSupplyOrder, FuelSupplyOrderService, FuelSupplyOrderOut, '_serialize_order', {}),
    (MaintenanceRecord, MaintenanceService, MaintenanceOut, '_serialize', {}),
    (VehiclePossession, PossessionService, PossessionOut, '_serialize', {'can_view_location': False, 'can_view_personal_data': False}),
])
def test_serialized_metadata_preserves_registered_type(model, service, schema, method, kwargs, vehicle_type):
    vehicle = Vehicle(id=uuid4(), plate='QA12345', brand='Teste', model='Fictício', vehicle_type=vehicle_type) if vehicle_type else None
    record = model(id=uuid4(), vehicle=vehicle)
    payload = getattr(service(None), method)(record, **kwargs)
    expected = vehicle_type.value if vehicle_type else None
    assert payload['vehicle_type'] == expected
    # A response schema that drops the new field reproduces the original defect.
    assert schema.model_construct(**payload).model_dump(mode='json', include={'vehicle_type'}) == {'vehicle_type': expected}
