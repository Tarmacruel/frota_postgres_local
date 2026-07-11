from __future__ import annotations

import enum
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import INET, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class VehiclePossessionTripStatus(str, enum.Enum):
    EM_ANDAMENTO = "EM_ANDAMENTO"
    ENCERRADA = "ENCERRADA"
    CANCELADA = "CANCELADA"


class VehiclePossessionTrip(Base):
    __tablename__ = "vehicle_possession_trip"
    __table_args__ = (
        UniqueConstraint("possession_id", "sequence_number", name="uq_possession_trip_sequence"),
        UniqueConstraint("possession_id", "id", name="uq_possession_trip_possession_id_id"),
        CheckConstraint("sequence_number > 0", name="ck_possession_trip_sequence_positive"),
        CheckConstraint(
            "status IN ('EM_ANDAMENTO', 'ENCERRADA', 'CANCELADA')",
            name="ck_possession_trip_status",
        ),
        CheckConstraint("char_length(btrim(origin)) BETWEEN 1 AND 255", name="ck_possession_trip_origin_length"),
        CheckConstraint("char_length(btrim(purpose)) BETWEEN 1 AND 500", name="ck_possession_trip_purpose_length"),
        CheckConstraint(
            "observation IS NULL OR char_length(observation) <= 2000",
            name="ck_possession_trip_observation_length",
        ),
        CheckConstraint("start_odometer_km >= 0", name="ck_possession_trip_start_odometer_nonnegative"),
        CheckConstraint(
            "end_odometer_km IS NULL OR end_odometer_km >= start_odometer_km",
            name="ck_possession_trip_end_odometer_order",
        ),
        CheckConstraint("return_at IS NULL OR return_at >= departure_at", name="ck_possession_trip_return_order"),
        CheckConstraint(
            "(status = 'EM_ANDAMENTO' AND return_at IS NULL AND end_odometer_km IS NULL "
            "AND closed_by_user_id IS NULL AND closed_at IS NULL AND cancelled_by_user_id IS NULL "
            "AND cancelled_at IS NULL AND cancellation_reason IS NULL) OR "
            "(status = 'ENCERRADA' AND return_at IS NOT NULL AND end_odometer_km IS NOT NULL "
            "AND closed_by_user_id IS NOT NULL AND closed_at IS NOT NULL AND cancelled_by_user_id IS NULL "
            "AND cancelled_at IS NULL AND cancellation_reason IS NULL) OR "
            "(status = 'CANCELADA' AND return_at IS NULL AND end_odometer_km IS NULL "
            "AND closed_by_user_id IS NULL AND closed_at IS NULL AND cancelled_by_user_id IS NOT NULL "
            "AND cancelled_at IS NOT NULL AND char_length(btrim(cancellation_reason)) BETWEEN 8 AND 1000)",
            name="ck_possession_trip_status_fields",
        ),
        Index("idx_possession_trip_possession", "possession_id"),
        Index("idx_possession_trip_status", "status"),
        Index("idx_possession_trip_departure", "departure_at"),
        Index("idx_possession_trip_created_by", "created_by_user_id"),
        Index(
            "uq_possession_trip_open",
            "possession_id",
            unique=True,
            postgresql_where=text("status = 'EM_ANDAMENTO'"),
            sqlite_where=text("status = 'EM_ANDAMENTO'"),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    possession_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicle_possession.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[VehiclePossessionTripStatus] = mapped_column(
        SAEnum(VehiclePossessionTripStatus, native_enum=False, create_constraint=False, length=20),
        nullable=False,
        default=VehiclePossessionTripStatus.EM_ANDAMENTO,
        server_default=text("'EM_ANDAMENTO'"),
    )
    origin: Mapped[str] = mapped_column(String(255), nullable=False)
    purpose: Mapped[str] = mapped_column(String(500), nullable=False)
    departure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    return_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    start_odometer_km: Mapped[Decimal] = mapped_column(Numeric(12, 1), nullable=False)
    end_odometer_km: Mapped[Decimal | None] = mapped_column(Numeric(12, 1), nullable=True)
    observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    closed_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    cancelled_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    possession: Mapped["VehiclePossession"] = relationship(back_populates="trips")
    destinations: Mapped[list["VehiclePossessionTripDestination"]] = relationship(
        back_populates="trip",
        passive_deletes=True,
        order_by="VehiclePossessionTripDestination.sequence_number.asc()",
    )
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by_user_id])
    closed_by_user: Mapped["User | None"] = relationship(foreign_keys=[closed_by_user_id])
    cancelled_by_user: Mapped["User | None"] = relationship(foreign_keys=[cancelled_by_user_id])


