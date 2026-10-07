from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.vehicle import Vehicle, VehicleStatus, VehicleType, VehicleOwnershipType
from app.schemas.vehicle import VehicleCreate, VehicleUpdate
from app.services.vehicle_service import VehicleService


def payload(schema, **values):
    base = dict(plate='TEST123', brand='Teste', model='Teste', vehicle_type='SEDAN', allocation_id=uuid4()) if schema is VehicleCreate else dict(edit_reason='Atualizar cartao')
    return schema(**base, **values)


@pytest.mark.parametrize('schema', [VehicleCreate, VehicleUpdate])
@pytest.mark.parametrize('value', ['123', '1' * 17, 'a' * 16, 1234567890123456, '１２３４５６７８９０１２３４５６'])
def test_rejects_invalid_card(schema, value):
    with pytest.raises(ValidationError):
        payload(schema, prime_card_number=value)


@pytest.mark.parametrize('schema', [VehicleCreate, VehicleUpdate])
def test_card_is_optional_and_normalizes_without_losing_zeros(schema):
    assert payload(schema).prime_card_number is None
    assert payload(schema, prime_card_number='').prime_card_number is None
    assert payload(schema, prime_card_number='0000 1234 5678 9012').prime_card_number == '0000123456789012'


@pytest.mark.asyncio
@pytest.mark.parametrize('values,expected', [({}, '0000123456789012'), ({'prime_card_number': None}, None), ({'prime_card_number': '1234 5678 9012 3456'}, '1234567890123456')])
async def test_update_preserves_clears_or_changes_card_and_audits(monkeypatch, values, expected):
    monkeypatch.setattr('app.services.vehicle_service.lock_vehicle_handoff', AsyncMock())
    monkeypatch.setattr('app.services.vehicle_service.ensure_registration_manager', AsyncMock())
    vehicle = Vehicle(id=uuid4(), plate='TEST123', brand='Teste', model='Teste', prime_card_number='0000123456789012', vehicle_type=VehicleType.SEDAN, ownership_type=VehicleOwnershipType.PROPRIO, status=VehicleStatus.ATIVO)
    service = VehicleService(AsyncMock())
    service.vehicles = SimpleNamespace(get_by_id=AsyncMock(return_value=vehicle), get_active_history=AsyncMock(return_value=None), get_active_possession=AsyncMock(return_value=None))
    service.audit = SimpleNamespace(record=AsyncMock())
    result = await service.update(vehicle.id, payload(VehicleUpdate, **values), None)
    assert result['prime_card_number'] == expected
    details = service.audit.record.call_args.kwargs['details']
    assert details['before']['prime_card_number'] == '0000123456789012'
    assert details['after']['prime_card_number'] == expected
    service.db.commit.assert_awaited_once()
