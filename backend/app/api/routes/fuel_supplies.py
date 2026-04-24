from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_fuel_supply_confirmer
from app.db.session import get_db_session
from app.models.user import User, UserRole
from app.schemas.fuel_supply import (
    FuelAnomalyReportItem,
    FuelConsumptionReportItem,
    FuelSupplyCreate,
    FuelSupplyListResponse,
    FuelSupplyOut,
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
    total_amount: float | None = Form(default=None),
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
    current_user: User = Depends(get_current_user),
):
    fuel_station_filter = None
    if current_user.role == UserRole.POSTO:
        fuel_station_filter = current_user.name.strip()

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
        fuel_station=fuel_station_filter,
    )


@router.post("", response_model=FuelSupplyOut, status_code=status.HTTP_201_CREATED)
async def create_fuel_supply(
    data: FuelSupplyCreate = Depends(parse_create_form),
    receipt: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_fuel_supply_confirmer),
):
    if current_user.role == UserRole.POSTO:
        data = data.model_copy(update={"fuel_station": current_user.name.strip()})
    return await FuelSupplyService(db).create(data, receipt, current_user)


@router.get("/reports/consumption", response_model=list[FuelConsumptionReportItem])
async def consumption_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.POSTO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Perfil POSTO não possui acesso a relatorios")
    return await FuelSupplyService(db).consumption_report(start_date=start_date, end_date=end_date)


@router.get("/reports/anomalies", response_model=list[FuelAnomalyReportItem])
async def anomalies_report(
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.POSTO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Perfil POSTO não possui acesso a relatorios")
    return await FuelSupplyService(db).anomalies_report(start_date=start_date, end_date=end_date)


@router.get("/{supply_id}", response_model=FuelSupplyOut)
async def get_fuel_supply(
    supply_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.POSTO:
        return await FuelSupplyService(db).get_for_station(supply_id=supply_id, fuel_station=current_user.name.strip())
    return await FuelSupplyService(db).get(supply_id)


@router.get("/{supply_id}/receipt")
async def get_fuel_supply_receipt(
    supply_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    if current_user.role == UserRole.POSTO:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Perfil POSTO não possui acesso a comprovantes")
    return await FuelSupplyService(db).get_receipt_file(supply_id)

