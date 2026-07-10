from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.data_import import DataImportEntityType, DataImportRowStatus
from app.models.user import User
from app.schemas.data_import import (
    DataImportApplyOut,
    DataImportBatchDetailOut,
    DataImportBatchOut,
    DataImportRowListResponse,
    DataImportRowOut,
    DataImportRowUpdate,
)
from app.services.data_import_service import DataImportService

router = APIRouter(prefix="/api/data-imports", tags=["DataImports"])


@router.post("/upload", response_model=DataImportBatchDetailOut)
async def upload_data_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("data_imports", "create")),
):
    return await DataImportService(db).upload(file, current_user)


@router.get("", response_model=list[DataImportBatchOut])
async def list_data_import_batches(
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("data_imports", "view")),
):
    return await DataImportService(db).list_batches()


@router.get("/{batch_id}", response_model=DataImportBatchDetailOut)
async def get_data_import_batch(
    batch_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("data_imports", "view")),
):
    return await DataImportService(db).get_batch(batch_id)


@router.get("/{batch_id}/rows", response_model=DataImportRowListResponse)
async def list_data_import_rows(
    batch_id: UUID,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    status_filter: DataImportRowStatus | None = Query(default=None, alias="status"),
    has_conflict: bool | None = Query(default=None),
    has_error: bool | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=120),
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("data_imports", "view")),
):
    return await DataImportService(db).list_rows(
        batch_id,
        page=page,
        limit=limit,
        row_status=status_filter,
        has_conflict=has_conflict,
        has_error=has_error,
        search=search,
    )


@router.put("/{batch_id}/rows/{row_id}", response_model=DataImportRowOut)
async def update_data_import_row(
    batch_id: UUID,
    row_id: UUID,
    data: DataImportRowUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("data_imports", "edit")),
):
    return await DataImportService(db).update_row(batch_id, row_id, data, current_user)


@router.post("/{batch_id}/apply", response_model=DataImportApplyOut)
async def apply_data_import_batch(
    batch_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("data_imports", "edit")),
):
    return await DataImportService(db).apply(batch_id, current_user)


@router.get("/{batch_id}/export")
async def export_data_import_batch(
    batch_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("data_imports", "view")),
):
    filename, content = await DataImportService(db).export_batch_csv(batch_id)
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/templates/{entity_type}")
async def export_data_import_template(
    entity_type: DataImportEntityType,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("data_imports", "view")),
):
    filename, content = DataImportService(db).export_template_csv(entity_type)
    return Response(
        content=content.encode("utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
