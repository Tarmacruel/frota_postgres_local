from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from pathlib import Path
from uuid import UUID, uuid4, uuid5
from sqlalchemy import select, text
from fastapi import HTTPException, UploadFile, status
from sqlalchemy.exc import IntegrityError
from app.services.operational_scope import attribute_operation, ensure_record_visible
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.organization_scope import ensure_organization_access, production_scope_is_empty, scoped_organization_id
from app.core.config import settings
from app.core.vehicle_handoff import lock_vehicle_handoff, ensure_order_handoff_scope
from app.models.fuel_supply import FuelSupply
from app.models.fuel_supply_order import FuelSupplyOrder, FuelSupplyOrderStatus
from app.models.user import User, UserRole
from app.repositories.fuel_station_repository import FuelStationRepository
from app.repositories.fuel_supply_order_repository import FuelSupplyOrderRepository
from app.repositories.fuel_supply_repository import FuelSupplyRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.fuel_supply import (
    FuelSupplyOrderBatchCreate,
    FuelSupplyOrderCancel,
    FuelSupplyOrderConfirm,
    FuelSupplyOrderCreate,
    FuelSupplyOrderDeadlineUpdate,
)
from app.services.audit_service import AuditService
from app.services.contract_balance_service import ContractBalanceService, fuel_key, TZ, pricing_mode, NETWORK_VALUE, FIXED_PRICE
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
        if settings.CONTRACT_BALANCE_ENABLED:
            self._require_funding_payload(data)
            await self._lock_request(data.request_key)
        self._ensure_order_deadline(data.expires_at)
        await lock_vehicle_handoff(self.db, data.vehicle_id)
        if settings.CONTRACT_BALANCE_ENABLED:
            prior = await self.db.scalar(select(FuelSupplyOrder).where(FuelSupplyOrder.request_key == data.request_key))
            if prior:
                await self._ensure_order_visible_to_user(prior, current_user)
                if (prior.vehicle_id, prior.contract_id, prior.contract_provider_id, prior.fuel_station_id,
                        prior.requested_liters, prior.requested_fuel_type, prior.expires_at) != (
                        data.vehicle_id, data.contract_id, data.contract_provider_id, data.fuel_station_id,
                        Decimal(str(data.requested_liters)), fuel_key(data.requested_fuel_type), data.expires_at):
                    raise HTTPException(409, 'Esta identificação já foi usada em outro pedido')
                return await self.get_order(prior.id, current_user=current_user)
        vehicle = await self._get_visible_vehicle(data.vehicle_id, current_user)
        order_organization_id = await self._validate_order_context(
            organization_id=data.organization_id,
            fuel_station_id=data.fuel_station_id,
            current_user=current_user,
        )

        await ensure_order_handoff_scope(self.db, data.vehicle_id, order_organization_id)
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
            request_key=data.request_key if settings.CONTRACT_BALANCE_ENABLED else None,
        )

        try:
            await attribute_operation(self.db, order, current_user, new=True)
            await self.orders.create(order)
            if settings.CONTRACT_BALANCE_ENABLED:
                await self._fund_order(order, data, current_user)
            loaded_order = await self.orders.get_by_id(order.id)
            if not loaded_order:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Nao foi possivel carregar a ordem criada",
                )
            await self.audit.record(
                actor=current_user,
                action="ORDER_CREATED",
                entity_type="FUEL_SUPPLY_ORDER",
                entity_id=order.id,
                entity_label=f"{vehicle.plate} - {order.id}",
                details=self._serialize_order(loaded_order),
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível criar a ordem de abastecimento") from exc

        return await self.get_order(order.id, current_user=current_user)

    async def create_batch(self, data: FuelSupplyOrderBatchCreate, current_user: User) -> dict:
        if settings.CONTRACT_BALANCE_ENABLED:
            self._require_funding_payload(data, batch=True)
            await self._lock_request(data.request_key)
            prior = (await self.db.scalars(select(FuelSupplyOrder).where(FuelSupplyOrder.batch_request_key == data.request_key))).all()
            if prior:
                for row in prior:
                    await self._ensure_order_visible_to_user(row, current_user)
                actual = {(row.vehicle_id, row.requested_liters) for row in prior}
                expected = {(item.vehicle_id, Decimal(str(item.requested_liters))) for item in data.items}
                if actual != expected or any(row.contract_id != data.contract_id or row.contract_provider_id != data.contract_provider_id
                    or row.fuel_station_id != data.fuel_station_id or row.expires_at != data.expires_at
                    or row.requested_fuel_type != fuel_key(data.requested_fuel_type) for row in prior):
                    raise HTTPException(409, 'Esta identificação já foi usada em outro lote')
                return {'created_count': len(prior), 'orders': [await self.get_order(row.id, current_user=current_user) for row in prior]}
        self._ensure_batch_items_are_valid(data)
        self._ensure_order_deadline(data.expires_at)
        order_organization_id = await self._validate_order_context(
            organization_id=data.organization_id,
            fuel_station_id=data.fuel_station_id,
            current_user=current_user,
        )

        # Validate every vehicle before any order or audit record is persisted.
        # Stable lock order avoids deadlocks between batches and loan handoffs.
        for vehicle_id in sorted({item.vehicle_id for item in data.items}, key=str):
            await lock_vehicle_handoff(self.db, vehicle_id)
        validated_items = []
        for item in data.items:
            vehicle = await self._get_visible_vehicle(item.vehicle_id, current_user)
            await ensure_order_handoff_scope(self.db, item.vehicle_id, order_organization_id)
            validated_items.append((item, vehicle))

        created_orders: list[tuple[FuelSupplyOrder, object]] = []
        loaded_orders: list[tuple[FuelSupplyOrder, object]] = []
        try:
            for item, vehicle in validated_items:
                order = FuelSupplyOrder(
                    vehicle_id=item.vehicle_id,
                    organization_id=order_organization_id,
                    fuel_station_id=data.fuel_station_id,
                    validation_code=await self._generate_validation_code(),
                    created_by_user_id=current_user.id,
                    expires_at=data.expires_at,
                    requested_liters=item.requested_liters,
                    notes=data.notes,
                    status=FuelSupplyOrderStatus.OPEN,
                    request_key=uuid5(data.request_key, str(item.vehicle_id)) if settings.CONTRACT_BALANCE_ENABLED else None,
                    batch_request_key=data.request_key if settings.CONTRACT_BALANCE_ENABLED else None,
                )
                await attribute_operation(self.db, order, current_user, new=True)
                await self.orders.create(order)
                if settings.CONTRACT_BALANCE_ENABLED:
                    await self._fund_order(order, data, current_user)
                created_orders.append((order, vehicle))

            for order, vehicle in created_orders:
                loaded_order = await self.orders.get_by_id(order.id)
                if not loaded_order:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Nao foi possivel carregar a ordem criada",
                    )
                loaded_orders.append((loaded_order, vehicle))

            for loaded_order, vehicle in loaded_orders:
                await self.audit.record(
                    actor=current_user,
                    action="ORDER_CREATED",
                    entity_type="FUEL_SUPPLY_ORDER",
                    entity_id=loaded_order.id,
                    entity_label=f"{vehicle.plate} - {loaded_order.id}",
                    details=self._serialize_order(loaded_order),
                )

            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível criar as ordens de abastecimento") from exc
        except Exception:
            await self.db.rollback()
            raise

        return {
            "created_count": len(loaded_orders),
            "orders": [await self._serialize_order_with_signatures(order) for order, _vehicle in loaded_orders],
        }

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
        signature_summary = await DocumentSignatureService(self.db).get_summary_for_source(
            DigitalDocumentType.FUEL_SUPPLY_ORDER,
            order.id,
        )
        payload["signature_summary"] = DocumentSignatureService.sanitize_summary_for_legacy_public_view(
            signature_summary,
        )
        return payload

    async def confirm_order(self, order_id: UUID, data: FuelSupplyOrderConfirm, receipt: UploadFile, current_user: User) -> dict:
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")

        await self._ensure_order_visible_to_user(order, current_user)
        await attribute_operation(self.db, order, current_user)
        if settings.CONTRACT_BALANCE_ENABLED:
            await self._lock_funded_order(order)
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
            if settings.CONTRACT_BALANCE_ENABLED:
                await ContractBalanceService(self.db).release(order.contract_reservation_id, actor=current_user, reason='Ordem expirada')
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
        # The order preserves the estimate; the receipt records the fuel and amount actually supplied.
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
            fuel_supply_order_id=order.id,
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
            await attribute_operation(self.db, supply, current_user, new=True)
            if supply.organization_id != order.organization_id:
                raise HTTPException(409, 'A data do abastecimento pertence a outra secretaria')
            await self.supplies.create(supply)
            if settings.CONTRACT_BALANCE_ENABLED:
                supply.contract_id, supply.contract_provider_id = order.contract_id, order.contract_provider_id
                supply.contract_reservation_id = order.contract_reservation_id
                if order.contract_funding_mode == NETWORK_VALUE and not order.contract_reservation_id:
                    await ContractBalanceService(self.db).consume_unreserved(contract_id=order.contract_id,
                        provider_id=order.contract_provider_id, source_type='FUEL_SUPPLY', source_id=supply.id,
                        amount=supply.total_amount, occurred_at=supplied_at, actor=current_user,
                        vehicle_id=supply.vehicle_id, organization_id=supply.organization_id, station_id=order.fuel_station_id)
                else:
                    await ContractBalanceService(self.db).settle(order.contract_reservation_id,
                        source_type='FUEL_SUPPLY', source_id=supply.id, amount=supply.total_amount,
                        occurred_at=supplied_at, actor=current_user)
            relative_receipt_path, stored_receipt_path = self._build_receipt_storage_paths(supply.id, receipt_payload["mime_type"])
            self._store_file(stored_receipt_path, receipt_payload["content"])
            supply.receipt_path = relative_receipt_path

            order.status = FuelSupplyOrderStatus.COMPLETED
            order.supply = supply
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
                    "requested_fuel_type": order.requested_fuel_type,
                    "fuel_type_changed": bool(order.requested_fuel_type) and fuel_key(supply.fuel_type) != fuel_key(order.requested_fuel_type),
                    "requested_liters": float(order.requested_liters) if order.requested_liters is not None else None,
                    "liters": supply.liters,
                    "total_amount": float(supply.total_amount),
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
        await attribute_operation(self.db, order, current_user)
        if settings.CONTRACT_BALANCE_ENABLED and order.contract_id:
            await self._lock_funded_order(order)
        if order.status == FuelSupplyOrderStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem já confirmada")
        if order.status == FuelSupplyOrderStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem já cancelada")
        if order.status == FuelSupplyOrderStatus.EXPIRED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem expirada")
        if datetime.now(timezone.utc) > order.expires_at:
            order.status = FuelSupplyOrderStatus.EXPIRED
            if settings.CONTRACT_BALANCE_ENABLED:
                await ContractBalanceService(self.db).release(order.contract_reservation_id, actor=current_user, reason='Ordem expirada')
            await self.db.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem expirada")

        order.status = FuelSupplyOrderStatus.CANCELLED
        if settings.CONTRACT_BALANCE_ENABLED:
            await ContractBalanceService(self.db).release(order.contract_reservation_id, actor=current_user,
                                                          reason=payload.reason or 'Ordem cancelada')

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
            suggestion_context="order_cancel",
            suggestion_text=payload.reason,
        )
        await self.db.commit()
        return await self.get_order(order.id, current_user=current_user)

    async def update_deadline(
        self,
        order_id: UUID,
        payload: FuelSupplyOrderDeadlineUpdate,
        current_user: User,
    ) -> dict:
        self._ensure_operational_adjustment_role(current_user)
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento nao encontrada")
        await lock_vehicle_handoff(self.db, order.vehicle_id)
        await ensure_order_handoff_scope(self.db, order.vehicle_id, order.organization_id)
        await self._ensure_order_visible_to_user(order, current_user)
        await attribute_operation(self.db, order, current_user)
        if order.status == FuelSupplyOrderStatus.COMPLETED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem ja confirmada")
        if order.status == FuelSupplyOrderStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ordem cancelada")

        now = datetime.now(timezone.utc)
        if payload.expires_at <= now:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O novo prazo deve estar no futuro")

        was_expired = order.status == FuelSupplyOrderStatus.EXPIRED or order.expires_at <= now
        if settings.CONTRACT_BALANCE_ENABLED:
            await self._lock_funded_order(order)
            if order.status in {FuelSupplyOrderStatus.COMPLETED, FuelSupplyOrderStatus.CANCELLED}:
                raise HTTPException(409, 'A ordem foi concluída ou cancelada durante a consulta')
            was_expired = order.status == FuelSupplyOrderStatus.EXPIRED or order.expires_at <= now
            contract = await ContractBalanceService(self.db).contract(order.contract_id)
            if contract.status != 'ACTIVE' or not contract.valid_from or not contract.valid_until or not (contract.valid_from <= now.astimezone(TZ).date() <= contract.valid_until):
                raise HTTPException(409, 'Contrato inativo ou fora da vigência; regularize antes de prorrogar')
            if contract.valid_until and payload.expires_at.astimezone(TZ).date() > contract.valid_until:
                raise HTTPException(409, 'O novo prazo ultrapassa a vigência do contrato')
            if was_expired:
                await ContractBalanceService(self.db).release(order.contract_reservation_id, actor=current_user, reason='Reabertura de ordem expirada')
                await self._fund_order(order, SimpleNamespace(contract_id=order.contract_id,
                    contract_provider_id=order.contract_provider_id, requested_fuel_type=order.requested_fuel_type,
                    expected_price_id=None), current_user, require_price=False)
        if not was_expired and payload.expires_at <= order.expires_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="O novo prazo deve ser posterior ao prazo atual",
            )

        previous_status = order.status
        previous_expires_at = order.expires_at
        order.status = FuelSupplyOrderStatus.OPEN
        order.expires_at = payload.expires_at
        order.updated_at = now
        action = "ORDER_REOPENED" if was_expired else "ORDER_DEADLINE_EXTENDED"

        await self.audit.record(
            actor=current_user,
            action=action,
            entity_type="FUEL_SUPPLY_ORDER",
            entity_id=order.id,
            entity_label=f"{order.vehicle.plate if order.vehicle else order.vehicle_id} - {order.id}",
            details={
                "reason": payload.reason,
                "previous_status": previous_status.value,
                "new_status": FuelSupplyOrderStatus.OPEN.value,
                "previous_expires_at": previous_expires_at,
                "new_expires_at": payload.expires_at,
            },
            suggestion_context="order_reopen" if was_expired else "order_extend",
            suggestion_text=payload.reason,
        )
        await self.db.commit()
        return await self.get_order(order.id, current_user=current_user)

    async def _expire_overdue_orders(self) -> None:
        released = await ContractBalanceService(self.db).release_expired() if settings.CONTRACT_BALANCE_ENABLED else False
        expired = await self.orders.expire_overdue(reference_time=datetime.now(timezone.utc))
        if expired or released:
            await self.db.commit()

    @staticmethod
    def _require_funding_payload(data, *, batch=False):
        if not all((data.contract_id, data.contract_provider_id, data.requested_fuel_type, data.request_key)):
            raise HTTPException(422, 'Selecione contrato, prestador, combustível e confira a prévia financeira antes de emitir')
        quantities = [item.requested_liters for item in data.items] if batch else [data.requested_liters]
        if any(not quantity or quantity <= 0 for quantity in quantities):
            raise HTTPException(422, 'Informe os litros previstos de todos os veículos')

    async def _lock_request(self, key):
        if self.db.get_bind().dialect.name == 'postgresql':
            signed = (key.int & ((1 << 64)-1))-(1 << 63)
            await self.db.execute(text('SELECT pg_advisory_xact_lock(:request_key)'), {'request_key': signed})

    async def _fund_order(self, order, data, actor, *, require_price=True):
        service = ContractBalanceService(self.db)
        contract = await service.contract(data.contract_id, lock=True)
        mode = getattr(order, 'contract_funding_mode', None) or pricing_mode(contract)
        if contract.valid_until and order.expires_at.astimezone(TZ).date() > contract.valid_until:
            raise HTTPException(409, 'O prazo do pedido não pode ultrapassar a vigência do contrato')
        if mode == NETWORK_VALUE:
            quote = await service.quote(data.contract_id, data.contract_provider_id, data.requested_fuel_type,
                order.requested_liters, funding_mode=NETWORK_VALUE)
            await service.provider(data.contract_id, data.contract_provider_id, station_id=order.fuel_station_id)
            order.contract_id, order.contract_provider_id = data.contract_id, data.contract_provider_id
            order.contract_funding_mode = NETWORK_VALUE
            order.contract_reservation_id, order.max_amount = None, None
            order.requested_fuel_type = quote['fuel_type']
            await self.db.flush()
            return
        if require_price and not data.expected_price_id:
            raise HTTPException(422, 'Confira o preço e a prévia financeira antes de emitir pedido de preço fixo')
        reservation = await service.reserve(contract_id=data.contract_id, provider_id=data.contract_provider_id,
            source_type='FUEL_ORDER', source_id=order.id, vehicle_id=order.vehicle_id,
            organization_id=order.organization_id, actor=actor, fuel_type=data.requested_fuel_type,
            liters=order.requested_liters, expected_price_id=data.expected_price_id, station_id=order.fuel_station_id,
            funding_mode=mode)
        order.contract_id, order.contract_provider_id = data.contract_id, data.contract_provider_id
        order.contract_reservation_id, order.max_amount = reservation.id, reservation.amount
        order.requested_fuel_type = reservation.fuel_type
        order.contract_funding_mode = FIXED_PRICE
        await self.db.flush()

    async def _lock_funded_order(self, order):
        if not order.contract_id or not order.contract_provider_id or (not order.contract_reservation_id
                and getattr(order, 'contract_funding_mode', None) != NETWORK_VALUE):
            raise HTTPException(409, 'Pedido legado sem reserva. Vincule o contrato e confira o orçamento antes de utilizar.')
        await lock_vehicle_handoff(self.db, order.vehicle_id)
        await ContractBalanceService(self.db).contract(order.contract_id, lock=True)
        await self.db.refresh(order, attribute_names=['status', 'expires_at', 'confirmed_at', 'confirmed_by_user_id'], with_for_update=True)

    async def adopt_funding(self, order_id, data, actor):
        self._ensure_operational_adjustment_role(actor)
        order = await self.orders.get_by_id(order_id)
        if not order:
            raise HTTPException(404, 'Ordem não encontrada')
        await self._ensure_order_visible_to_user(order, actor)
        await lock_vehicle_handoff(self.db, order.vehicle_id)
        await self.db.refresh(order, attribute_names=['contract_id', 'contract_provider_id', 'contract_reservation_id',
            'contract_funding_mode', 'status', 'expires_at'], with_for_update=True)
        await attribute_operation(self.db, order, actor)
        if order.status in {FuelSupplyOrderStatus.COMPLETED, FuelSupplyOrderStatus.CANCELLED}:
            raise HTTPException(409, 'Somente pedidos abertos ou expirados podem receber reserva')
        if order.contract_reservation_id or (order.contract_id and order.contract_funding_mode == NETWORK_VALUE):
            if order.contract_id == data.contract_id and order.contract_provider_id == data.contract_provider_id:
                return await self.get_order(order.id, current_user=actor)
            raise HTTPException(409, 'Pedido já vinculado; cancele e emita outro para trocar de contrato')
        deadline = data.expires_at or order.expires_at
        self._ensure_order_deadline(deadline)
        if deadline != order.expires_at and not data.justification:
            raise HTTPException(422, 'Justifique a alteração do prazo da ordem')
        previous_deadline = order.expires_at
        order.expires_at, order.status = deadline, FuelSupplyOrderStatus.OPEN
        order.requested_liters = data.requested_liters
        await self._fund_order(order, data, actor)
        await self.audit.record(actor=actor, action='ORDER_FUNDED', entity_type='FUEL_SUPPLY_ORDER',
            entity_id=order.id, entity_label=str(order.id), details={'contract_id': str(order.contract_id),
                'previous_deadline': previous_deadline, 'new_deadline': deadline, 'reason': data.justification})
        await self.db.commit()
        return await self.get_order(order.id, current_user=actor)

    async def _ensure_order_visible_to_user(self, order: FuelSupplyOrder, current_user: User) -> None:
        await ensure_record_visible(self.db, order, current_user)

    def _ensure_operational_adjustment_role(self, current_user: User) -> None:
        if current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Ajuste de prazo restrito a administradores e operadores de producao",
            )

    def _ensure_order_deadline(self, expires_at: datetime) -> None:
        if expires_at.tzinfo is None or expires_at.utcoffset() is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prazo da ordem deve incluir o fuso horário")
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Prazo da ordem deve ser no futuro")

    def _ensure_batch_items_are_valid(self, data: FuelSupplyOrderBatchCreate) -> None:
        if len(data.items) < 2:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="O lote deve conter ao menos dois veículos",
            )

        vehicle_ids = [item.vehicle_id for item in data.items]
        if len(vehicle_ids) != len(set(vehicle_ids)):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Não é permitido repetir veículos no mesmo lote",
            )

    async def _get_visible_vehicle(self, vehicle_id: UUID, current_user: User) -> object:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
        await self._ensure_vehicle_visible_to_user(vehicle_id, current_user)
        return vehicle

    async def _validate_order_context(
        self,
        *,
        organization_id: UUID | None,
        fuel_station_id: UUID,
        current_user: User,
    ) -> UUID | None:
        order_organization_id = scoped_organization_id(current_user, organization_id)
        if organization_id:
            organization = await self.master_data.get_organization(organization_id)
            if not organization:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão/posto não encontrado")
            ensure_organization_access(current_user, organization_id)
        elif production_scope_is_empty(current_user):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão não encontrado")

        station = await self.fuel_stations.get(fuel_station_id)
        if not station:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posto não encontrado")
        if not station.active:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Posto selecionado está inativo")

        return order_organization_id

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
        supply = item.supply
        return {
            "id": item.id,
            "vehicle_loan_id": getattr(item, "vehicle_loan_id", None),
            "request_number": f"AB-{str(item.id).split('-')[0].upper()}",
            "validation_code": item.validation_code,
            "public_validation_path": self._build_public_validation_path(item.validation_code),
            "status": item.status,
            "vehicle_id": item.vehicle_id,
            "vehicle_plate": item.vehicle.plate if item.vehicle else "",
            "vehicle_type": getattr(item.vehicle, "vehicle_type", None),
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
            "supply_id": supply.id if supply else None,
            "supply_supplied_at": supply.supplied_at if supply else None,
            "supply_liters": float(supply.liters) if supply else None,
            "supply_total_amount": float(supply.total_amount) if supply and supply.total_amount is not None else None,
            "supply_fuel_type": supply.fuel_type if supply else None,
            "supply_odometer_km": supply.odometer_km if supply else None,
            "supply_receipt_url": f"/api/fuel-supplies/{supply.id}/receipt" if supply else None,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
            "signature_summary": None,
        }

    async def _serialize_order_with_signatures(self, item: FuelSupplyOrder) -> dict:
        payload = self._serialize_order(item)
        if settings.CONTRACT_BALANCE_ENABLED:
            payload.update(contract_id=item.contract_id, contract_provider_id=item.contract_provider_id,
                contract_reservation_id=item.contract_reservation_id, requested_fuel_type=item.requested_fuel_type,
                contract_funding_mode=item.contract_funding_mode,
                contract_funding=await ContractBalanceService(self.db).funding(item.contract_reservation_id, order=item))
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
