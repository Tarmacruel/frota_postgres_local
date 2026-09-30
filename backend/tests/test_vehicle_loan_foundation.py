from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.core.vehicle_responsibility import LoanPeriod, VehicleScope, operating_organization

NOW = datetime(2026, 9, 28, 12, tzinfo=timezone.utc)


def test_no_loan_preserves_existing_scope_and_denies_unknown_organization():
    owner, outsider = uuid4(), uuid4()
    scope = VehicleScope(owner, owner)
    assert scope.can_view(owner, now=NOW)
    assert scope.can_operate(owner, now=NOW)
    assert scope.can_manage_registration(owner)
    assert not scope.can_view(outsider, now=NOW)
    assert not scope.can_operate(None, now=NOW)
    assert not scope.can_manage_registration(None)
    legacy = VehicleScope(None, owner)
    assert legacy.can_manage_registration(owner)
    assert VehicleScope(None, None).can_operate(None, now=NOW, is_admin=True)


def test_active_loan_separates_owner_management_from_recipient_operation():
    owner, recipient, outsider = uuid4(), uuid4(), uuid4()
    period = LoanPeriod(uuid4(), recipient, NOW - timedelta(days=1))
    scope = VehicleScope(owner, recipient, (period,))
    for organization in (owner, recipient):
        assert scope.can_view(organization, now=NOW, occurred_at=NOW - timedelta(days=20))
    assert not scope.can_view(outsider, now=NOW)
    assert not scope.can_operate(owner, now=NOW)
    assert scope.can_operate(recipient, now=NOW)
    assert scope.can_manage_registration(owner)
    assert not scope.can_manage_registration(recipient)


def test_return_preserves_history_but_removes_future_access_and_operation():
    owner, recipient = uuid4(), uuid4()
    period = LoanPeriod(uuid4(), recipient, NOW - timedelta(days=2), NOW)
    scope = VehicleScope(owner, owner, (period,))
    assert scope.can_view(recipient, now=NOW, occurred_at=NOW)
    assert scope.can_view(recipient, now=NOW, occurred_at=NOW - timedelta(days=10))
    assert scope.can_view(recipient, now=NOW)
    assert not scope.can_view(recipient, now=NOW, occurred_at=NOW + timedelta(seconds=1))
    assert not scope.can_operate(recipient, now=NOW)
    assert scope.can_operate(owner, now=NOW)


def test_historical_attribution_uses_delivery_inclusive_return_exclusive():
    owner, recipient = uuid4(), uuid4()
    period = LoanPeriod(uuid4(), recipient, NOW, NOW + timedelta(days=1))
    def resolve(at):
        return operating_organization(at=at, location_organization_id=owner, loans=(period,))
    assert resolve(NOW - timedelta(seconds=1)) == (owner, None)
    assert resolve(NOW) == (recipient, period.loan_id)
    assert resolve(period.returned_at) == (owner, None)
    with pytest.raises(ValueError, match='Overlapping'):
        operating_organization(at=NOW, location_organization_id=owner, loans=(period, period))
    with pytest.raises(ValueError, match='timezone'):
        resolve(NOW.replace(tzinfo=None))
    with pytest.raises(ValueError, match='Return'):
        LoanPeriod(uuid4(), recipient, NOW, NOW - timedelta(days=1))