class VehiclePossessionTripDestination(Base):
    __tablename__ = "vehicle_possession_trip_destination"
    __table_args__ = (
        UniqueConstraint("trip_id", "sequence_number", name="uq_possession_trip_destination_sequence"),
        CheckConstraint("sequence_number > 0", name="ck_possession_trip_destination_sequence_positive"),
        CheckConstraint(
            "char_length(btrim(description)) BETWEEN 1 AND 300",
            name="ck_possession_trip_destination_description_length",
        ),
        CheckConstraint(
            "address_reference IS NULL OR char_length(address_reference) <= 500",
            name="ck_possession_trip_destination_address_length",
        ),
        CheckConstraint(
            "observation IS NULL OR char_length(observation) <= 2000",
            name="ck_possession_trip_destination_observation_length",
        ),
        CheckConstraint(
            "departed_at IS NULL OR arrived_at IS NOT NULL",
            name="ck_possession_trip_destination_departure_requires_arrival",
        ),
        CheckConstraint(
            "departed_at IS NULL OR departed_at >= arrived_at",
            name="ck_possession_trip_destination_time_order",
        ),
        Index("idx_possession_trip_destination_trip", "trip_id"),
        Index("idx_possession_trip_destination_created_by", "created_by_user_id"),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    trip_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicle_possession_trip.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    sequence_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    address_reference: Mapped[str | None] = mapped_column(String(500), nullable=True)
    observation: Mapped[str | None] = mapped_column(Text, nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    departed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by_user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    trip: Mapped[VehiclePossessionTrip] = relationship(back_populates="destinations")
    created_by_user: Mapped["User"] = relationship(foreign_keys=[created_by_user_id])


class VehiclePossessionReturnConfirmation(Base):
    __tablename__ = "vehicle_possession_return_confirmation"
    __table_args__ = (
        UniqueConstraint("possession_id", "version", name="uq_possession_return_confirmation_version"),
        UniqueConstraint("possession_id", "id", name="uq_possession_return_confirmation_possession_id_id"),
        ForeignKeyConstraint(
            ["possession_id", "last_trip_id"],
            ["vehicle_possession_trip.possession_id", "vehicle_possession_trip.id"],
            name="fk_return_confirmation_last_trip_same_possession",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        ForeignKeyConstraint(
            ["possession_id", "superseded_by_confirmation_id"],
            [
                "vehicle_possession_return_confirmation.possession_id",
                "vehicle_possession_return_confirmation.id",
            ],
            name="fk_return_confirmation_superseded_same_possession",
            ondelete="RESTRICT",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("version > 0", name="ck_possession_return_confirmation_version_positive"),
        CheckConstraint(
            "canonical_payload_hash ~ '^[0-9a-f]{64}$'",
            name="ck_possession_return_confirmation_hash",
        ),
        CheckConstraint(
            "request_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$'",
            name="ck_possession_return_confirmation_request_id",
        ),
        CheckConstraint("final_odometer_km >= 0", name="ck_possession_return_confirmation_odometer_nonnegative"),
        CheckConstraint(
            "char_length(btrim(declaration_version)) BETWEEN 1 AND 32",
            name="ck_possession_return_confirmation_declaration_version",
        ),
        CheckConstraint(
            "char_length(btrim(declaration_text)) BETWEEN 1 AND 8000",
            name="ck_possession_return_confirmation_declaration_text",
        ),
        CheckConstraint(
            "char_length(btrim(vehicle_condition_notes)) BETWEEN 1 AND 4000",
            name="ck_possession_return_confirmation_condition_notes",
        ),
        CheckConstraint(
            "(is_current AND superseded_at IS NULL AND superseded_by_confirmation_id IS NULL) OR "
            "(NOT is_current AND superseded_at IS NOT NULL AND superseded_by_confirmation_id IS NOT NULL "
            "AND superseded_by_confirmation_id <> id AND superseded_at >= confirmed_at)",
            name="ck_possession_return_confirmation_current_state",
        ),
        CheckConstraint(
            "(version = 1 AND admin_correction_reason IS NULL) OR "
            "(version > 1 AND char_length(btrim(admin_correction_reason)) BETWEEN 8 AND 1000)",
            name="ck_possession_return_confirmation_correction_reason",
        ),
        Index("idx_possession_return_confirmation_possession", "possession_id"),
        Index("idx_possession_return_confirmation_confirmed_by", "confirmed_by_user_id"),
        Index("idx_possession_return_confirmation_confirmed_at", "confirmed_at"),
        Index(
            "uq_possession_return_confirmation_current",
            "possession_id",
            unique=True,
            postgresql_where=text("is_current"),
            sqlite_where=text("is_current = 1"),
        ),
    )

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    possession_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("vehicle_possession.id", ondelete="RESTRICT", onupdate="CASCADE"),
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    declaration_version: Mapped[str] = mapped_column(String(32), nullable=False)
    declaration_text: Mapped[str] = mapped_column(Text, nullable=False)
    canonical_payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    confirmed_by_user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    confirmer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    confirmer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    confirmer_role: Mapped[str] = mapped_column(String(30), nullable=False)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    request_id: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_address: Mapped[str] = mapped_column(INET, nullable=False)
    user_agent: Mapped[str] = mapped_column(String(256), nullable=False)
    final_odometer_km: Mapped[Decimal] = mapped_column(Numeric(12, 1), nullable=False)
    vehicle_condition_notes: Mapped[str] = mapped_column(Text, nullable=False)
    last_trip_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    superseded_by_confirmation_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    admin_correction_reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))

    possession: Mapped["VehiclePossession"] = relationship(
        back_populates="return_confirmations",
        foreign_keys=[possession_id],
    )
    confirmed_by_user: Mapped["User | None"] = relationship(foreign_keys=[confirmed_by_user_id])
    last_trip: Mapped[VehiclePossessionTrip | None] = relationship(
        primaryjoin="VehiclePossessionReturnConfirmation.last_trip_id == VehiclePossessionTrip.id",
        foreign_keys=[last_trip_id],
        viewonly=True,
    )
    superseded_by: Mapped["VehiclePossessionReturnConfirmation | None"] = relationship(
        primaryjoin=(
            "VehiclePossessionReturnConfirmation.superseded_by_confirmation_id == "
            "remote(VehiclePossessionReturnConfirmation.id)"
        ),
        foreign_keys=[superseded_by_confirmation_id],
        remote_side="VehiclePossessionReturnConfirmation.id",
        viewonly=True,
    )
