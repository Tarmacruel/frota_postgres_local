from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from re import sub
from uuid import UUID
from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.models.possession import VehiclePossession
from app.models.possession_photo import VehiclePossessionPhoto
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.repositories.driver_repository import DriverRepository
from app.repositories.possession_repository import PossessionRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.possession import PossessionAdminUpdate, PossessionCreate, PossessionPhotoCreate, PossessionUpdate
from app.services.admin_notification_service import AdminNotificationService
from app.services.audit_service import AuditService

MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024
MAX_DOCUMENT_SIZE_BYTES = 12 * 1024 * 1024
PHOTO_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
DOCUMENT_EXTENSIONS = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
INLINE_DOCUMENT_MIME_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}


class PossessionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.audit = AuditService(db)
        self.admin_notifications = AdminNotificationService(db)

    async def list(self, vehicle_id: UUID | None = None, active: bool | None = None, current_user: User | None = None) -> list[dict]:
        records = await self.possessions.list(vehicle_id=vehicle_id, active=active)
        can_view_location = self._can_view_location(current_user)
        return [self._serialize(record, can_view_location=can_view_location) for record in records]

    async def list_paginated(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        active: bool | None = None,
        driver_id: UUID | None = None,
        search: str | None = None,
        current_user: User | None = None,
    ) -> PaginatedResponse[dict]:
        records, total = await self.possessions.list_paginated(
            page=page,
            limit=limit,
            vehicle_id=vehicle_id,
            active=active,
            driver_id=driver_id,
            search=search,
        )
        can_view_location = self._can_view_location(current_user)
        return PaginatedResponse[dict](
            data=[self._serialize(record, can_view_location=can_view_location) for record in records],
            pagination=build_pagination(page, limit, total),
        )

    async def list_active(self, current_user: User | None = None) -> list[dict]:
        return await self.list(active=True, current_user=current_user)

    async def get_current_driver(self, vehicle_id: UUID, current_user: User | None = None) -> dict:
        await self._ensure_vehicle_exists(vehicle_id)
        record = await self.possessions.get_active_by_vehicle(vehicle_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum condutor ativo encontrado para este veiculo")
        return self._serialize(record, can_view_location=self._can_view_location(current_user))

    async def start(
        self,
        data: PossessionCreate,
        *,
        photos: list[UploadFile],
        photo_metadata: list[PossessionPhotoCreate],
        signed_document: UploadFile | None,
        current_user: User,
    ) -> dict:
        vehicle = await self._ensure_vehicle_exists(data.vehicle_id)
        selected_driver = await self._resolve_driver_snapshot(
            driver_id=data.driver_id,
            fallback_name=data.driver_name,
            fallback_document=data.driver_document,
            fallback_contact=data.driver_contact,
        )
        photo_payloads = await self._read_and_validate_captured_photos(photos, photo_metadata, require_at_least_one=False)
        document_payload = await self._read_and_validate_document(signed_document)

        effective_start = data.start_date or datetime.now(timezone.utc)
        current_active = await self.possessions.get_active_by_vehicle(data.vehicle_id)
        if current_active and effective_start < current_active.start_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nova posse nao pode iniciar antes da posse ativa atual",
            )

        auto_close_end_odometer = data.start_odometer_km
        pending_admin_notification_payload: dict | None = None
        if current_active and data.start_odometer_km is not None:
            if current_active.end_odometer_km is None:
                auto_close_end_odometer = data.start_odometer_km
            else:
                auto_close_end_odometer = current_active.end_odometer_km
                gap_km = round(float(data.start_odometer_km - current_active.end_odometer_km), 2)
                if abs(gap_km) > 0:
                    pending_admin_notification_payload = {
                        "vehicle_id": str(data.vehicle_id),
                        "previous_possession_id": str(current_active.id),
                        "previous_end_odometer_km": current_active.end_odometer_km,
                        "new_start_odometer_km": data.start_odometer_km,
                        "gap_km": gap_km,
                        "auto_closed_at": effective_start.isoformat(),
                    }

        possession = VehiclePossession(
            vehicle_id=data.vehicle_id,
            driver_id=selected_driver["driver_id"],
            driver_name=selected_driver["driver_name"],
            driver_document=selected_driver["driver_document"],
            driver_contact=selected_driver["driver_contact"],
            start_date=effective_start,
            observation=data.observation,
            start_odometer_km=data.start_odometer_km,
            document_name=document_payload["filename"] if document_payload else None,
            document_mime_type=document_payload["mime_type"] if document_payload else None,
            document_size_bytes=document_payload["size_bytes"] if document_payload else None,
            document_uploaded_at=datetime.now(timezone.utc) if document_payload else None,
        )

        stored_document_path: Path | None = None
        stored_photo_paths: list[Path] = []
        try:
            await self.possessions.end_active_for_vehicle(
                data.vehicle_id,
                effective_start,
                end_odometer_km=auto_close_end_odometer,
            )
            await self.possessions.create(possession)

            if document_payload:
                relative_document_path, stored_document_path = self._build_document_storage_paths(
                    possession.id,
                    document_payload["mime_type"],
                )
                self._store_file(stored_document_path, document_payload["content"])
                possession.document_path = relative_document_path

            await self._store_photo_payloads(possession, photo_payloads, stored_photo_paths)

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
                    "start_odometer_km": possession.start_odometer_km,
                    "kilometers_driven": self._calculate_kilometers_driven(possession.start_odometer_km, possession.end_odometer_km),
                    "photo_count": len(photo_payloads),
                    "signed_document_attached": bool(document_payload),
                    "signed_document_name": possession.document_name,
                    "signed_document_mime_type": possession.document_mime_type,
                    "signed_document_size_bytes": possession.document_size_bytes,
                    "capture_accuracy_meters": [payload["capture_accuracy_meters"] for payload in photo_payloads],
                },
            )
            if pending_admin_notification_payload:
                await self.admin_notifications.notify(
                    title="Divergencia de quilometragem entre posses",
                    message=(
                        f"Veiculo {vehicle.plate}: nova posse iniciou em {data.start_odometer_km:.1f} km "
                        f"e a posse anterior encerrada tinha {current_active.end_odometer_km:.1f} km."
                    ),
                    event_type="POSSESSION_ODOMETER_GAP",
                    severity="WARNING",
                    payload=pending_admin_notification_payload,
                )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_document_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel iniciar a posse") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_document_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Nao foi possivel armazenar os arquivos da posse",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_file(stored_document_path)
            self._cleanup_files(stored_photo_paths)
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
        if "end_odometer_km" in payload:
            possession.end_odometer_km = payload["end_odometer_km"]

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
                    "end_odometer_km": possession.end_odometer_km,
                    "kilometers_driven": self._calculate_kilometers_driven(possession.start_odometer_km, possession.end_odometer_km),
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel encerrar a posse") from exc

        return await self._get_by_id(possession.id, current_user)

    async def admin_update(
        self,
        possession_id: UUID,
        data: PossessionAdminUpdate,
        current_user: User,
        *,
        signed_document: UploadFile | None = None,
        new_photos: list[UploadFile] | None = None,
        new_photo_metadata: list[PossessionPhotoCreate] | None = None,
    ) -> dict:
        possession = await self.possessions.get_by_id(possession_id)
        if not possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")

        if data.end_date is not None and data.end_date < data.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final nao pode ser anterior ao inicio da posse")

        selected_driver = await self._resolve_driver_snapshot(
            driver_id=data.driver_id,
            fallback_name=data.driver_name,
            fallback_document=data.driver_document,
            fallback_contact=data.driver_contact,
        )
        period_changed = possession.start_date != data.start_date or possession.end_date != data.end_date
        if period_changed:
            await self._ensure_non_overlapping_period(
                vehicle_id=possession.vehicle_id,
                possession_id=possession.id,
                start_date=data.start_date,
                end_date=data.end_date,
            )

        document_payload = await self._read_and_validate_document(signed_document)
        photo_payloads = await self._read_and_validate_admin_photos(new_photos or [], new_photo_metadata or [])
        existing_entries = self._serialize_photo_entries(possession, can_view_location=self._can_view_location(current_user))
        before = {
            "driver_id": str(possession.driver_id) if possession.driver_id else None,
            "driver_name": possession.driver_name,
            "driver_document": possession.driver_document,
            "driver_contact": possession.driver_contact,
            "start_date": possession.start_date.isoformat() if possession.start_date else None,
            "end_date": possession.end_date.isoformat() if possession.end_date else None,
            "observation": possession.observation,
            "start_odometer_km": possession.start_odometer_km,
            "end_odometer_km": possession.end_odometer_km,
            "document_name": possession.document_name,
            "photo_count": len(existing_entries),
        }

        possession.driver_id = selected_driver["driver_id"]
        possession.driver_name = selected_driver["driver_name"]
        possession.driver_document = selected_driver["driver_document"]
        possession.driver_contact = selected_driver["driver_contact"]
        possession.start_date = data.start_date
        possession.end_date = data.end_date
        possession.observation = data.observation
        possession.start_odometer_km = data.start_odometer_km
        possession.end_odometer_km = data.end_odometer_km

        old_document_path = self._resolve_document_path(possession.document_path) if possession.document_path else None
        old_document_path_str = possession.document_path
        stored_document_path: Path | None = None
        stored_photo_paths: list[Path] = []
        try:
            if document_payload:
                relative_document_path, stored_document_path = self._build_document_storage_paths(
                    possession.id,
                    document_payload["mime_type"],
                )
                self._store_file(stored_document_path, document_payload["content"])
                possession.document_path = relative_document_path
                possession.document_name = document_payload["filename"]
                possession.document_mime_type = document_payload["mime_type"]
                possession.document_size_bytes = document_payload["size_bytes"]
                possession.document_uploaded_at = datetime.now(timezone.utc)

            await self._store_photo_payloads(possession, photo_payloads, stored_photo_paths)

            after = {
                "driver_id": str(possession.driver_id) if possession.driver_id else None,
                "driver_name": possession.driver_name,
                "driver_document": possession.driver_document,
                "driver_contact": possession.driver_contact,
                "start_date": possession.start_date.isoformat() if possession.start_date else None,
                "end_date": possession.end_date.isoformat() if possession.end_date else None,
                "observation": possession.observation,
                "start_odometer_km": possession.start_odometer_km,
                "end_odometer_km": possession.end_odometer_km,
                "kilometers_driven": self._calculate_kilometers_driven(possession.start_odometer_km, possession.end_odometer_km),
                "document_name": possession.document_name,
                "photo_count": len(existing_entries) + len(photo_payloads),
            }

            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"{possession.vehicle.plate if possession.vehicle else possession.vehicle_id} - {possession.driver_name}",
                details={
                    "event": "ADMIN_EDIT",
                    "reason": data.edit_reason,
                    "before": before,
                    "after": after,
                    "document_replaced": bool(document_payload),
                    "added_photo_count": len(photo_payloads),
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_document_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Nao foi possivel atualizar a posse") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_document_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Nao foi possivel armazenar os anexos da posse",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_file(stored_document_path)
            self._cleanup_files(stored_photo_paths)
            raise

        if document_payload and old_document_path and old_document_path_str != possession.document_path:
            self._cleanup_file(old_document_path)

        return await self._get_by_id(possession.id, current_user)

    async def get_photo_file(self, possession_id: UUID, *, photo_id: UUID | None = None) -> FileResponse:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")

        if photo_id is None:
            if record.photo_path:
                absolute_photo_path = self._resolve_photo_path(record.photo_path)
                photo_mime_type = record.photo_mime_type or "application/octet-stream"
            elif record.photos:
                selected_photo = record.photos[0]
                absolute_photo_path = self._resolve_photo_path(selected_photo.photo_path)
                photo_mime_type = selected_photo.photo_mime_type or "application/octet-stream"
            else:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma foto encontrada para esta posse")
        else:
            selected_photo = next((photo for photo in record.photos if photo.id == photo_id), None)
            if not selected_photo:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto da posse nao encontrada")
            absolute_photo_path = self._resolve_photo_path(selected_photo.photo_path)
            photo_mime_type = selected_photo.photo_mime_type or "application/octet-stream"

        if not absolute_photo_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo da foto nao encontrado")

        return FileResponse(
            absolute_photo_path,
            media_type=photo_mime_type,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "Content-Disposition": "inline",
            },
        )

    async def get_document_file(self, possession_id: UUID) -> FileResponse:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")
        if not record.document_path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum documento encontrado para esta posse")

        absolute_document_path = self._resolve_document_path(record.document_path)
        if not absolute_document_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo do documento nao encontrado")

        disposition_type = "inline" if (record.document_mime_type or "") in INLINE_DOCUMENT_MIME_TYPES else "attachment"
        filename = record.document_name or absolute_document_path.name
        return FileResponse(
            absolute_document_path,
            media_type=record.document_mime_type or "application/octet-stream",
            filename=filename,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "Content-Disposition": f'{disposition_type}; filename="{filename}"',
            },
        )

    async def _get_by_id(self, possession_id: UUID, current_user: User | None = None) -> dict:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse nao encontrado")
        await self.db.refresh(record, attribute_names=["vehicle", "photos"])
        return self._serialize(record, can_view_location=self._can_view_location(current_user))

    async def _ensure_vehicle_exists(self, vehicle_id: UUID) -> Vehicle:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veiculo nao encontrado")
        return vehicle

    async def _resolve_driver_snapshot(
        self,
        *,
        driver_id: UUID | None,
        fallback_name: str,
        fallback_document: str | None,
        fallback_contact: str | None,
    ) -> dict:
        if not driver_id:
            return {
                "driver_id": None,
                "driver_name": fallback_name,
                "driver_document": fallback_document,
                "driver_contact": fallback_contact,
            }

        driver = await self.drivers.get_by_id(driver_id)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor selecionado nao encontrado")
        if not driver.ativo:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Condutor selecionado esta inativo")

        return {
            "driver_id": driver.id,
            "driver_name": driver.nome_completo,
            "driver_document": driver.documento,
            "driver_contact": driver.contato,
        }

    async def _ensure_non_overlapping_period(
        self,
        *,
        vehicle_id: UUID,
        possession_id: UUID,
        start_date: datetime,
        end_date: datetime | None,
    ) -> None:
        records = await self.possessions.list(vehicle_id=vehicle_id)
        for record in records:
            if record.id == possession_id:
                continue
            if self._periods_overlap(start_date, end_date, record.start_date, record.end_date):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Periodo informado se sobrepoe a outro registro de posse deste veiculo",
                )

    async def _read_and_validate_captured_photos(
        self,
        photos: list[UploadFile],
        photo_metadata: list[PossessionPhotoCreate],
        *,
        require_at_least_one: bool,
    ) -> list[dict]:
        if require_at_least_one and not photos:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ao menos uma foto e obrigatoria para registrar a posse")
        if len(photos) != len(photo_metadata):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cada foto enviada precisa ter um metadado de georreferenciamento correspondente",
            )

        payloads: list[dict] = []
        for upload, metadata in zip(photos, photo_metadata, strict=False):
            content, photo_mime_type = await self._read_and_validate_photo(upload)
            payloads.append(
                {
                    "content": content,
                    "mime_type": photo_mime_type,
                    "size_bytes": len(content),
                    "photo_captured_at": metadata.photo_captured_at,
                    "capture_latitude": metadata.capture_latitude,
                    "capture_longitude": metadata.capture_longitude,
                    "capture_accuracy_meters": metadata.capture_accuracy_meters,
                }
            )
        return payloads

    async def _read_and_validate_admin_photos(
        self,
        photos: list[UploadFile],
        photo_metadata: list[PossessionPhotoCreate],
    ) -> list[dict]:
        if not photos:
            if photo_metadata:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Os metadados enviados para novas fotos nao possuem arquivos correspondentes",
                )
            return []

        if photo_metadata and len(photos) != len(photo_metadata):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Se metadados forem enviados na edicao, a quantidade deve corresponder ao numero de fotos anexadas",
            )

        payloads: list[dict] = []
        for index, upload in enumerate(photos):
            content, photo_mime_type = await self._read_and_validate_photo(upload)
            metadata = photo_metadata[index] if photo_metadata else None
            payloads.append(
                {
                    "content": content,
                    "mime_type": photo_mime_type,
                    "size_bytes": len(content),
                    "photo_captured_at": metadata.photo_captured_at if metadata else None,
                    "capture_latitude": metadata.capture_latitude if metadata else None,
                    "capture_longitude": metadata.capture_longitude if metadata else None,
                    "capture_accuracy_meters": metadata.capture_accuracy_meters if metadata else None,
                }
            )
        return payloads

    async def _read_and_validate_photo(self, photo: UploadFile) -> tuple[bytes, str]:
        photo_mime_type = (photo.content_type or "").lower()
        if photo_mime_type not in PHOTO_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="As fotos da posse devem estar em JPG, PNG ou WEBP",
            )

        content = await photo.read()
        await photo.close()

        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uma das fotos enviadas esta vazia")
        if len(content) > MAX_PHOTO_SIZE_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uma das fotos excede o limite de 8 MB")

        return content, photo_mime_type

    async def _read_and_validate_document(self, document: UploadFile | None) -> dict | None:
        if document is None:
            return None

        document_mime_type = (document.content_type or "").lower()
        if document_mime_type not in DOCUMENT_EXTENSIONS:
            await document.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Documento assinado deve estar em PDF, JPG, PNG, WEBP, DOC ou DOCX",
            )

        content = await document.read()
        original_filename = document.filename or "documento-assinado"
        await document.close()

        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento anexado esta vazio")
        if len(content) > MAX_DOCUMENT_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Documento assinado excede o limite de 12 MB",
            )

        return {
            "content": content,
            "mime_type": document_mime_type,
            "filename": self._sanitize_document_name(original_filename),
            "size_bytes": len(content),
        }

    async def _store_photo_payloads(
        self,
        possession: VehiclePossession,
        photo_payloads: list[dict],
        stored_photo_paths: list[Path],
    ) -> None:
        for payload in photo_payloads:
            photo_record = VehiclePossessionPhoto(
                possession_id=possession.id,
                photo_path="",
                photo_mime_type=payload["mime_type"],
                photo_size_bytes=payload["size_bytes"],
                photo_captured_at=payload["photo_captured_at"],
                capture_latitude=payload["capture_latitude"],
                capture_longitude=payload["capture_longitude"],
                capture_accuracy_meters=payload["capture_accuracy_meters"],
            )
            self.db.add(photo_record)
            await self.db.flush()

            relative_photo_path, absolute_photo_path = self._build_photo_storage_paths(photo_record.id, payload["mime_type"])
            self._store_file(absolute_photo_path, payload["content"])
            photo_record.photo_path = relative_photo_path
            stored_photo_paths.append(absolute_photo_path)

    def _build_photo_storage_paths(self, photo_id: UUID, photo_mime_type: str) -> tuple[str, Path]:
        extension = PHOTO_EXTENSIONS[photo_mime_type]
        relative_path = Path("possession_photos") / f"{photo_id}{extension}"
        absolute_path = Path(settings.STORAGE_DIR) / relative_path
        return relative_path.as_posix(), absolute_path

    def _build_document_storage_paths(self, possession_id: UUID, document_mime_type: str) -> tuple[str, Path]:
        extension = DOCUMENT_EXTENSIONS[document_mime_type]
        relative_path = Path("possession_documents") / f"{possession_id}{extension}"
        absolute_path = Path(settings.STORAGE_DIR) / relative_path
        return relative_path.as_posix(), absolute_path

    def _store_file(self, absolute_path: Path, content: bytes) -> None:
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(content)

    def _resolve_photo_path(self, relative_photo_path: str) -> Path:
        return Path(settings.STORAGE_DIR) / Path(relative_photo_path)

    def _resolve_document_path(self, relative_document_path: str) -> Path:
        return Path(settings.STORAGE_DIR) / Path(relative_document_path)

    def _cleanup_file(self, absolute_path: Path | None) -> None:
        if not absolute_path:
            return
        try:
            if absolute_path.exists():
                absolute_path.unlink()
        except OSError:
            return

    def _cleanup_files(self, absolute_paths: list[Path]) -> None:
        for path in absolute_paths:
            self._cleanup_file(path)

    def _periods_overlap(
        self,
        start_a: datetime,
        end_a: datetime | None,
        start_b: datetime,
        end_b: datetime | None,
    ) -> bool:
        far_future = datetime.max.replace(tzinfo=timezone.utc)
        effective_end_a = end_a or far_future
        effective_end_b = end_b or far_future
        return start_a <= effective_end_b and start_b <= effective_end_a

    def _sanitize_document_name(self, original_filename: str) -> str:
        normalized = sub(r"[^A-Za-z0-9._-]+", "-", original_filename.strip())
        normalized = normalized.strip(".-") or "documento-assinado"
        return normalized[:120]

    def _serialize(self, record: VehiclePossession, *, can_view_location: bool) -> dict:
        photos = self._serialize_photo_entries(record, can_view_location=can_view_location)
        primary_photo = photos[0] if photos else None

        return {
            "id": record.id,
            "vehicle_id": record.vehicle_id,
            "vehicle_plate": record.vehicle.plate if record.vehicle else "",
            "driver_id": record.driver_id,
            "driver_name": record.driver_name,
            "driver_document": record.driver_document,
            "driver_contact": record.driver_contact,
            "start_date": record.start_date,
            "end_date": record.end_date,
            "observation": record.observation,
            "start_odometer_km": record.start_odometer_km,
            "end_odometer_km": record.end_odometer_km,
            "kilometers_driven": self._calculate_kilometers_driven(record.start_odometer_km, record.end_odometer_km),
            "created_at": record.created_at,
            "is_active": record.is_active,
            "photo_available": bool(photos),
            "photo_count": len(photos),
            "photo_url": primary_photo["url"] if primary_photo else None,
            "photo_captured_at": primary_photo["captured_at"] if primary_photo else None,
            "photos": photos,
            "document_available": bool(record.document_path),
            "document_name": record.document_name,
            "document_url": f"/api/possession/{record.id}/document" if record.document_path else None,
            "document_uploaded_at": record.document_uploaded_at,
            "capture_location": primary_photo["capture_location"] if primary_photo else None,
        }

    def _serialize_photo_entries(self, record: VehiclePossession, *, can_view_location: bool) -> list[dict]:
        entries: list[dict] = []

        if record.photo_path:
            entries.append(
                {
                    "id": None,
                    "url": f"/api/possession/{record.id}/photo",
                    "captured_at": record.photo_captured_at,
                    "capture_location": self._build_capture_location(
                        record.capture_latitude,
                        record.capture_longitude,
                        record.capture_accuracy_meters,
                        can_view_location=can_view_location,
                    ),
                    "is_legacy": True,
                }
            )

        for photo in record.photos:
            entries.append(
                {
                    "id": photo.id,
                    "url": f"/api/possession/{record.id}/photos/{photo.id}",
                    "captured_at": photo.photo_captured_at,
                    "capture_location": self._build_capture_location(
                        photo.capture_latitude,
                        photo.capture_longitude,
                        photo.capture_accuracy_meters,
                        can_view_location=can_view_location,
                    ),
                    "is_legacy": False,
                }
            )

        return entries


    def _calculate_kilometers_driven(self, start_odometer_km: float | None, end_odometer_km: float | None) -> float | None:
        if start_odometer_km is None or end_odometer_km is None:
            return None
        if end_odometer_km < start_odometer_km:
            return None
        return round(float(end_odometer_km - start_odometer_km), 2)

    def _build_capture_location(
        self,
        latitude: float | None,
        longitude: float | None,
        accuracy: float | None,
        *,
        can_view_location: bool,
    ) -> dict | None:
        if not can_view_location or latitude is None or longitude is None or accuracy is None:
            return None

        return {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "accuracy_meters": float(accuracy),
            "maps_url": self._build_maps_url(float(latitude), float(longitude)),
        }

    def _build_maps_url(self, latitude: float, longitude: float) -> str:
        return f"https://www.openstreetmap.org/?mlat={latitude:.6f}&mlon={longitude:.6f}#map=18/{latitude:.6f}/{longitude:.6f}"

    def _can_view_location(self, current_user: User | None) -> bool:
        return bool(current_user and current_user.role == UserRole.ADMIN)
