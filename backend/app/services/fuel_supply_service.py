from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.fuel_supply import FuelSupply
from app.models.user import User
from app.repositories.driver_repository import DriverRepository
from app.repositories.fuel_supply_repository import FuelSupplyRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.fuel_supply import FuelSupplyCreate
from app.services.audit_service import AuditService

MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024
RECEIPT_EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class FuelSupplyService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.supplies = FuelSupplyRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.master_data = MasterDataRepository(db)
        self.audit = AuditService(db)

    async def list(self, *, page: int, limit: int, **filters) -> PaginatedResponse[dict]:
        records, total = await self.supplies.list_paginated(page=page, limit=limit, **filters)
        return PaginatedResponse[dict](
            data=[self._serialize(item) for item in records],
            pagination=build_pagination(page, limit, total),
        )

    async def get(self, supply_id: UUID) -> dict:
        supply = await self.supplies.get_by_id(supply_id)
        if not supply:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Abastecimento nao encontrado")
        return self._serialize(supply)

    async def get_for_station(self, *, supply_id: UUID, fuel_station: str) -> dict:
        supply = await self.supplies.get_by_id(supply_id)
        if not supply:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Abastecimento nao encontrado")

        record_station = (supply.fuel_station or "").strip().lower()
        expected_station = fuel_station.strip().lower()
        if not expected_station or record_station != expected_station:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Abastecimento nao encontrado para o posto informado")
        return self._serialize(supply)

    async def create(self, data: FuelSupplyCreate, receipt: UploadFile, current_user: User) -> dict:
        vehicle = await self.vehicles.get_by_id(data.vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")

        if data.driver_id:
            driver = await self.drivers.get_by_id(data.driver_id)
            if not driver:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor nao encontrado")

        if data.organization_id:
            organization = await self.master_data.get_organization(data.organization_id)
            if not organization:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orgao nao encontrado")

        receipt_payload = await self._read_and_validate_receipt(receipt)
        supplied_at = data.supplied_at or datetime.now(timezone.utc)

        previous_supply = await self.supplies.get_latest_for_vehicle(data.vehicle_id, before_supply_at=supplied_at)
        consumption_km_l = None
        alerts: list[str] = []
        if previous_supply:
            km_delta = data.odometer_km - previous_supply.odometer_km
            if km_delta <= 0:
                alerts.append("Odometro menor ou igual ao ultimo abastecimento. Consumo nao pode ser calculado de forma confiavel.")
            else:
                consumption_km_l = km_delta / data.liters

        historical_avg = await self.supplies.get_vehicle_consumption_average(data.vehicle_id)
        is_anomaly, anomaly_details = self._detect_anomaly(consumption_km_l, historical_avg)
        if anomaly_details:
            alerts.append(anomaly_details)

        supply = FuelSupply(
            vehicle_id=data.vehicle_id,
            driver_id=data.driver_id,
            organization_id=data.organization_id,
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
            receipt_uploaded_at=datetime.now(timezone.utc),
        )

        stored_receipt_path: Path | None = None
        try:
            await self.supplies.create(supply)
            relative_receipt_path, stored_receipt_path = self._build_receipt_storage_paths(supply.id, receipt_payload["mime_type"])
            self._store_file(stored_receipt_path, receipt_payload["content"])
            supply.receipt_path = relative_receipt_path

            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="FUEL_SUPPLY",
                entity_id=supply.id,
                entity_label=f"{vehicle.plate} - {supplied_at.isoformat()}",
                details={
                    "vehicle_id": str(supply.vehicle_id),
                    "driver_id": str(supply.driver_id) if supply.driver_id else None,
                    "organization_id": str(supply.organization_id) if supply.organization_id else None,
                    "consumption_km_l": supply.consumption_km_l,
                    "is_consumption_anomaly": supply.is_consumption_anomaly,
                    "anomaly_details": supply.anomaly_details,
                    "alerts": alerts,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_receipt_path)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel registrar o abastecimento") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_receipt_path)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Nao foi possivel armazenar o comprovante") from exc

        response = await self.get(supply.id)
        response["alerts"] = alerts
        return response

    async def get_receipt_file(self, supply_id: UUID) -> FileResponse:
        supply = await self.supplies.get_by_id(supply_id)
        if not supply:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Abastecimento nao encontrado")
        absolute_path = self._resolve_receipt_path(supply.receipt_path)
        if not absolute_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Comprovante nao encontrado")

        return FileResponse(
            absolute_path,
            media_type=supply.receipt_mime_type or "application/octet-stream",
            filename=absolute_path.name,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "Content-Disposition": f'inline; filename="{absolute_path.name}"',
            },
        )

    async def consumption_report(self, start_date: datetime | None = None, end_date: datetime | None = None) -> list[dict]:
        return await self.supplies.list_consumption_report(start_date=start_date, end_date=end_date)

    async def anomalies_report(self, start_date: datetime | None = None, end_date: datetime | None = None) -> list[dict]:
        items = await self.supplies.list_anomalies(start_date=start_date, end_date=end_date)
        return [
            {
                "id": item.id,
                "vehicle_id": item.vehicle_id,
                "vehicle_plate": item.vehicle.plate if item.vehicle else "",
                "supplied_at": item.supplied_at,
                "consumption_km_l": item.consumption_km_l,
                "anomaly_details": item.anomaly_details,
            }
            for item in items
        ]

    async def _read_and_validate_receipt(self, receipt: UploadFile | None) -> dict:
        if receipt is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Comprovante e obrigatorio para registrar abastecimento")

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

    def _resolve_receipt_path(self, relative_path: str) -> Path:
        return Path(settings.STORAGE_DIR) / Path(relative_path)

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

    def _serialize(self, item: FuelSupply) -> dict:
        alerts: list[str] = []
        if item.anomaly_details:
            alerts.append(item.anomaly_details)
        return {
            "id": item.id,
            "vehicle_id": item.vehicle_id,
            "vehicle_plate": item.vehicle.plate if item.vehicle else "",
            "driver_id": item.driver_id,
            "driver_name": item.driver.nome_completo if item.driver else None,
            "organization_id": item.organization_id,
            "organization_name": item.organization.name if item.organization else None,
            "supplied_at": item.supplied_at,
            "odometer_km": item.odometer_km,
            "liters": item.liters,
            "total_amount": float(item.total_amount) if item.total_amount is not None else None,
            "fuel_station": item.fuel_station,
            "notes": item.notes,
            "consumption_km_l": item.consumption_km_l,
            "is_consumption_anomaly": item.is_consumption_anomaly,
            "anomaly_details": item.anomaly_details,
            "receipt_url": f"/api/fuel-supplies/{item.id}/receipt",
            "receipt_mime_type": item.receipt_mime_type,
            "receipt_size_bytes": item.receipt_size_bytes,
            "receipt_uploaded_at": item.receipt_uploaded_at,
            "alerts": alerts,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
