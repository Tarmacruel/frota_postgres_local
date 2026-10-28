from __future__ import annotations
from pydantic import TypeAdapter
from app.schemas.contract_item import ItemOrderLine

from app.repositories.interactive_kpis import IndicatorRequest, indicator_context

from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.fuel_supply_order import FuelSupplyOrderStatus
from app.models.user import User
from app.schemas.fuel_supply import (
    FuelSupplyOrderBatchCreate,
    FuelSupplyOrderBatchResponse,
    FuelSupplyOrderCancel,
    FuelSupplyOrderConfirm,
    FuelSupplyOrderCreate,
    FuelSupplyOrderDeadlineUpdate,
    FuelSupplyOrderListResponse,
    FuelSupplyOrderOut,
    FuelSupplyOrderPublicOut,
)
from app.services.fuel_supply_order_service import FuelSupplyOrderService
from app.schemas.contract_balance import FuelOrderFunding
from app.api.routes.contract_control import enabled

router = APIRouter(prefix="/api/fuel-supply-orders", tags=["FuelSupplyOrders"])
public_router = APIRouter(prefix="/api/public/fuel-supply-orders", tags=["PublicFuelSupplyOrders"])


def parse_confirm_form(
    item_lines: str | None = Form(default=None),
    supplied_at: datetime | None = Form(default=None),
    odometer_km: float = Form(...),
    liters: float = Form(...),
    total_amount: float = Form(...),
    fuel_type: str = Form(...),
    additive_type: str | None = Form(default=None),
    additive_quantity_liters: float | None = Form(default=None),
    fuel_station: str | None = Form(default=None),
    notes: str | None = Form(default=None),
) -> FuelSupplyOrderConfirm:
    try:
        return FuelSupplyOrderConfirm(
            item_lines=TypeAdapter(list[ItemOrderLine]).validate_json(item_lines) if isinstance(item_lines, str) and item_lines else None,
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


@router.post("", response_model=FuelSupplyOrderOut, status_code=status.HTTP_201_CREATED)
async def create_fuel_supply_order(
    data: FuelSupplyOrderCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "create")),
):
    return await FuelSupplyOrderService(db).create_order(data, current_user)


@router.post("/batch", response_model=FuelSupplyOrderBatchResponse, status_code=status.HTTP_201_CREATED)
async def create_fuel_supply_orders_batch(
    data: FuelSupplyOrderBatchCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "create")),
):
    return await FuelSupplyOrderService(db).create_batch(data, current_user)


@router.post('/{order_id}/funding', response_model=FuelSupplyOrderOut, dependencies=[Depends(enabled)])
async def fund_legacy_order(order_id: UUID, data: FuelOrderFunding, db: AsyncSession = Depends(get_db_session),
                            user: User = Depends(require_permission('fuel_supply_orders', 'edit'))):
    return await FuelSupplyOrderService(db).adopt_funding(order_id, data, user)


@router.get("", response_model=FuelSupplyOrderListResponse)
async def list_fuel_supply_orders(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    status_filter: FuelSupplyOrderStatus | None = Query(default=None, alias="status"),
    organization_id: UUID | None = Query(default=None),
    vehicle_id: UUID | None = Query(default=None),
    fuel_station_id: UUID | None = Query(default=None),
    due_until: datetime | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    search: str | None = Query(default=None),
    kpis: IndicatorRequest = Depends(indicator_context('fuel_orders')),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "view")),
):
    return kpis.attach(await FuelSupplyOrderService(db).list(
        page=page,
        limit=limit,
        current_user=current_user,
        status_filter=status_filter,
        organization_id=organization_id,
        vehicle_id=vehicle_id,
        fuel_station_id=fuel_station_id,
        due_until=due_until,
        created_from=created_from,
        created_to=created_to,
        search=search,
    ))


@router.get("/{order_id}", response_model=FuelSupplyOrderOut)
async def get_fuel_supply_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "view")),
):
    return await FuelSupplyOrderService(db).get_order(order_id, current_user=current_user)


@router.post("/{order_id}/confirm", response_model=FuelSupplyOrderOut)
async def confirm_fuel_supply_order(
    order_id: UUID,
    data: FuelSupplyOrderConfirm = Depends(parse_confirm_form),
    receipt: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "edit")),
):
    return await FuelSupplyOrderService(db).confirm_order(order_id, data, receipt, current_user)


@router.post("/{order_id}/cancel", response_model=FuelSupplyOrderOut)
async def cancel_fuel_supply_order(
    order_id: UUID,
    payload: FuelSupplyOrderCancel,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "edit")),
):
    return await FuelSupplyOrderService(db).cancel_order(order_id, payload, current_user)


@router.patch("/{order_id}/deadline", response_model=FuelSupplyOrderOut)
async def update_fuel_supply_order_deadline(
    order_id: UUID,
    payload: FuelSupplyOrderDeadlineUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("fuel_supply_orders", "edit")),
):
    return await FuelSupplyOrderService(db).update_deadline(order_id, payload, current_user)


@public_router.get("/{validation_code}", response_model=FuelSupplyOrderPublicOut)
async def get_public_fuel_supply_order(
    validation_code: str,
    db: AsyncSession = Depends(get_db_session),
):
    return await FuelSupplyOrderService(db).get_public_order(validation_code)
