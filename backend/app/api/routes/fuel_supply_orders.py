from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user, require_writer
from app.db.session import get_db_session
from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import User
from app.schemas.fuel_supply_order import (
    FuelSupplyOrderConfirmPayload,
    FuelSupplyOrderCreate,
    FuelSupplyOrderListResponse,
    FuelSupplyOrderOut,
)
from app.services.fuel_supply_order_service import FuelSupplyOrderService

router = APIRouter(prefix="/api/fuel-supply-orders", tags=["FuelSupplyOrders"])


@router.get("", response_model=FuelSupplyOrderListResponse, dependencies=[Depends(get_current_user)])
async def list_fuel_supply_orders(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    status_filter: FuelSupplyOrderStatus | None = Query(default=None, alias="status"),
    vehicle_id: UUID | None = Query(default=None),
    fuel_station_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
):
    return await FuelSupplyOrderService(db).list(
        page=page,
        limit=limit,
        status=status_filter,
        vehicle_id=vehicle_id,
        fuel_station_id=fuel_station_id,
    )


@router.post("", response_model=FuelSupplyOrderOut, status_code=status.HTTP_201_CREATED)
async def create_fuel_supply_order(
    payload: FuelSupplyOrderCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await FuelSupplyOrderService(db).create(payload, current_user)


@router.post("/{order_id}/confirm", response_model=FuelSupplyOrderOut)
async def confirm_fuel_supply_order(
    order_id: UUID,
    payload: FuelSupplyOrderConfirmPayload = Body(default_factory=FuelSupplyOrderConfirmPayload),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_writer),
):
    return await FuelSupplyOrderService(db).confirm(order_id=order_id, current_user=current_user, notes=payload.notes)
