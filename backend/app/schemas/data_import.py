from __future__ import annotations

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field
from app.models.data_import import (
    DataImportBatchStatus,
    DataImportEntityType,
    DataImportRowStatus,
    DataImportSuggestedAction,
)
from app.schemas.common import PaginatedResponse


class DataImportBatchOut(BaseModel):
    id: UUID
    entity_type: DataImportEntityType
    status: DataImportBatchStatus
    source_filename: str
    header_row_index: int | None
    detected_columns: list[str]
    importable_fields: list[str]
    official_extra_fields: list[str]
    triage_extra_fields: list[str]
    summary: dict
    notes: str | None
    created_by_id: UUID | None
    applied_by_id: UUID | None
    created_at: datetime
    updated_at: datetime
    applied_at: datetime | None


class DataImportRowOut(BaseModel):
    id: UUID
    batch_id: UUID
    row_number: int
    status: DataImportRowStatus
    suggested_action: DataImportSuggestedAction
    matched_entity_id: UUID | None
    matched_by: str | None
    raw_data: dict
    mapped_data: dict
    official_extra_data: dict
    triage_extra_data: dict
    conflicts: list
    validation_errors: list
    manager_notes: str | None
    applied_result: dict | None
    created_at: datetime
    updated_at: datetime
    applied_at: datetime | None


class DataImportBatchDetailOut(DataImportBatchOut):
    rows_preview: list[DataImportRowOut] = Field(default_factory=list)


class DataImportRowListResponse(PaginatedResponse[DataImportRowOut]):
    pass


class DataImportRowUpdate(BaseModel):
    status: DataImportRowStatus | None = None
    mapped_data: dict | None = None
    official_extra_data: dict | None = None
    triage_extra_data: dict | None = None
    manager_notes: str | None = None


class DataImportApplyOut(BaseModel):
    batch_id: UUID
    created: int
    updated: int
    errors: int
    skipped: int
    applied_at: datetime
