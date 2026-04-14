from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class LocationHistory(Base):
    __tablename__ = "location_history"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE", onupdate="CASCADE"), nullable=False, index=True)
    allocation_id = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("master_allocations.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=True,
        index=True,
    )
    department: Mapped[str] = mapped_column(String(255), nullable=False)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    end_date = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship(back_populates="history")
    allocation: Mapped["Allocation | None"] = relationship(back_populates="history_entries")

    @property
    def display_name(self) -> str:
        if self.allocation:
            return self.allocation.display_name
        return self.department

    @property
    def organization_name(self) -> str | None:
        if self.allocation:
            return self.allocation.organization_name
        return None

    @property
    def department_name(self) -> str | None:
        if self.allocation:
            return self.allocation.department_name
        return None

    @property
    def allocation_name(self) -> str | None:
        if self.allocation:
            return self.allocation.name
        return None
