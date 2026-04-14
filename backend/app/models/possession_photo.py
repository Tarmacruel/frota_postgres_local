from __future__ import annotations

from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class VehiclePossessionPhoto(Base):
    __tablename__ = "vehicle_possession_photos"
    __table_args__ = (
        Index("idx_possession_photo_possession", "possession_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    possession_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicle_possession.id", ondelete="CASCADE"),
        nullable=False,
    )
    photo_path: Mapped[str] = mapped_column(String(255), nullable=False)
    photo_mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    photo_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_captured_at = mapped_column(DateTime(timezone=True), nullable=True)
    capture_latitude = mapped_column(Float, nullable=True)
    capture_longitude = mapped_column(Float, nullable=True)
    capture_accuracy_meters = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    possession: Mapped["VehiclePossession"] = relationship(back_populates="photos")
