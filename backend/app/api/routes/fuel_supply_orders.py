from __future__ import annotations

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_admin, require_writer
from app.db.session import get_db_session
from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import User
from app.schemas.fuel_supply import (
    FuelSupplyOrderCancel,
    FuelSupplyOrderConfirm,
    FuelSupplyOrderCreate,
    FuelSupplyOrderListResponse,
    FuelSupplyOrderOut,
)
from app.services.fuel_supply_order_service import FuelSupplyOrderService

router = APIRouter(prefix="/api/fuel-supply-orders", tags=["FuelSupplyOrders"])


def parse_confirm_form(
    driver_id: UUID | None = Form(default=None),
    supplied_at: datetime | None = Form(default=None),
    odometer_km: float = Form(...),
    liters: float = Form(...),
    total_amount: float | None = Form(default=None),
    fuel_station: str | None = Form(default=None),
    notes: str | None = Form(default=None),
) -> FuelSupplyOrderConfirm:
    try:
        return FuelSupplyOrderConfirm(
            driver_id=driver_id,
            supplied_at=supplied_at,
            odometer_km=odometer_km,
            liters=liters,
            total_amount=total_amount,
            fuel_station=fuel_station,
            notes=notes,
        )
    except ValidationError as exc:
        raise RequestValidationError(exc.errors()) from exc


@router.post("", response_model=FuelSupplyOrderOut, status_code=status.HTTP_201_CREATED)
async def create_fuel_supply_order(
    data: FuelSupplyOrderCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await FuelSupplyOrderService(db).create_order(data, current_user)


@router.get("", response_model=FuelSupplyOrderListResponse, dependencies=[Depends(get_current_user)])
async def list_fuel_supply_orders(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    status_filter: FuelSupplyOrderStatus | None = Query(default=None, alias="status"),
    organization_id: UUID | None = Query(default=None, alias="posto_id"),
    vehicle_id: UUID | None = Query(default=None),
    due_until: datetime | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await FuelSupplyOrderService(db).list(
        page=page,
        limit=limit,
        status_filter=status_filter,
        organization_id=organization_id,
        vehicle_id=vehicle_id,
        due_until=due_until,
    )


@router.post("/{order_id}/confirm", response_model=FuelSupplyOrderOut)
async def confirm_fuel_supply_order(
    order_id: UUID,
    data: FuelSupplyOrderConfirm = Depends(parse_confirm_form),
    receipt: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await FuelSupplyOrderService(db).confirm_order(order_id, data, receipt, current_user)


@router.post("/{order_id}/cancel", response_model=FuelSupplyOrderOut)
async def cancel_fuel_supply_order(
    order_id: UUID,
    payload: FuelSupplyOrderCancel,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_admin),
):
    return await FuelSupplyOrderService(db).cancel_order(order_id, payload, current_user)
