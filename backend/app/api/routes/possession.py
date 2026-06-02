from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.possession import (
    PossessionAdminUpdate,
    PossessionCreate,
    PossessionListResponse,
    PossessionOut,
    PossessionPhotoCreate,
    PossessionTermPublicOut,
    PossessionUpdate,
)
from app.services.possession_service import PossessionService

router = APIRouter(prefix="/api/possession", tags=["Possession"])
public_router = APIRouter(prefix="/api/public/possession-terms", tags=["PublicPossessionTerms"])


def _raise_form_error(loc: str, message: str) -> None:
    raise RequestValidationError(
        [
            {
                "loc": ("body", loc),
                "msg": message,
                "type": "value_error",
            }
        ]
    )


def _parse_photo_metadata(
    photo_metadata_json: str | None,
    *,
    required: bool,
) -> list[PossessionPhotoCreate]:
    if not photo_metadata_json:
        if required:
            _raise_form_error("photo_metadata_json", "As fotos da posse precisam trazer os metadados de captura.")
        return []

    try:
        payload = json.loads(photo_metadata_json)
    except json.JSONDecodeError as exc:
        _raise_form_error("photo_metadata_json", "Os metadados das fotos estao em formato inválido.")

    if not isinstance(payload, list):
        _raise_form_error("photo_metadata_json", "Os metadados das fotos devem ser enviados como lista.")

    if required and not payload:
        _raise_form_error("photo_metadata_json", "Ao menos uma foto georreferenciada é obrigatória para registrar a posse.")

    try:
        return [PossessionPhotoCreate.model_validate(item) for item in payload]
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


def parse_possession_form(
    vehicle_id: UUID = Form(...),
    driver_id: UUID | None = Form(default=None),
    driver_name: str = Form(...),
    driver_document: str | None = Form(default=None),
    driver_contact: str | None = Form(default=None),
    start_date: datetime | None = Form(default=None),
    observation: str | None = Form(default=None),
    start_odometer_km: float | None = Form(default=None),
) -> PossessionCreate:
    try:
        return PossessionCreate(
            vehicle_id=vehicle_id,
            driver_id=driver_id,
            driver_name=driver_name,
            driver_document=driver_document,
            driver_contact=driver_contact,
            start_date=start_date,
            observation=observation,
            start_odometer_km=start_odometer_km,
        )
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


def parse_possession_photo_metadata(
    photo_metadata_json: str | None = Form(default=None),
) -> list[PossessionPhotoCreate]:
    return _parse_photo_metadata(photo_metadata_json, required=False)


def parse_admin_update_form(
    driver_id: UUID | None = Form(default=None),
    driver_name: str = Form(...),
    driver_document: str | None = Form(default=None),
    driver_contact: str | None = Form(default=None),
    start_date: datetime = Form(...),
    end_date: datetime | None = Form(default=None),
    observation: str | None = Form(default=None),
    start_odometer_km: float | None = Form(default=None),
    end_odometer_km: float | None = Form(default=None),
    edit_reason: str = Form(...),
) -> PossessionAdminUpdate:
    try:
        return PossessionAdminUpdate(
            driver_name=driver_name,
            driver_id=driver_id,
            driver_document=driver_document,
            driver_contact=driver_contact,
            start_date=start_date,
            end_date=end_date,
            observation=observation,
            start_odometer_km=start_odometer_km,
            end_odometer_km=end_odometer_km,
            edit_reason=edit_reason,
        )
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


def parse_admin_photo_metadata(
    photo_metadata_json: str | None = Form(default=None),
) -> list[PossessionPhotoCreate]:
    return _parse_photo_metadata(photo_metadata_json, required=False)


def _nullable_form_value(value):
    if value is None or hasattr(value, "filename"):
        return None
    normalized = str(value).strip()
    return normalized or None


def _form_upload(value) -> UploadFile | None:
    if hasattr(value, "filename") and getattr(value, "filename", None):
        return value
    return None


async def parse_possession_end_request(request: Request) -> tuple[PossessionUpdate, UploadFile | None]:
    content_type = request.headers.get("content-type", "").lower()
    return_term_document: UploadFile | None = None

    if content_type.startswith("multipart/form-data") or content_type.startswith("application/x-www-form-urlencoded"):
        form = await request.form()
        payload = {}
        for field_name in ("end_date", "observation", "end_odometer_km"):
            value = _nullable_form_value(form.get(field_name))
            if value is not None:
                payload[field_name] = value
        return_term_document = _form_upload(form.get("return_term_document"))
    else:
        try:
            payload = await request.json()
        except json.JSONDecodeError:
            payload = {}

        if payload is None:
            payload = {}
        if not isinstance(payload, dict):
            _raise_form_error("body", "Dados de encerramento da posse em formato invÃ¡lido.")

    try:
        return PossessionUpdate.model_validate(payload), return_term_document
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


