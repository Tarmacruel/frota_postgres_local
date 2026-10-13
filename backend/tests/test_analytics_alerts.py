from types import SimpleNamespace
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.models.user import UserRole
from app.schemas.analytics_alert import AlertStatusChange
from app.services.analytics_alerts import authorize, evidence_visible, fingerprint, mutation_headers, require_transition


def actor(role=UserRole.ADMIN, *, edit=True, fuel=True, org=None):
    return SimpleNamespace(id=uuid4(), role=role, organization_id=org,
        permissions={'analytics': {'can_view': True, 'can_edit': edit}, 'fuel_supplies': {'can_view': fuel}})


def test_identity_does_not_depend_on_period_decision_or_version():
    source = uuid4()
    assert fingerprint(source, 'price') == fingerprint(str(source).upper(), 'price')
    assert fingerprint(source, 'price') != fingerprint(source, 'consumption')
    assert len(fingerprint(source, 'price')) == 64
    with pytest.raises(ValueError):
        fingerprint(source, 'unapproved')


@pytest.mark.parametrize('role,edit,fuel,reconcile', [
    (UserRole.ADMIN, False, True, False), (UserRole.ADMIN, True, False, True),
    (UserRole.PRODUCAO, True, True, True), (UserRole.PADRAO, True, True, False),
    (UserRole.POSTO, True, True, False)])
def test_mutation_permission_ceiling(role, edit, fuel, reconcile):
    with pytest.raises(HTTPException) as exc:
        authorize(actor(role, edit=edit, fuel=fuel), mutation=True, reconcile=reconcile)
    assert exc.value.status_code == 403


def test_production_edit_is_explicit_and_evidence_scope_is_exact():
    org = uuid4()
    user = actor(UserRole.PRODUCAO, org=org)
    authorize(user, mutation=True)
    assert evidence_visible(user, {'organization': str(org)})
    assert not evidence_visible(user, {'organization': None})
    assert not evidence_visible(user, {'organization': str(uuid4())})
    user.organization_id = None
    assert not evidence_visible(user, {'organization': None})


@pytest.mark.parametrize('before,after,reason,code', [
    ('NEW', 'IGNORED', None, 422), ('NEW', 'RESOLVED', '', 422),
    ('RESOLVED', 'IN_REVIEW', None, 422), ('IGNORED', 'IN_REVIEW', '', 422),
    ('NEW', 'NEW', 'same', 409), ('RESOLVED', 'IGNORED', 'no', 409),
    ('IGNORED', 'RESOLVED', 'no', 409), ('IN_REVIEW', 'IN_REVIEW', '', 409)])
def test_invalid_states_and_required_reasons(before, after, reason, code):
    with pytest.raises(HTTPException) as exc:
        require_transition(before, after, reason)
    assert exc.value.status_code == code


def test_reason_normalization_and_extra_fields():
    change = AlertStatusChange(status='IGNORED', reason=' \n  Verificado   no registro.  ')
    assert change.reason == 'Verificado no registro.'
    with pytest.raises(ValidationError):
        AlertStatusChange(status='IGNORED', evidence={'observed': 900})
    with pytest.raises(ValidationError):
        AlertStatusChange(status='NEW')
    with pytest.raises(ValidationError):
        AlertStatusChange(status='RESOLVED', reason='x' * 2001)


@pytest.mark.parametrize('key,etag,code', [(None, '"1"', 428), ('key', None, 428),
    ('x'*81, '"1"', 422), ('with spaces', '"1"', 422), ('key', '1', 422), ('key', '"0"', 422)])
def test_missing_invalid_headers(key, etag, code):
    with pytest.raises(HTTPException) as exc:
        mutation_headers(key, etag, status_change=True)
    assert exc.value.status_code == code


def test_valid_transition_and_version_header():
    require_transition('NEW', 'IN_REVIEW', None)
    require_transition('IN_REVIEW', 'RESOLVED', 'Conferido')
    require_transition('IGNORED', 'IN_REVIEW', 'Nova informação')
    assert mutation_headers('request-key', '"3"', status_change=True) == 3
