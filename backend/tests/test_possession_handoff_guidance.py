"""Temporal conflicts explain effective handoffs without bypassing responsibility."""
from contextlib import nullcontext
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.vehicle_responsibility import LoanPeriod
from app.models.possession import VehiclePossession
from app.models.user import UserRole
from app.services import operational_scope


def instant(value):
    return datetime.fromisoformat('2026-10-27T' + value + '-03:00')


@pytest.fixture
def history(monkeypatch):
    origin, recipient = uuid4(), uuid4()
    periods = (
        LoanPeriod(uuid4(), recipient, instant('08:42:21'), instant('16:27:10.700602')),
        LoanPeriod(uuid4(), recipient, instant('16:40:35'), instant('16:45:44.415276')),
    )
    repo = SimpleNamespace(
        effective_periods=AsyncMock(return_value=periods),
        responsibility_at=AsyncMock(return_value=(origin, None)),
    )
    monkeypatch.setattr(operational_scope, 'VehicleLoanRepository', lambda db: repo)
    monkeypatch.setattr(operational_scope, 'lock_vehicle_handoff', AsyncMock())
    return SimpleNamespace(repo=repo, origin=origin, periods=periods,
        db=SimpleNamespace(no_autoflush=nullcontext()),
        user=SimpleNamespace(role=UserRole.ADMIN, organization_id=origin))


async def attribute(history, start, end=None):
    record = VehiclePossession(vehicle_id=uuid4(), driver_name='Condutor de teste',
        start_date=start, end_date=end)
    await operational_scope.attribute_operation(history.db, record, history.user, new=True)
    return record


@pytest.mark.asyncio
async def test_returned_history_explains_real_case_in_institutional_timezone(history):
    # An equivalent UTC input must still produce municipal local times.
    with pytest.raises(HTTPException) as error:
        await attribute(history, instant('14:16:00').astimezone(timezone.utc))
    assert error.value.status_code == 409
    detail = error.value.detail
    assert detail['code'] == 'POSSESSION_CROSSES_HANDOFF'
    assert '27/10/2026 às 14:16:00' in detail['message']
    assert 'devolução entre secretarias em 27/10/2026 às 16:27:10' in detail['message']
    assert 'última movimentação no intervalo ocorreu em 27/10/2026 às 16:45:44' in detail['message']
    assert '17:00' not in detail['message']
    assert 'revisão administrativa' in detail['message']
    assert datetime.fromisoformat(detail['last_handoff_at']) == instant('16:45:44.415276')


@pytest.mark.asyncio
@pytest.mark.parametrize('start', ['16:45:44.415276', '16:46:00'])
@pytest.mark.parametrize('role', [UserRole.ADMIN, UserRole.PRODUCAO])
async def test_possession_after_return_is_attributed_to_origin(history, start, role):
    history.user.role = role
    record = await attribute(history, instant(start))
    assert record.responsible_organization_id == history.origin
    assert record.vehicle_loan_id is None


@pytest.mark.asyncio
async def test_deliveries_remain_blocked_and_closed_intervals_ignore_later_events(history):
    with pytest.raises(HTTPException) as error:
        await attribute(history, instant('16:30:00'), instant('16:42:00'))
    detail = error.value.detail
    assert 'entrega entre secretarias em 27/10/2026 às 16:40:35' in detail['message']
    assert detail['last_handoff_at'] == instant('16:40:35').isoformat()
    assert 'Para uma nova posse' not in detail['message']


@pytest.mark.asyncio
async def test_historical_closed_possession_within_one_period_is_allowed(history):
    period = history.periods[0]
    history.repo.responsibility_at.return_value = (period.recipient_organization_id, period.loan_id)
    record = await attribute(history, instant('14:16:00'), instant('15:00:00'))
    assert record.vehicle_loan_id == period.loan_id


@pytest.mark.asyncio
async def test_foreign_secretariat_still_cannot_create_after_return(history):
    history.user = SimpleNamespace(role=UserRole.PRODUCAO, organization_id=uuid4())
    with pytest.raises(HTTPException) as error:
        await attribute(history, instant('16:46:00'))
    assert error.value.status_code == 403