@router.get("", response_model=list[PossessionOut])
async def list_possession(
    vehicle_id: UUID | None = Query(default=None),
    active: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
):
    return await PossessionService(db).list(vehicle_id=vehicle_id, active=active, current_user=current_user)


@router.get("/paginated", response_model=PossessionListResponse)
async def list_possession_paginated(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    vehicle_id: UUID | None = Query(default=None),
    driver_id: UUID | None = Query(default=None),
    active: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
):
    return await PossessionService(db).list_paginated(
        page=page,
        limit=limit,
        vehicle_id=vehicle_id,
        active=active,
        driver_id=driver_id,
        search=search,
        current_user=current_user,
    )


@router.get("/active", response_model=list[PossessionOut])
async def list_active_possession(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
):
    return await PossessionService(db).list_active(current_user=current_user)


@router.post("", response_model=PossessionOut)
async def create_possession(
    data: PossessionCreate = Depends(parse_possession_form),
    photo_metadata: list[PossessionPhotoCreate] = Depends(parse_possession_photo_metadata),
    photos: list[UploadFile] | None = File(default=None),
    loan_term_document: UploadFile | None = File(default=None),
    signed_document: UploadFile | None = File(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "create")),
):
    return await PossessionService(db).start(
        data,
        photos=photos or [],
        photo_metadata=photo_metadata,
        loan_term_document=loan_term_document or signed_document,
        current_user=current_user,
    )


@router.get("/{possession_id}/photo")
async def get_possession_photo(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
) -> FileResponse:
    return await PossessionService(db).get_photo_file(possession_id, current_user=current_user)


@router.get("/{possession_id}/photos/{photo_id}")
async def get_possession_photo_by_id(
    possession_id: UUID,
    photo_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
) -> FileResponse:
    return await PossessionService(db).get_photo_file(possession_id, photo_id=photo_id, current_user=current_user)


@router.get("/{possession_id}/document")
async def get_possession_document(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
) -> FileResponse:
    return await PossessionService(db).get_document_file(possession_id, document_kind="loan", current_user=current_user)


@router.get("/{possession_id}/documents/loan-term")
async def get_possession_loan_term_document(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
) -> FileResponse:
    return await PossessionService(db).get_document_file(possession_id, document_kind="loan", current_user=current_user)


@router.get("/{possession_id}/documents/return-term")
async def get_possession_return_term_document(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "view")),
) -> FileResponse:
    return await PossessionService(db).get_document_file(possession_id, document_kind="return", current_user=current_user)


@router.put("/{possession_id}/end", response_model=PossessionOut)
async def end_possession(
    possession_id: UUID,
    parsed: tuple[PossessionUpdate, UploadFile | None] = Depends(parse_possession_end_request),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "edit")),
):
    data, return_term_document = parsed
    return await PossessionService(db).end(
        possession_id,
        data,
        current_user,
        return_term_document=return_term_document,
    )


@router.put("/{possession_id}", response_model=PossessionOut)
async def update_possession(
    possession_id: UUID,
    data: PossessionAdminUpdate = Depends(parse_admin_update_form),
    photo_metadata: list[PossessionPhotoCreate] = Depends(parse_admin_photo_metadata),
    loan_term_document: UploadFile | None = File(default=None),
    signed_document: UploadFile | None = File(default=None),
    return_term_document: UploadFile | None = File(default=None),
    new_photos: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "edit")),
):
    return await PossessionService(db).admin_update(
        possession_id,
        data,
        current_user,
        loan_term_document=loan_term_document or signed_document,
        return_term_document=return_term_document,
        new_photos=new_photos or [],
        new_photo_metadata=photo_metadata,
    )


@router.delete("/{possession_id}", response_model=MessageOut)
async def delete_possession(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("possession", "delete")),
):
    await PossessionService(db).delete(possession_id, current_user)
    return {"message": "Removido"}


@public_router.get("/loan/{validation_code}", response_model=PossessionTermPublicOut)
async def get_public_loan_term(
    validation_code: str,
    db: AsyncSession = Depends(get_db_session),
):
    return await PossessionService(db).get_public_term(validation_code, term_type="loan")


@public_router.get("/return/{validation_code}", response_model=PossessionTermPublicOut)
async def get_public_return_term(
    validation_code: str,
    db: AsyncSession = Depends(get_db_session),
):
    return await PossessionService(db).get_public_term(validation_code, term_type="return")
