from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.vehicle import Vehicle, VehicleStatus, VehicleType, VehicleOwnershipType
from app.schemas.vehicle import VehicleCreate, VehicleUpdate
from app.services.vehicle_service import VehicleService
from app.models.user import UserRole


def card_user(role=UserRole.ADMIN, organization_id=None, can_edit=True):
    return SimpleNamespace(role=role, organization_id=organization_id, permissions={'vehicles': {'can_view': True, 'can_edit': can_edit}})


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
    result = await service.update(vehicle.id, payload(VehicleUpdate, **values), card_user())
    assert result['prime_card_number'] == expected
    details = service.audit.record.call_args.kwargs['details']
    assert details['before']['prime_card_number'] == '0000123456789012'
    assert details['after']['prime_card_number'] == expected
    service.db.commit.assert_awaited_once()


@pytest.mark.parametrize('role,can_edit,own_org,expected', [
    (UserRole.ADMIN, True, False, True),
    (UserRole.ADMIN, False, False, False),
    (UserRole.PADRAO, False, False, False),
    (UserRole.PRODUCAO, True, True, True),
    (UserRole.PRODUCAO, True, False, False),
    (UserRole.PRODUCAO, False, True, False),
])
def test_card_visibility_requires_edit_permission_and_registration_scope(role, can_edit, own_org, expected):
    owner = uuid4()
    user = card_user(role, owner if own_org else uuid4(), can_edit)
    vehicle = Vehicle(id=uuid4(), owner_organization_id=owner, prime_card_number='0000123456789012')
    result = VehicleService(None)._serialize_vehicle(vehicle, None, None, current_user=user)
    assert result['prime_card_number'] == ('0000123456789012' if expected else None)


@pytest.mark.parametrize('action', ['CREATE', 'UPDATE'])
@pytest.mark.parametrize('can_edit', [True, False])
@pytest.mark.asyncio
async def test_history_redacts_card_without_mutating_stored_audit(action, can_edit):
    vehicle = Vehicle(id=uuid4(), owner_organization_id=uuid4())
    card_data = {'prime_card_number': '0000123456789012', 'brand': 'Teste'}
    details = card_data.copy() if action == 'CREATE' else {'before': card_data.copy(), 'after': card_data.copy()}
    log = SimpleNamespace(id=uuid4(), action=action, created_at=None, actor_name='Teste', details=details)
    service = VehicleService(AsyncMock())
    service.vehicles = SimpleNamespace(get_by_id=AsyncMock(return_value=vehicle), list_history=AsyncMock(return_value=[]))
    service._list_vehicle_audit_logs = AsyncMock(return_value=[log])
    result = await service.get_history(vehicle.id, current_user=card_user(can_edit=can_edit))
    for section in ['before', 'after']:
        if result[0][section] is not None:
            assert ('prime_card_number' in result[0][section]) == can_edit
            assert result[0][section]['brand'] == 'Teste'
    assert card_data['prime_card_number'] == (details if action == 'CREATE' else details['before'])['prime_card_number']


def test_no_user_or_unassigned_production_user_cannot_read_card():
    assert not VehicleService._can_view_prime_card(None, None)
    assert not VehicleService._can_view_prime_card(card_user(UserRole.PRODUCAO), None)
