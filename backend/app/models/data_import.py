from __future__ import annotations

import enum
from datetime import datetime
from uuid import UUID
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, JSON, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class DataImportEntityType(str, enum.Enum):
    VEHICLE = "VEHICLE"
    DRIVER = "DRIVER"
    FINE = "FINE"


class DataImportBatchStatus(str, enum.Enum):
    ANALYZED = "ANALYZED"
    REVIEWING = "REVIEWING"
    APPLIED = "APPLIED"
    CANCELLED = "CANCELLED"


class DataImportRowStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    APPLIED = "APPLIED"
    ERROR = "ERROR"


class DataImportSuggestedAction(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    REVIEW = "REVIEW"
    SKIP = "SKIP"


class DataImportBatch(Base):
    __tablename__ = "data_import_batches"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    entity_type: Mapped[DataImportEntityType] = mapped_column(Enum(DataImportEntityType, name="data_import_entity_type"), nullable=False)
    status: Mapped[DataImportBatchStatus] = mapped_column(
        Enum(DataImportBatchStatus, name="data_import_batch_status"),
        nullable=False,
        default=DataImportBatchStatus.ANALYZED,
    )
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path = mapped_column(String(255), nullable=True)
    header_row_index = mapped_column(Integer, nullable=True)
    detected_columns = mapped_column(JSON, nullable=False, default=list)
    importable_fields = mapped_column(JSON, nullable=False, default=list)
    official_extra_fields = mapped_column(JSON, nullable=False, default=list)
    triage_extra_fields = mapped_column(JSON, nullable=False, default=list)
    summary = mapped_column(JSON, nullable=False, default=dict)
    notes = mapped_column(Text, nullable=True)
    created_by_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    applied_by_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    applied_at = mapped_column(DateTime(timezone=True), nullable=True)

    rows: Mapped[list["DataImportRow"]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="DataImportRow.row_number.asc()",
    )


class DataImportRow(Base):
    __tablename__ = "data_import_rows"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    batch_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("data_import_batches.id", ondelete="CASCADE"), nullable=False, index=True)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[DataImportRowStatus] = mapped_column(
        Enum(DataImportRowStatus, name="data_import_row_status"),
        nullable=False,
        default=DataImportRowStatus.PENDING,
        index=True,
    )
    suggested_action: Mapped[DataImportSuggestedAction] = mapped_column(
        Enum(DataImportSuggestedAction, name="data_import_suggested_action"),
        nullable=False,
        default=DataImportSuggestedAction.REVIEW,
    )
    matched_entity_id = mapped_column(PGUUID(as_uuid=True), nullable=True, index=True)
    matched_by = mapped_column(String(40), nullable=True)
    raw_data = mapped_column(JSON, nullable=False, default=dict)
    mapped_data = mapped_column(JSON, nullable=False, default=dict)
    official_extra_data = mapped_column(JSON, nullable=False, default=dict)
    triage_extra_data = mapped_column(JSON, nullable=False, default=dict)
    conflicts = mapped_column(JSON, nullable=False, default=list)
    validation_errors = mapped_column(JSON, nullable=False, default=list)
    manager_notes = mapped_column(Text, nullable=True)
    applied_result = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("NOW()"))
    applied_at = mapped_column(DateTime(timezone=True), nullable=True)

    batch: Mapped[DataImportBatch] = relationship(back_populates="rows")
