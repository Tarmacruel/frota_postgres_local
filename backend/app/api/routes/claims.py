from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.claim import ClaimStatus, ClaimType
from app.models.user import User
from app.schemas.claim import ClaimCreate, ClaimListResponse, ClaimOut, ClaimUpdate
from app.services.claim_service import ClaimService

router = APIRouter(prefix="/api/claims", tags=["Claims"])


def parse_claim_create_form(data: str = Form(...)) -> ClaimCreate:
    try:
        return ClaimCreate.model_validate_json(data)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


def parse_claim_update_form(data: str = Form(...)) -> ClaimUpdate:
    try:
        return ClaimUpdate.model_validate_json(data)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


def parse_removed_attachment_ids(value: str) -> list[UUID]:
    try:
        return TypeAdapter(list[UUID]).validate_json(value)
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


@router.get("", response_model=ClaimListResponse)
async def list_claims(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    vehicle_id: UUID | None = Query(default=None),
    organization_id: UUID | None = Query(default=None),
    status_filter: ClaimStatus | None = Query(default=None, alias="status"),
    tipo: ClaimType | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("claims", "view")),
):
    return await ClaimService(db).list(
        page=page,
        limit=limit,
        vehicle_id=vehicle_id,
        organization_id=organization_id,
        status_filter=status_filter,
        tipo=tipo,
        search=search,
        current_user=current_user,
    )


@router.post("/with-attachments", response_model=ClaimOut, status_code=status.HTTP_201_CREATED)
async def create_claim_with_attachments(
    data: ClaimCreate = Depends(parse_claim_create_form),
    attachments: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("claims", "create")),
):
    return await ClaimService(db).create(data, current_user, attachments=attachments)


@router.get("/{claim_id}", response_model=ClaimOut)
async def get_claim(
    claim_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("claims", "view")),
):
    return await ClaimService(db).get(claim_id, current_user=current_user)


@router.post("", response_model=ClaimOut, status_code=status.HTTP_201_CREATED)
async def create_claim(
    data: ClaimCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_permission("claims", "create")),
):
    return await ClaimService(db).create(data, current_user)


@router.put("/{claim_id}", response_model=ClaimOut)
async def update_claim(
    claim_id: UUID,
    data: ClaimUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user=Depends(require_permission("claims", "edit")),
):
    return await ClaimService(db).update(claim_id, data, current_user)


@router.put("/{claim_id}/with-attachments", response_model=ClaimOut)
async def update_claim_with_attachments(
    claim_id: UUID,
    data: ClaimUpdate = Depends(parse_claim_update_form),
    removed_attachment_ids: str = Form(default="[]"),
    attachments: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("claims", "edit")),
):
    return await ClaimService(db).update(
        claim_id,
        data,
        current_user,
        attachments=attachments,
        removed_attachment_ids=parse_removed_attachment_ids(removed_attachment_ids),
    )


@router.post("/{claim_id}/attachments", response_model=ClaimOut)
async def add_claim_attachments(
    claim_id: UUID,
    attachments: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("claims", "edit")),
):
    return await ClaimService(db).update(
        claim_id,
        ClaimUpdate(),
        current_user,
        attachments=attachments,
    )


@router.get("/{claim_id}/attachments/{attachment_id}")
async def get_claim_attachment(
    claim_id: UUID,
    attachment_id: UUID,
    download: bool = Query(default=False),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("claims", "view")),
) -> FileResponse:
    return await ClaimService(db).get_attachment_file(
        claim_id,
        attachment_id,
        current_user=current_user,
        download=download,
    )


@router.delete("/{claim_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_claim_attachment(
    claim_id: UUID,
    attachment_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("claims", "edit")),
) -> Response:
    await ClaimService(db).update(
        claim_id,
        ClaimUpdate(),
        current_user,
        removed_attachment_ids=[attachment_id],
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
