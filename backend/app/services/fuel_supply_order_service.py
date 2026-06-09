from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.organization_scope import ensure_organization_access, production_scope_is_empty, scoped_organization_id
from app.core.config import settings
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.user import User, UserRole
from app.repositories.fuel_station_repository import FuelStationRepository
from app.repositories.fuel_supply_order_repository import FuelSupplyOrderRepository
from app.repositories.fuel_supply_repository import FuelSupplyRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.fuel_supply import FuelSupplyOrderCancel, FuelSupplyOrderConfirm, FuelSupplyOrderCreate
from app.services.audit_service import AuditService
from app.services.document_signature_service import DocumentSignatureService, SOURCE_FUEL_SUPPLY_ORDER
from app.models.document_signature import DigitalDocumentType

MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024
RECEIPT_EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
PUBLIC_VALIDATION_PATH_PREFIX = "/validar/ordem-abastecimento"


class FuelSupplyOrderService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.orders = FuelSupplyOrderRepository(db)
        self.supplies = FuelSupplyRepository(db)
        self.fuel_stations = FuelStationRepository(db)
        self.vehicles = VehicleRepository(db)
        self.master_data = MasterDataRepository(db)
        self.audit = AuditService(db)

    async def list(self, *, page: int, limit: int, current_user: User, **filters) -> PaginatedResponse[dict]:
        await self._expire_overdue_orders()

        scoped_filters = dict(filters)
        if production_scope_is_empty(current_user):
            return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

        scoped_filters["organization_id"] = scoped_organization_id(current_user, scoped_filters.get("organization_id"))
        if current_user.role == UserRole.POSTO:
            station_ids = await self.fuel_stations.list_active_station_ids_for_user(current_user.id)
            if not station_ids:
                return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

            requested_station_id = scoped_filters.get("fuel_station_id")
            if requested_station_id and requested_station_id not in station_ids:
                return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

            scoped_filters["fuel_station_ids"] = station_ids

        records, total = await self.orders.list_paginated(page=page, limit=limit, **scoped_filters)
        return PaginatedResponse[dict](
            data=[await self._serialize_order_with_signatures(item) for item in records],
            pagination=build_pagination(page, limit, total),
        )

    async def create_order(self, data: FuelSupplyOrderCreate, current_user: User) -> dict:
        now = datetime.now(timezone.utc)
        if data.expires_at <= now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prazo da ordem deve ser no futuro")

        vehicle = await self.vehicles.get_by_id(data.vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

        await self._ensure_vehicle_visible_to_user(data.vehicle_id, current_user)
        order_organization_id = scoped_organization_id(current_user, data.organization_id)
        if data.organization_id:
            organization = await self.master_data.get_organization(data.organization_id)
            if not organization:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão/posto não encontrado")

        if data.organization_id:
            ensure_organization_access(current_user, data.organization_id)
        elif production_scope_is_empty(current_user):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão não encontrado")

        station = await self.fuel_stations.get(data.fuel_station_id)
        if not station:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posto não encontrado")
        if not station.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Posto selecionado está inativo")

        order = FuelSupplyOrder(
            vehicle_id=data.vehicle_id,
            organization_id=order_organization_id,
            fuel_station_id=data.fuel_station_id,
            validation_code=await self._generate_validation_code(),
            created_by_user_id=current_user.id,
            expires_at=data.expires_at,
            requested_liters=data.requested_liters,
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

        return await self.get_order(order.id, current_user=current_user)

    async def get_order(self, order_id: UUID, *, current_user: User | None = None) -> dict:
        await self._expire_overdue_orders()
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")
        if current_user and current_user.role == UserRole.POSTO:
            await self._ensure_station_access(current_user=current_user, order=order)
        if current_user:
            await self._ensure_order_visible_to_user(order, current_user)
        return await self._serialize_order_with_signatures(order)

    async def get_public_order(self, validation_code: str) -> dict:
        await self._expire_overdue_orders()
        normalized_code = (validation_code or "").strip().upper()
        if not normalized_code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comprovante público não encontrado")

        order = await self.orders.get_by_validation_code(normalized_code)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comprovante público não encontrado")
        payload = self._serialize_public_order(order)
        payload["signature_summary"] = await DocumentSignatureService(self.db).get_summary_for_source(
            DigitalDocumentType.FUEL_SUPPLY_ORDER,
            order.id,
        )
        return payload

    async def confirm_order(self, order_id: UUID, data: FuelSupplyOrderConfirm, receipt: UploadFile, current_user: User) -> dict:
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")

        await self._ensure_order_visible_to_user(order, current_user)
        if order.status == FuelSupplyOrderStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem já confirmada")
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

        if not order.fuel_station_id:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem sem posto vinculado")

        station = await self.fuel_stations.get(order.fuel_station_id)
        if not station:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posto não encontrado para a ordem")
        if not station.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Posto vinculado a ordem está inativo")

        if current_user.role == UserRole.POSTO:
            await self._ensure_station_access(current_user=current_user, order=order)

        receipt_payload = await self._read_and_validate_receipt(receipt)
        supplied_at = data.supplied_at or now

        previous_supply = await self.supplies.get_latest_for_vehicle(order.vehicle_id, before_supply_at=supplied_at)
        consumption_km_l = None
        alerts: list[str] = []
        if previous_supply:
            km_delta = data.odometer_km - previous_supply.odometer_km
            if km_delta <= 0:
                alerts.append("Odômetro menor ou igual ao último abastecimento. Consumo não pode ser calculado de forma confiável.")
            else:
                consumption_km_l = km_delta / data.liters

        historical_avg = await self.supplies.get_vehicle_consumption_average(order.vehicle_id)
        is_anomaly, anomaly_details = self._detect_anomaly(consumption_km_l, historical_avg)
        if anomaly_details:
            alerts.append(anomaly_details)

        supply = FuelSupply(
            vehicle_id=order.vehicle_id,
            driver_id=order.driver_id,
            organization_id=order.organization_id,
            supplied_at=supplied_at,
            odometer_km=data.odometer_km,
            liters=data.liters,
            total_amount=data.total_amount,
            fuel_type=data.fuel_type,
            additive_type=data.additive_type,
            additive_quantity_liters=data.additive_quantity_liters,
            fuel_station_id=station.id,
            fuel_station=station.name,
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

            await DocumentSignatureService(self.db).mark_source_documents_superseded(
                source_type=SOURCE_FUEL_SUPPLY_ORDER,
                source_id=order.id,
                document_types=[DigitalDocumentType.FUEL_SUPPLY_ORDER],
                current_user=current_user,
                reason="FUEL_ORDER_CONFIRMED",
            )

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
                    "fuel_type": supply.fuel_type,
                    "additive_type": supply.additive_type,
                    "additive_quantity_liters": supply.additive_quantity_liters,
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

        return await self.get_order(order.id, current_user=current_user)

    async def cancel_order(self, order_id: UUID, payload: FuelSupplyOrderCancel, current_user: User) -> dict:
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")
        await self._ensure_order_visible_to_user(order, current_user)
        if order.status == FuelSupplyOrderStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem já confirmada")
        if order.status == FuelSupplyOrderStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem já cancelada")
        if order.status == FuelSupplyOrderStatus.EXPIRED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem expirada")
        if datetime.now(timezone.utc) > order.expires_at:
            order.status = FuelSupplyOrderStatus.EXPIRED
            await self.db.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem expirada")

        order.status = FuelSupplyOrderStatus.CANCELLED

        await DocumentSignatureService(self.db).mark_source_documents_superseded(
            source_type=SOURCE_FUEL_SUPPLY_ORDER,
            source_id=order.id,
            document_types=[DigitalDocumentType.FUEL_SUPPLY_ORDER],
            current_user=current_user,
            reason="FUEL_ORDER_CANCELLED",
        )

        await self.audit.record(
            actor=current_user,
            action="ORDER_CANCELLED",
            entity_type="FUEL_SUPPLY_ORDER",
            entity_id=order.id,
            entity_label=f"{order.vehicle.plate if order.vehicle else order.vehicle_id} - {order.id}",
            details={"reason": payload.reason},
        )
        await self.db.commit()
        return await self.get_order(order.id, current_user=current_user)

    async def _expire_overdue_orders(self) -> None:
        expired = await self.orders.expire_overdue(reference_time=datetime.now(timezone.utc))
        if expired:
            await self.db.commit()

    async def _ensure_order_visible_to_user(self, order: FuelSupplyOrder, current_user: User) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")
            return
        if order.organization_id == organization_id:
            return
        await self._ensure_vehicle_visible_to_user(order.vehicle_id, current_user)

    async def _ensure_vehicle_visible_to_user(self, vehicle_id: UUID, current_user: User | None) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
            return
        if not await self.vehicles.is_vehicle_in_organization(vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

    async def _ensure_station_access(self, *, current_user: User, order: FuelSupplyOrder) -> None:
        if not order.fuel_station_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ordem sem posto vinculado")

        has_access = await self.fuel_stations.has_active_user_link(
            user_id=current_user.id,
            fuel_station_id=order.fuel_station_id,
        )
        if not has_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário não possui vínculo ativo com o posto da ordem")

    async def _generate_validation_code(self) -> str:
        for _ in range(8):
            candidate = f"OA-{uuid4().hex[:12].upper()}"
            if not await self.orders.get_by_validation_code(candidate):
                return candidate
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível gerar o código público da ordem",
        )

    async def _read_and_validate_receipt(self, receipt: UploadFile | None) -> dict:
        if receipt is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comprovante é obrigatório para confirmar ordem")

        mime_type = (receipt.content_type or "").lower()
        if mime_type not in RECEIPT_EXTENSIONS:
            await receipt.close()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comprovante deve ser PDF, JPG, PNG ou WEBP")

        content = await receipt.read()
        await receipt.close()
        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comprovante enviado está vazio")
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
                f"Alerta: consumo {consumption_km_l:.2f} km/l está mais de 30% abaixo "
                f"da média histórica ({historical_average:.2f} km/l)."
            )
        if consumption_km_l > max_threshold:
            return True, (
                f"Alerta: consumo {consumption_km_l:.2f} km/l está mais de 40% acima "
                f"da média histórica ({historical_average:.2f} km/l)."
            )
        return False, None

    def _build_public_validation_path(self, validation_code: str) -> str:
        return f"{PUBLIC_VALIDATION_PATH_PREFIX}/{validation_code}"

    def _build_maps_url(self, latitude: float | None, longitude: float | None) -> str | None:
        if latitude is None or longitude is None:
            return None
        return f"https://www.openstreetmap.org/?mlat={latitude:.6f}&mlon={longitude:.6f}#map=18/{latitude:.6f}/{longitude:.6f}"

    def _build_vehicle_description(self, item: FuelSupplyOrder) -> str | None:
        if not item.vehicle:
            return None

        description_parts = [item.vehicle.plate]
        vehicle_name = " ".join(filter(None, [item.vehicle.brand, item.vehicle.model])).strip()
        if vehicle_name:
            description_parts.append(vehicle_name)

        return " - ".join(description_parts)

    def _serialize_order(self, item: FuelSupplyOrder) -> dict:
        return {
            "id": item.id,
            "request_number": f"AB-{str(item.id).split('-')[0].upper()}",
            "validation_code": item.validation_code,
            "public_validation_path": self._build_public_validation_path(item.validation_code),
            "status": item.status,
            "vehicle_id": item.vehicle_id,
            "vehicle_plate": item.vehicle.plate if item.vehicle else "",
            "vehicle_description": self._build_vehicle_description(item),
            "driver_id": item.driver_id,
            "driver_name": item.driver.nome_completo if item.driver else None,
            "driver_contact": item.driver.contato if item.driver else None,
            "organization_id": item.organization_id,
            "organization_name": item.organization.name if item.organization else None,
            "fuel_station_id": item.fuel_station_id,
            "fuel_station_name": item.fuel_station_ref.name if item.fuel_station_ref else None,
            "fuel_station_cnpj": item.fuel_station_ref.cnpj if item.fuel_station_ref else None,
            "fuel_station_address": item.fuel_station_ref.address if item.fuel_station_ref else None,
            "fuel_station_phone": item.fuel_station_ref.phone if item.fuel_station_ref else None,
            "fuel_station_latitude": item.fuel_station_ref.latitude if item.fuel_station_ref else None,
            "fuel_station_longitude": item.fuel_station_ref.longitude if item.fuel_station_ref else None,
            "fuel_station_maps_url": self._build_maps_url(
                item.fuel_station_ref.latitude if item.fuel_station_ref else None,
                item.fuel_station_ref.longitude if item.fuel_station_ref else None,
            ),
            "created_by_user_id": item.created_by_user_id,
            "created_by_name": item.creator.name if item.creator else None,
            "created_by_contact": item.requester_contact,
            "confirmed_by_user_id": item.confirmed_by_user_id,
            "confirmed_by_name": item.confirmer.name if item.confirmer else None,
            "expires_at": item.expires_at,
            "requested_liters": float(item.requested_liters) if item.requested_liters is not None else None,
            "max_amount": float(item.max_amount) if item.max_amount is not None else None,
            "notes": item.notes,
            "confirmed_at": item.confirmed_at,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
            "signature_summary": None,
        }

    async def _serialize_order_with_signatures(self, item: FuelSupplyOrder) -> dict:
        payload = self._serialize_order(item)
        payload["signature_summary"] = await DocumentSignatureService(self.db).get_summary_for_source(
            DigitalDocumentType.FUEL_SUPPLY_ORDER,
            item.id,
        )
        return payload

    def _serialize_public_order(self, item: FuelSupplyOrder) -> dict:
        serialized = self._serialize_order(item)
        return {
            "request_number": serialized["request_number"],
            "validation_code": serialized["validation_code"],
            "public_validation_path": serialized["public_validation_path"],
            "status": serialized["status"],
            "vehicle_plate": serialized["vehicle_plate"],
            "vehicle_description": serialized["vehicle_description"],
            "organization_name": serialized["organization_name"],
            "fuel_station_name": serialized["fuel_station_name"],
            "fuel_station_cnpj": serialized["fuel_station_cnpj"],
            "fuel_station_address": serialized["fuel_station_address"],
            "fuel_station_phone": serialized["fuel_station_phone"],
            "fuel_station_latitude": serialized["fuel_station_latitude"],
            "fuel_station_longitude": serialized["fuel_station_longitude"],
            "fuel_station_maps_url": serialized["fuel_station_maps_url"],
            "created_by_name": serialized["created_by_name"],
            "confirmed_by_name": serialized["confirmed_by_name"],
            "requested_liters": serialized["requested_liters"],
            "notes": serialized["notes"],
            "created_at": serialized["created_at"],
            "expires_at": serialized["expires_at"],
            "confirmed_at": serialized["confirmed_at"],
        }
