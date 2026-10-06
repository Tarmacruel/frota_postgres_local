"""Nullable attribution foundation; existing operations remain compatible in phase 01."""
from uuid import UUID
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column


class LoanAttributionMixin:
    vehicle_loan_id: Mapped[UUID | None] = mapped_column(ForeignKey('vehicle_loans.id', ondelete='RESTRICT'), nullable=True, index=True)


class OperationalResponsibilityMixin(LoanAttributionMixin):
    responsible_organization_id: Mapped[UUID | None] = mapped_column(ForeignKey('master_organizations.id', ondelete='RESTRICT'), nullable=True, index=True)
