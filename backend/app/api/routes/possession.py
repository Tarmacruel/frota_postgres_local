from __future__ import annotations

import json
from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin, require_writer
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.possession import (
    PossessionAdminUpdate,
    PossessionCreate,
    PossessionListResponse,
    PossessionOut,
    PossessionPhotoCreate,
    PossessionUpdate,
)
from app.services.possession_service import PossessionService

router = APIRouter(prefix="/api/possession", tags=["Possession"])


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
        _raise_form_error("photo_metadata_json", "Os metadados das fotos estao em formato invalido.")

    if not isinstance(payload, list):
        _raise_form_error("photo_metadata_json", "Os metadados das fotos devem ser enviados como lista.")

    if required and not payload:
        _raise_form_error("photo_metadata_json", "Ao menos uma foto georreferenciada e obrigatoria para registrar a posse.")

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


@router.get("", response_model=list[PossessionOut])
async def list_possession(
    vehicle_id: UUID | None = Query(default=None),
    active: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    return await PossessionService(db).list_active(current_user=current_user)


@router.post("", response_model=PossessionOut)
async def create_possession(
    data: PossessionCreate = Depends(parse_possession_form),
    photo_metadata: list[PossessionPhotoCreate] = Depends(parse_possession_photo_metadata),
    photos: list[UploadFile] | None = File(default=None),
    signed_document: UploadFile | None = File(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await PossessionService(db).start(
        data,
        photos=photos or [],
        photo_metadata=photo_metadata,
        signed_document=signed_document,
        current_user=current_user,
    )


@router.get("/{possession_id}/photo")
async def get_possession_photo(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(get_current_user),
) -> FileResponse:
    return await PossessionService(db).get_photo_file(possession_id)


@router.get("/{possession_id}/photos/{photo_id}")
async def get_possession_photo_by_id(
    possession_id: UUID,
    photo_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(get_current_user),
) -> FileResponse:
    return await PossessionService(db).get_photo_file(possession_id, photo_id=photo_id)


@router.get("/{possession_id}/document")
async def get_possession_document(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(get_current_user),
) -> FileResponse:
    return await PossessionService(db).get_document_file(possession_id)


@router.put("/{possession_id}/end", response_model=PossessionOut)
async def end_possession(
    possession_id: UUID,
    data: PossessionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await PossessionService(db).end(possession_id, data, current_user)


@router.put("/{possession_id}", response_model=PossessionOut)
async def update_possession(
    possession_id: UUID,
    data: PossessionAdminUpdate = Depends(parse_admin_update_form),
    photo_metadata: list[PossessionPhotoCreate] = Depends(parse_admin_photo_metadata),
    signed_document: UploadFile | None = File(default=None),
    new_photos: list[UploadFile] | None = File(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await PossessionService(db).admin_update(
        possession_id,
        data,
        current_user,
        signed_document=signed_document,
        new_photos=new_photos or [],
        new_photo_metadata=photo_metadata,
    )
