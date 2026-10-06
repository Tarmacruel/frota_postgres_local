"""Organization scope only: callers must also enforce module/personal-data permissions.

Phase 01 foundation; existing routes switch to this policy in phase 03.
Responsibility intervals are [delivery, return); visibility includes the return event.
"""
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True)
class LoanPeriod:
    loan_id: UUID
    recipient_organization_id: UUID
    started_at: datetime
    returned_at: datetime | None = None

    def __post_init__(self):
        _aware(self.started_at)
        if self.returned_at is not None:
            _aware(self.returned_at)
            if self.returned_at < self.started_at:
                raise ValueError('Return must not precede delivery')


def _aware(value: datetime) -> None:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError('Responsibility dates must include timezone')


def operating_organization(*, at: datetime, location_organization_id: UUID | None,
                           loans: tuple[LoanPeriod, ...]) -> tuple[UUID | None, UUID | None]:
    """Location must be resolved for `at`, not inferred from today's allocation."""
    _aware(at)
    matches = [loan for loan in loans if loan.started_at <= at and (loan.returned_at is None or at < loan.returned_at)]
    if len(matches) > 1:
        raise ValueError('Overlapping loan periods require administrative review')
    if matches:
        return matches[0].recipient_organization_id, matches[0].loan_id
    return location_organization_id, None


@dataclass(frozen=True)
class VehicleScope:
    owner_organization_id: UUID | None
    current_organization_id: UUID | None
    loans: tuple[LoanPeriod, ...] = ()

    def can_view(self, organization_id: UUID | None, *, now: datetime,
                 occurred_at: datetime | None = None, is_admin: bool = False) -> bool:
        """No occurred_at means history/detail access, not inclusion in an operational list."""
        _aware(now)
        if occurred_at is not None:
            _aware(occurred_at)
        if is_admin:
            return True
        if organization_id is None:
            return False
        if organization_id in (self.owner_organization_id, self.current_organization_id):
            return True
        return any(loan.recipient_organization_id == organization_id
                   and loan.started_at <= now
                   and (occurred_at is None or loan.returned_at is None or occurred_at <= loan.returned_at)
                   for loan in self.loans)

    def can_operate(self, organization_id: UUID | None, *, now: datetime, is_admin: bool = False) -> bool:
        responsible, _ = operating_organization(at=now, location_organization_id=self.current_organization_id, loans=self.loans)
        return is_admin or (organization_id is not None and organization_id == responsible)

    def can_manage_registration(self, organization_id: UUID | None, *, is_admin: bool = False) -> bool:
        # Existing vehicles without an identified owner retain their current scope.
        owner = self.owner_organization_id or self.current_organization_id
        return is_admin or (organization_id is not None and organization_id == owner)
