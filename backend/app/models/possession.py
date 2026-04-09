from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class VehiclePossession(Base):
    __tablename__ = "vehicle_possession"
    __table_args__ = (
        Index("idx_possession_vehicle", "vehicle_id"),
        Index("idx_possession_driver", "driver_name"),
        Index("uq_possession_active", "vehicle_id", unique=True, postgresql_where=text("end_date IS NULL")),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    vehicle_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicles.id", ondelete="CASCADE", onupdate="CASCADE"),
        nullable=False,
    )
    driver_name: Mapped[str] = mapped_column(String(150), nullable=False)
    driver_document: Mapped[str | None] = mapped_column(String(20), nullable=True)
    driver_contact: Mapped[str | None] = mapped_column(String(50), nullable=True)
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    vehicle: Mapped["Vehicle"] = relationship(back_populates="possessions")

    @property
    def is_active(self) -> bool:
        return self.end_date is None
