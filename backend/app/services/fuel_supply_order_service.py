from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.user import User
from app.repositories.driver_repository import DriverRepository
from app.repositories.fuel_supply_order_repository import FuelSupplyOrderRepository
from app.repositories.fuel_supply_repository import FuelSupplyRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.fuel_supply import FuelSupplyOrderCancel, FuelSupplyOrderConfirm, FuelSupplyOrderCreate
from app.services.audit_service import AuditService

MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024
RECEIPT_EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class FuelSupplyOrderService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.orders = FuelSupplyOrderRepository(db)
        self.supplies = FuelSupplyRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.master_data = MasterDataRepository(db)
        self.audit = AuditService(db)

    async def list(self, *, page: int, limit: int, **filters) -> PaginatedResponse[dict]:
        records, total = await self.orders.list_paginated(page=page, limit=limit, **filters)
        return PaginatedResponse[dict](
            data=[self._serialize_order(item) for item in records],
            pagination=build_pagination(page, limit, total),
        )

    async def create_order(self, data: FuelSupplyOrderCreate, current_user: User) -> dict:
        now = datetime.now(timezone.utc)
        if data.expires_at <= now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prazo da ordem deve ser no futuro")

        vehicle = await self.vehicles.get_by_id(data.vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

        if data.driver_id:
            driver = await self.drivers.get_by_id(data.driver_id)
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")

        if data.organization_id:
            organization = await self.master_data.get_organization(data.organization_id)
            if not organization:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão/posto não encontrado")

        order = FuelSupplyOrder(
            vehicle_id=data.vehicle_id,
            driver_id=data.driver_id,
            organization_id=data.organization_id,
            fuel_station_id=data.fuel_station_id,
            created_by_user_id=current_user.id,
            expires_at=data.expires_at,
            requested_liters=data.requested_liters,
            max_amount=data.max_amount,
            notes=data.notes,
            status=FuelSupplyOrderStatus.OPEN,
        )

        try:
            await self.orders.create(order)
            await self.audit.record(
                actor=current_user,
                action="ORDER_CREATED",
                entity_type="FUEL_SUPPLY_ORDER",
                entity_id=order.id,
                entity_label=f"{vehicle.plate} - {order.id}",
                details=self._serialize_order(order),
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível criar a ordem de abastecimento") from exc

        return await self.get_order(order.id)

    async def get_order(self, order_id: UUID) -> dict:
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")
        return self._serialize_order(order)

    async def confirm_order(self, order_id: UUID, data: FuelSupplyOrderConfirm, receipt: UploadFile, current_user: User) -> dict:
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")

        if order.status == FuelSupplyOrderStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem ja confirmada")
        if order.status == FuelSupplyOrderStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem cancelada")
        if order.status == FuelSupplyOrderStatus.EXPIRED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem expirada")
        if order.status != FuelSupplyOrderStatus.OPEN:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Apenas ordens abertas podem ser confirmadas")

        now = datetime.now(timezone.utc)
        if now > order.expires_at:
            order.status = FuelSupplyOrderStatus.EXPIRED
            await self.audit.record(
                actor=current_user,
                action="ORDER_EXPIRED",
                entity_type="FUEL_SUPPLY_ORDER",
                entity_id=order.id,
                entity_label=f"{order.vehicle.plate if order.vehicle else order.vehicle_id} - {order.id}",
                details={"expires_at": order.expires_at.isoformat()},
            )
            await self.db.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem expirada")

        user_station_id = getattr(current_user, "organization_id", None)
        if order.organization_id and user_station_id and user_station_id != order.organization_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário não pertence ao posto da ordem")

        if data.driver_id:
            driver = await self.drivers.get_by_id(data.driver_id)
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")

        receipt_payload = await self._read_and_validate_receipt(receipt)
        supplied_at = data.supplied_at or now

        previous_supply = await self.supplies.get_latest_for_vehicle(order.vehicle_id, before_supply_at=supplied_at)
        consumption_km_l = None
        alerts: list[str] = []
        if previous_supply:
            km_delta = data.odometer_km - previous_supply.odometer_km
            if km_delta <= 0:
                alerts.append("Odometro menor ou igual ao ultimo abastecimento. Consumo não pode ser calculado de forma confiavel.")
            else:
                consumption_km_l = km_delta / data.liters

        historical_avg = await self.supplies.get_vehicle_consumption_average(order.vehicle_id)
        is_anomaly, anomaly_details = self._detect_anomaly(consumption_km_l, historical_avg)
        if anomaly_details:
            alerts.append(anomaly_details)

        supply = FuelSupply(
            vehicle_id=order.vehicle_id,
            driver_id=data.driver_id or order.driver_id,
            organization_id=order.organization_id,
            supplied_at=supplied_at,
            odometer_km=data.odometer_km,
            liters=data.liters,
            total_amount=data.total_amount,
            fuel_station=data.fuel_station,
            notes=data.notes,
            consumption_km_l=consumption_km_l,
            is_consumption_anomaly=is_anomaly,
            anomaly_details=anomaly_details,
            receipt_path="",
            receipt_mime_type=receipt_payload["mime_type"],
            receipt_size_bytes=receipt_payload["size_bytes"],
            receipt_uploaded_at=now,
        )

        stored_receipt_path: Path | None = None
        try:
            await self.supplies.create(supply)
            relative_receipt_path, stored_receipt_path = self._build_receipt_storage_paths(supply.id, receipt_payload["mime_type"])
            self._store_file(stored_receipt_path, receipt_payload["content"])
            supply.receipt_path = relative_receipt_path

            order.status = FuelSupplyOrderStatus.COMPLETED
            order.confirmed_at = now
            order.confirmed_by_user_id = current_user.id
            if data.driver_id:
                order.driver_id = data.driver_id

            await self.audit.record(
                actor=current_user,
                action="ORDER_CONFIRMED",
                entity_type="FUEL_SUPPLY_ORDER",
                entity_id=order.id,
                entity_label=f"{order.vehicle.plate if order.vehicle else order.vehicle_id} - {order.id}",
                details={
                    "supply_id": str(supply.id),
                    "alerts": alerts,
                    "consumption_km_l": consumption_km_l,
                    "is_consumption_anomaly": is_anomaly,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_receipt_path)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível confirmar a ordem") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_receipt_path)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível armazenar o comprovante") from exc

        return await self.get_order(order.id)

    async def cancel_order(self, order_id: UUID, payload: FuelSupplyOrderCancel, current_user: User) -> dict:
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")
        if order.status == FuelSupplyOrderStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem ja confirmada")
        if order.status == FuelSupplyOrderStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem ja cancelada")
        if order.status == FuelSupplyOrderStatus.EXPIRED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem expirada")

        order.status = FuelSupplyOrderStatus.CANCELLED

        await self.audit.record(
            actor=current_user,
            action="ORDER_CANCELLED",
            entity_type="FUEL_SUPPLY_ORDER",
            entity_id=order.id,
            entity_label=f"{order.vehicle.plate if order.vehicle else order.vehicle_id} - {order.id}",
            details={"reason": payload.reason},
        )
        await self.db.commit()
        return await self.get_order(order.id)

    async def _read_and_validate_receipt(self, receipt: UploadFile | None) -> dict:
        if receipt is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comprovante e obrigatorio para confirmar ordem")

        mime_type = (receipt.content_type or "").lower()
        if mime_type not in RECEIPT_EXTENSIONS:
            await receipt.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comprovante deve ser PDF, JPG, PNG ou WEBP")

        content = await receipt.read()
        await receipt.close()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comprovante enviado esta vazio")
        if len(content) > MAX_RECEIPT_SIZE_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Comprovante excede o limite de 8 MB")

        return {
            "content": content,
            "mime_type": mime_type,
            "size_bytes": len(content),
        }

    def _build_receipt_storage_paths(self, supply_id: UUID, mime_type: str) -> tuple[str, Path]:
        extension = RECEIPT_EXTENSIONS[mime_type]
        relative_path = Path("fuel_receipts") / f"{supply_id}{extension}"
        absolute_path = Path(settings.STORAGE_DIR) / relative_path
        return relative_path.as_posix(), absolute_path

    def _store_file(self, absolute_path: Path, content: bytes) -> None:
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(content)

    def _cleanup_file(self, absolute_path: Path | None) -> None:
        if not absolute_path:
            return
        try:
            if absolute_path.exists():
                absolute_path.unlink()
        except OSError:
            return

    def _detect_anomaly(self, consumption_km_l: float | None, historical_average: float | None) -> tuple[bool, str | None]:
        if consumption_km_l is None or historical_average is None or historical_average <= 0:
            return False, None

        min_threshold = historical_average * 0.7
        max_threshold = historical_average * 1.4

        if consumption_km_l < min_threshold:
            return True, (
                f"Alerta: consumo {consumption_km_l:.2f} km/l esta mais de 30% abaixo "
                f"da media historica ({historical_average:.2f} km/l)."
            )
        if consumption_km_l > max_threshold:
            return True, (
                f"Alerta: consumo {consumption_km_l:.2f} km/l esta mais de 40% acima "
                f"da media historica ({historical_average:.2f} km/l)."
            )
        return False, None

    def _serialize_order(self, item: FuelSupplyOrder) -> dict:
        return {
            "id": item.id,
            "status": item.status,
            "vehicle_id": item.vehicle_id,
            "vehicle_plate": item.vehicle.plate if item.vehicle else "",
            "driver_id": item.driver_id,
            "organization_id": item.organization_id,
            "organization_name": item.organization.name if item.organization else None,
            "fuel_station_id": item.fuel_station_id,
            "created_by_user_id": item.created_by_user_id,
            "created_by_name": item.creator.name if item.creator else None,
            "confirmed_by_user_id": item.confirmed_by_user_id,
            "confirmed_by_name": item.confirmer.name if item.confirmer else None,
            "expires_at": item.expires_at,
            "requested_liters": float(item.requested_liters) if item.requested_liters is not None else None,
            "max_amount": float(item.max_amount) if item.max_amount is not None else None,
            "notes": item.notes,
            "confirmed_at": item.confirmed_at,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
