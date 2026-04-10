from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.possession import VehiclePossession
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.repositories.possession_repository import PossessionRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.possession import PossessionCreate, PossessionUpdate
from app.services.audit_service import AuditService

MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024
PHOTO_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class PossessionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
        self.vehicles = VehicleRepository(db)
        self.audit = AuditService(db)

    async def list(self, vehicle_id: UUID | None = None, active: bool | None = None, current_user: User | None = None) -> list[dict]:
        records = await self.possessions.list(vehicle_id=vehicle_id, active=active)
        can_view_location = self._can_view_location(current_user)
        return [self._serialize(record, can_view_location=can_view_location) for record in records]

    async def list_active(self, current_user: User | None = None) -> list[dict]:
        return await self.list(active=True, current_user=current_user)

    async def get_current_driver(self, vehicle_id: UUID, current_user: User | None = None) -> dict:
        await self._ensure_vehicle_exists(vehicle_id)
        record = await self.possessions.get_active_by_vehicle(vehicle_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum condutor ativo encontrado para este veiculo")
        return self._serialize(record, can_view_location=self._can_view_location(current_user))

    async def start(self, data: PossessionCreate, photo: UploadFile, current_user: User) -> dict:
        vehicle = await self._ensure_vehicle_exists(data.vehicle_id)
        photo_content, photo_mime_type = await self._read_and_validate_photo(photo)

        effective_start = data.start_date or datetime.now(timezone.utc)
        current_active = await self.possessions.get_active_by_vehicle(data.vehicle_id)
        if current_active and effective_start < current_active.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nova posse nao pode iniciar antes da posse ativa atual",
            )

        possession = VehiclePossession(
            vehicle_id=data.vehicle_id,
            driver_name=data.driver_name,
            driver_document=data.driver_document,
            driver_contact=data.driver_contact,
            start_date=effective_start,
            observation=data.observation,
            photo_mime_type=photo_mime_type,
            photo_size_bytes=len(photo_content),
            photo_captured_at=data.photo_captured_at,
            capture_latitude=data.capture_latitude,
            capture_longitude=data.capture_longitude,
            capture_accuracy_meters=data.capture_accuracy_meters,
        )

        stored_absolute_path: Path | None = None
        try:
            await self.possessions.end_active_for_vehicle(data.vehicle_id, effective_start)
            await self.possessions.create(possession)

            relative_photo_path, stored_absolute_path = self._build_photo_storage_paths(possession.id, photo_mime_type)
            self._store_photo(stored_absolute_path, photo_content)
            possession.photo_path = relative_photo_path

            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"{vehicle.plate} - {possession.driver_name}",
                details={
                    "vehicle_id": str(possession.vehicle_id),
                    "driver_document": possession.driver_document,
                    "driver_contact": possession.driver_contact,
                    "start_date": possession.start_date.isoformat(),
                    "observation": possession.observation,
                    "evidence_photo_attached": True,
                    "photo_mime_type": possession.photo_mime_type,
                    "photo_size_bytes": possession.photo_size_bytes,
                    "photo_captured_at": possession.photo_captured_at.isoformat() if possession.photo_captured_at else None,
                    "capture_accuracy_meters": possession.capture_accuracy_meters,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_photo_file(stored_absolute_path)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel iniciar a posse") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_photo_file(stored_absolute_path)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Nao foi possivel armazenar a foto da posse",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_photo_file(stored_absolute_path)
            raise

        return await self._get_by_id(possession.id, current_user)

    async def end(self, possession_id: UUID, data: PossessionUpdate, current_user: User) -> dict:
        possession = await self.possessions.get_by_id(possession_id)
        if not possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")
        if possession.end_date is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registro de posse ja encerrado")

        payload = data.model_dump(exclude_unset=True)
        effective_end = payload.get("end_date") or datetime.now(timezone.utc)
        if effective_end < possession.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final nao pode ser anterior ao inicio da posse")

        possession.end_date = effective_end
        if "observation" in payload:
            possession.observation = payload["observation"]

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"{possession.vehicle.plate if possession.vehicle else possession.vehicle_id} - {possession.driver_name}",
                details={
                    "event": "END_POSSESSION",
                    "end_date": possession.end_date.isoformat() if possession.end_date else None,
                    "observation": possession.observation,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel encerrar a posse") from exc

        return await self._get_by_id(possession.id, current_user)

    async def get_photo_file(self, possession_id: UUID) -> FileResponse:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")
        if not record.photo_path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma foto encontrada para esta posse")

        absolute_photo_path = self._resolve_photo_path(record.photo_path)
        if not absolute_photo_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo da foto nao encontrado")

        return FileResponse(
            absolute_photo_path,
            media_type=record.photo_mime_type or "application/octet-stream",
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "Content-Disposition": "inline",
            },
        )

    async def _get_by_id(self, possession_id: UUID, current_user: User | None = None) -> dict:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")
        return self._serialize(record, can_view_location=self._can_view_location(current_user))

    async def _ensure_vehicle_exists(self, vehicle_id: UUID) -> Vehicle:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")
        return vehicle

    async def _read_and_validate_photo(self, photo: UploadFile) -> tuple[bytes, str]:
        photo_mime_type = (photo.content_type or "").lower()
        if photo_mime_type not in PHOTO_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Foto da posse deve estar em JPG, PNG ou WEBP",
            )

        content = await photo.read()
        await photo.close()

        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Foto da posse e obrigatoria")
        if len(content) > MAX_PHOTO_SIZE_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Foto da posse excede o limite de 8 MB")

        return content, photo_mime_type

    def _build_photo_storage_paths(self, possession_id: UUID, photo_mime_type: str) -> tuple[str, Path]:
        extension = PHOTO_EXTENSIONS[photo_mime_type]
        relative_path = Path("possession_photos") / f"{possession_id}{extension}"
        absolute_path = Path(settings.STORAGE_DIR) / relative_path
        return relative_path.as_posix(), absolute_path

    def _store_photo(self, absolute_photo_path: Path, content: bytes) -> None:
        absolute_photo_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_photo_path.write_bytes(content)

    def _resolve_photo_path(self, relative_photo_path: str) -> Path:
        return Path(settings.STORAGE_DIR) / Path(relative_photo_path)

    def _cleanup_photo_file(self, absolute_photo_path: Path | None) -> None:
        if not absolute_photo_path:
            return
        try:
            if absolute_photo_path.exists():
                absolute_photo_path.unlink()
        except OSError:
            return

    def _serialize(self, record: VehiclePossession, *, can_view_location: bool) -> dict:
        capture_location = None
        if (
            can_view_location
            and record.capture_latitude is not None
            and record.capture_longitude is not None
            and record.capture_accuracy_meters is not None
        ):
            latitude = float(record.capture_latitude)
            longitude = float(record.capture_longitude)
            accuracy = float(record.capture_accuracy_meters)
            capture_location = {
                "latitude": latitude,
                "longitude": longitude,
                "accuracy_meters": accuracy,
                "maps_url": self._build_maps_url(latitude, longitude),
            }

        return {
            "id": record.id,
            "vehicle_id": record.vehicle_id,
            "vehicle_plate": record.vehicle.plate if record.vehicle else "",
            "driver_name": record.driver_name,
            "driver_document": record.driver_document,
            "driver_contact": record.driver_contact,
            "start_date": record.start_date,
            "end_date": record.end_date,
            "observation": record.observation,
            "created_at": record.created_at,
            "is_active": record.is_active,
            "photo_available": bool(record.photo_path),
            "photo_url": f"/api/possession/{record.id}/photo" if record.photo_path else None,
            "photo_captured_at": record.photo_captured_at,
            "capture_location": capture_location,
        }

    def _build_maps_url(self, latitude: float, longitude: float) -> str:
        return f"https://www.openstreetmap.org/?mlat={latitude:.6f}&mlon={longitude:.6f}#map=18/{latitude:.6f}/{longitude:.6f}"

    def _can_view_location(self, current_user: User | None) -> bool:
        return bool(current_user and current_user.role == UserRole.ADMIN)
