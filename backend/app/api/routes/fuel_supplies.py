from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.fuel_supply import (
    FuelAnomalyReportItem,
    FuelConsumptionReportItem,
    FuelSupplyCreate,
    FuelSupplyListResponse,
    FuelSupplyOut,
    FuelSupplyRectify,
)
from app.services.fuel_supply_service import FuelSupplyService

router = APIRouter(prefix="/api/fuel-supplies", tags=["FuelSupplies"])


def parse_create_form(
    vehicle_id: UUID = Form(...),
    driver_id: UUID | None = Form(default=None),
    organization_id: UUID | None = Form(default=None),
    supplied_at: datetime | None = Form(default=None),
    fuel_station_id: UUID | None = Form(default=None),
    odometer_km: float = Form(...),
    liters: float = Form(...),
    total_amount: float = Form(...),
    fuel_type: str = Form(...),
    additive_type: str | None = Form(default=None),
    additive_quantity_liters: float | None = Form(default=None),
    fuel_station: str | None = Form(default=None),
    notes: str | None = Form(default=None),
) -> FuelSupplyCreate:
    try:
        return FuelSupplyCreate(
            vehicle_id=vehicle_id,
            driver_id=driver_id,
            organization_id=organization_id,
            fuel_station_id=fuel_station_id,
            supplied_at=supplied_at,
            odometer_km=odometer_km,
            liters=liters,
            total_amount=total_amount,
            fuel_type=fuel_type,
            additive_type=additive_type,
            additive_quantity_liters=additive_quantity_liters,
            fuel_station=fuel_station,
            notes=notes,
        )
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


@router.get("", response_model=FuelSupplyListResponse)
async def list_fuel_supplies(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    vehicle_id: UUID | None = Query(default=None),
    driver_id: UUID | None = Query(default=None),
    organization_id: UUID | None = Query(default=None),
    fuel_station_id: UUID | None = Query(default=None),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    only_anomalies: bool | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supplies", "view")),
):
    return await FuelSupplyService(db).list(
        page=page,
        limit=limit,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        organization_id=organization_id,
        fuel_station_id=fuel_station_id,
        start_date=start_date,
        end_date=end_date,
        only_anomalies=only_anomalies,
        current_user=current_user,
    )


@router.post("", response_model=FuelSupplyOut, status_code=status.HTTP_201_CREATED)
async def create_fuel_supply(
    data: FuelSupplyCreate = Depends(parse_create_form),
    receipt: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supplies", "create")),
):
    return await FuelSupplyService(db).create(data, receipt, current_user)


@router.get("/reports/consumption", response_model=list[FuelConsumptionReportItem])
async def consumption_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supplies", "view")),
):
    return await FuelSupplyService(db).consumption_report(start_date=start_date, end_date=end_date, current_user=current_user)


@router.get("/reports/anomalies", response_model=list[FuelAnomalyReportItem])
async def anomalies_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supplies", "view")),
):
    return await FuelSupplyService(db).anomalies_report(start_date=start_date, end_date=end_date, current_user=current_user)


@router.get("/{supply_id}", response_model=FuelSupplyOut)
async def get_fuel_supply(
    supply_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supplies", "view")),
):
    return await FuelSupplyService(db).get(supply_id, current_user=current_user)


@router.patch("/{supply_id}", response_model=FuelSupplyOut)
async def rectify_fuel_supply(
    supply_id: UUID,
    payload: FuelSupplyRectify,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supplies", "edit")),
):
    return await FuelSupplyService(db).rectify(supply_id, payload, current_user)


@router.get("/{supply_id}/receipt")
async def get_fuel_supply_receipt(
    supply_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supplies", "view")),
) -> FileResponse:
    return await FuelSupplyService(db).get_receipt_file(supply_id, current_user=current_user)

