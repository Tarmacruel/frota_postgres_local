from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_writer
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.possession import PossessionCreate, PossessionOut, PossessionUpdate
from app.services.possession_service import PossessionService

router = APIRouter(prefix="/api/possession", tags=["Possession"])


def parse_possession_form(
    vehicle_id: UUID = Form(...),
    driver_name: str = Form(...),
    driver_document: str | None = Form(default=None),
    driver_contact: str | None = Form(default=None),
    start_date: datetime | None = Form(default=None),
    observation: str | None = Form(default=None),
    photo_captured_at: datetime = Form(...),
    capture_latitude: float = Form(...),
    capture_longitude: float = Form(...),
    capture_accuracy_meters: float = Form(...),
) -> PossessionCreate:
    try:
        return PossessionCreate(
            vehicle_id=vehicle_id,
            driver_name=driver_name,
            driver_document=driver_document,
            driver_contact=driver_contact,
            start_date=start_date,
            observation=observation,
            photo_captured_at=photo_captured_at,
            capture_latitude=capture_latitude,
            capture_longitude=capture_longitude,
            capture_accuracy_meters=capture_accuracy_meters,
        )
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


@router.get("", response_model=list[PossessionOut])
async def list_possession(
    vehicle_id: UUID | None = Query(default=None),
    active: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await PossessionService(db).list(vehicle_id=vehicle_id, active=active, current_user=current_user)


@router.get("/active", response_model=list[PossessionOut])
async def list_active_possession(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    return await PossessionService(db).list_active(current_user=current_user)


@router.post("", response_model=PossessionOut)
async def create_possession(
    data: PossessionCreate = Depends(parse_possession_form),
    photo: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await PossessionService(db).start(data, photo, current_user)


@router.get("/{possession_id}/photo")
async def get_possession_photo(
    possession_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(get_current_user),
) -> FileResponse:
    return await PossessionService(db).get_photo_file(possession_id)


@router.put("/{possession_id}/end", response_model=PossessionOut)
async def end_possession(
    possession_id: UUID,
    data: PossessionUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await PossessionService(db).end(possession_id, data, current_user)
