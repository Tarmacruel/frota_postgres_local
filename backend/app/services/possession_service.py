from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from re import sub
from uuid import UUID, uuid4
from zipfile import BadZipFile, ZipFile
from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.possession import VehiclePossession
from app.models.possession_photo import VehiclePossessionPhoto
from app.models.possession_trip import VehiclePossessionTripStatus
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.repositories.driver_repository import DriverRepository
from app.repositories.possession_repository import PossessionRepository
from app.repositories.possession_trip_repository import PossessionReturnConfirmationRepository, PossessionTripRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.possession import PossessionAdminUpdate, PossessionCreate, PossessionPhotoCreate, PossessionUpdate
from app.schemas.possession_trip import TripCreate
from app.services.admin_notification_service import AdminNotificationService
from app.services.audit_service import AuditService
from app.services.document_signature_service import DocumentSignatureService, SOURCE_POSSESSION
from app.services.possession_trip_service import PossessionTripService
from app.models.document_signature import DigitalDocumentType

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
PUBLIC_LOAN_TERM_PATH_PREFIX = "/validar/termo-emprestimo"
PUBLIC_RETURN_TERM_PATH_PREFIX = "/validar/termo-devolucao"
HARD_DELETE_DISABLED_DETAIL = {
    "code": "POSSESSION_HARD_DELETE_DISABLED",
    "message": "A exclusão física de posses está desabilitada; utilize retificação auditável.",
}


class PossessionService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.trips = PossessionTripRepository(db)
        self.return_confirmations = PossessionReturnConfirmationRepository(db)
        self.audit = AuditService(db)
        self.admin_notifications = AdminNotificationService(db)

    async def list(self, vehicle_id: UUID | None = None, active: bool | None = None, current_user: User | None = None) -> list[dict]:
        if production_scope_is_empty(current_user):
            return []

        organization_id = scoped_organization_id(current_user)
        records = await self.possessions.list(vehicle_id=vehicle_id, active=active, organization_id=organization_id)
        can_view_location = self._can_view_location(current_user)
        can_view_personal_data = self._can_view_personal_data(current_user)
        payloads = []
        for record in records:
            payload = self._serialize(
                record,
                can_view_location=can_view_location,
                can_view_personal_data=can_view_personal_data,
            )
            signature_summary = await self._build_possession_signature_summary(record, current_user=current_user)
            payload["signature_summary"] = self._sanitize_signature_summaries(
                signature_summary,
                can_view_personal_data=can_view_personal_data,
            )
            payloads.append(payload)
        return payloads

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
        if production_scope_is_empty(current_user):
            return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

        organization_id = scoped_organization_id(current_user)
        can_view_personal_data = self._can_view_personal_data(current_user)
        records, total = await self.possessions.list_paginated(
            page=page,
            limit=limit,
            vehicle_id=vehicle_id,
            active=active,
            driver_id=driver_id if can_view_personal_data else None,
            search=search,
            organization_id=organization_id,
            include_personal_search=can_view_personal_data,
        )
        can_view_location = self._can_view_location(current_user)
        return PaginatedResponse[dict](
            data=[
                await self._serialize_with_signatures(
                    record,
                    can_view_location=can_view_location,
                    can_view_personal_data=can_view_personal_data,
                    current_user=current_user,
                )
                for record in records
            ],
            pagination=build_pagination(page, limit, total),
        )

    async def list_active(self, current_user: User | None = None) -> list[dict]:
        return await self.list(active=True, current_user=current_user)

    async def get_current_driver(self, vehicle_id: UUID, current_user: User | None = None) -> dict:
        await self._ensure_vehicle_exists(vehicle_id, current_user=current_user)
        record = await self.possessions.get_active_by_vehicle(vehicle_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhum condutor ativo encontrado para este veículo")
        return await self._serialize_with_signatures(
            record,
            can_view_location=self._can_view_location(current_user),
            can_view_personal_data=self._can_view_personal_data(current_user),
            current_user=current_user,
        )

    async def start(
        self,
        data: PossessionCreate,
        *,
        photos: list[UploadFile],
        photo_metadata: list[PossessionPhotoCreate],
        loan_term_document: UploadFile | None,
        initial_trip: TripCreate | None = None,
        replace_active: bool = False,
        replacement_reason: str | None = None,
        current_user: User,
    ) -> dict:
        vehicle = await self._ensure_vehicle_exists(data.vehicle_id, current_user=current_user)
        selected_driver = await self._resolve_driver_snapshot(
            driver_id=data.driver_id,
            fallback_name=data.driver_name,
            fallback_document=data.driver_document,
            fallback_contact=data.driver_contact,
            current_user=current_user,
        )
        photo_payloads = await self._read_and_validate_captured_photos(photos, photo_metadata, require_at_least_one=False)
        loan_term_payload = await self._read_and_validate_document(loan_term_document)

        effective_start = data.start_date or datetime.now(timezone.utc)
        possession = VehiclePossession(
            vehicle_id=data.vehicle_id,
            driver_id=selected_driver["driver_id"],
            driver_name=selected_driver["driver_name"],
            driver_document=selected_driver["driver_document"],
            driver_contact=selected_driver["driver_contact"],
            start_date=effective_start,
            observation=data.observation,
            start_odometer_km=data.start_odometer_km,
            document_name=loan_term_payload["filename"] if loan_term_payload else None,
            document_mime_type=loan_term_payload["mime_type"] if loan_term_payload else None,
            document_size_bytes=loan_term_payload["size_bytes"] if loan_term_payload else None,
            document_uploaded_at=datetime.now(timezone.utc) if loan_term_payload else None,
            # New single terms are authenticated; public codes remain legacy-only.
            loan_term_validation_code=None,
            return_term_validation_code=None,
        )

        stored_loan_term_path: Path | None = None
        stored_photo_paths: list[Path] = []
        try:
            if not await self.possessions.lock_vehicle(data.vehicle_id):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
            current_active = await self.possessions.get_active_by_vehicle(data.vehicle_id, for_update=True)
            normalized_reason = replacement_reason.strip() if replacement_reason else None
            pending_admin_notification_payload: dict | None = None

            if current_active is not None and not replace_active:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "ACTIVE_POSSESSION_EXISTS",
                        "message": "O veículo já possui uma posse ativa; confirme a substituição explicitamente.",
                        "active_possession": {
                            "id": str(current_active.id),
                            "public_number": current_active.public_number,
                            "start_date": current_active.start_date.isoformat(),
                        },
                    },
                )

            if current_active is not None:
                if not normalized_reason or len(normalized_reason) < 8 or len(normalized_reason) > 1000:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={
                            "code": "REPLACEMENT_REASON_REQUIRED",
                            "message": "A substituição exige justificativa entre 8 e 1000 caracteres.",
                        },
                    )
                if effective_start < current_active.start_date:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail={
                            "code": "POSSESSION_START_BEFORE_ACTIVE",
                            "message": "A nova posse não pode iniciar antes da posse ativa atual.",
                        },
                    )
                if await self.trips.get_open_by_possession(current_active.id, for_update=True):
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "code": "ACTIVE_POSSESSION_HAS_OPEN_TRIP",
                            "message": "A posse ativa possui rota em andamento e não pode ser substituída.",
                        },
                    )

                previous_end_odometer = current_active.end_odometer_km
                current_active.end_date = effective_start
                if current_active.end_odometer_km is None and data.start_odometer_km is not None:
                    current_active.end_odometer_km = data.start_odometer_km
                if previous_end_odometer is not None and data.start_odometer_km is not None:
                    gap_km = round(float(data.start_odometer_km - previous_end_odometer), 2)
                    if abs(gap_km) > 0:
                        pending_admin_notification_payload = {
                            "vehicle_id": str(data.vehicle_id),
                            "previous_possession_id": str(current_active.id),
                            "previous_end_odometer_km": previous_end_odometer,
                            "new_start_odometer_km": data.start_odometer_km,
                            "gap_km": gap_km,
                            "replaced_at": effective_start.isoformat(),
                        }

            await self.possessions.create(possession)

            if initial_trip is not None:
                await PossessionTripService(self.db).create_in_transaction(
                    possession.id,
                    initial_trip,
                    current_user=current_user,
                )

            if loan_term_payload:
                relative_document_path, stored_loan_term_path = self._build_document_storage_paths(
                    possession.id,
                    loan_term_payload["mime_type"],
                    document_kind="loan",
                )
                self._store_file(stored_loan_term_path, loan_term_payload["content"])
                possession.document_path = relative_document_path

            await self._store_photo_payloads(possession, photo_payloads, stored_photo_paths)

            await self.audit.record(
                actor=current_user,
                action="POSSESSION_CREATE",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"{vehicle.plate} - {possession.driver_name}",
                details={
                    "vehicle_id": str(possession.vehicle_id),
                    "driver_document": possession.driver_document,
                    "driver_contact": possession.driver_contact,
                    "start_date": possession.start_date.isoformat(),
                    "start_odometer_km": possession.start_odometer_km,
                    "kilometers_driven": self._calculate_kilometers_driven(possession.start_odometer_km, possession.end_odometer_km),
                    "photo_count": len(photo_payloads),
                    "loan_term_attached": bool(loan_term_payload),
                    "loan_term_mime_type": possession.document_mime_type,
                    "loan_term_size_bytes": possession.document_size_bytes,
                    "signed_document_attached": bool(loan_term_payload),
                    "initial_trip_created": initial_trip is not None,
                },
            )
            if current_active is not None:
                await self.audit.record(
                    actor=current_user,
                    action="POSSESSION_REPLACE_ACTIVE",
                    entity_type="POSSESSION",
                    entity_id=possession.id,
                    entity_label=f"{vehicle.plate} - {possession.driver_name}",
                    details={
                        "vehicle_id": str(possession.vehicle_id),
                        "previous_possession_id": str(current_active.id),
                        "new_possession_id": str(possession.id),
                        "replacement_reason": normalized_reason,
                        "previous_ended_at": effective_start.isoformat(),
                    },
                )
            if pending_admin_notification_payload:
                await self.admin_notifications.notify(
                    title="Divergência de quilometragem entre posses",
                    message=(
                        f"Veículo {vehicle.plate}: nova posse iniciou em {data.start_odometer_km:.1f} km "
                        f"e a posse anterior tinha {pending_admin_notification_payload['previous_end_odometer_km']:.1f} km."
                    ),
                    event_type="POSSESSION_ODOMETER_GAP",
                    severity="WARNING",
                    payload=pending_admin_notification_payload,
                )
            await self.db.flush()
            await self.db.commit()
        except HTTPException:
            await self.db.rollback()
            self._cleanup_file(stored_loan_term_path)
            self._cleanup_files(stored_photo_paths)
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_loan_term_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível iniciar a posse") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_loan_term_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Não foi possível armazenar os arquivos da posse",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_file(stored_loan_term_path)
            self._cleanup_files(stored_photo_paths)
            raise

        return await self._get_by_id(possession.id, current_user)

    async def end(
        self,
        possession_id: UUID,
        data: PossessionUpdate,
        current_user: User,
        *,
        return_term_document: UploadFile | None = None,
    ) -> dict:
        # Kept only as a non-mutating compatibility guard for internal callers.
        # The HTTP contract uses PossessionReturnService and requires the authenticated declaration.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "POSSESSION_END_REQUIRES_DECLARATION",
                "message": "Use o encerramento com confirmação versionada e declaração autenticada.",
            },
        )

        # Legacy body below is unreachable and retained only for source compatibility.
        visible_possession = await self.possessions.get_by_id(possession_id)
        if not visible_possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")
        await self._ensure_possession_visible_to_user(visible_possession, current_user)
        possession = await self.possessions.get_by_id_for_update(possession_id)
        if not possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")
        if possession.end_date is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registro de posse já encerrado")
        if await self.trips.get_open_by_possession(possession_id, for_update=True):
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "POSSESSION_HAS_OPEN_TRIP",
                    "message": "A posse não pode ser encerrada enquanto houver rota em andamento.",
                },
            )

        return_term_payload = await self._read_and_validate_document(return_term_document)
        payload = data.model_dump(exclude_unset=True)
        effective_end = payload.get("end_date") or datetime.now(timezone.utc)
        if effective_end < possession.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final não pode ser anterior ao início da posse")
        if (
            payload.get("end_odometer_km") is not None
            and possession.start_odometer_km is not None
            and payload["end_odometer_km"] < possession.start_odometer_km
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "POSSESSION_ODOMETER_REVERSED",
                    "message": "O hodômetro final não pode ser inferior ao inicial.",
                },
            )

        possession.end_date = effective_end
        if "observation" in payload:
            possession.observation = payload["observation"]
        if "end_odometer_km" in payload:
            possession.end_odometer_km = payload["end_odometer_km"]

        stored_return_term_path: Path | None = None
        try:
            if return_term_payload:
                relative_document_path, stored_return_term_path = self._build_document_storage_paths(
                    possession.id,
                    return_term_payload["mime_type"],
                    document_kind="return",
                )
                self._store_file(stored_return_term_path, return_term_payload["content"])
                possession.return_document_path = relative_document_path
                possession.return_document_name = return_term_payload["filename"]
                possession.return_document_mime_type = return_term_payload["mime_type"]
                possession.return_document_size_bytes = return_term_payload["size_bytes"]
                possession.return_document_uploaded_at = datetime.now(timezone.utc)

            await DocumentSignatureService(self.db).mark_source_documents_superseded(
                source_type=SOURCE_POSSESSION,
                source_id=possession.id,
                document_types=[DigitalDocumentType.POSSESSION_RETURN_TERM],
                current_user=current_user,
                reason="POSSESSION_END_UPDATED",
            )
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
                    "return_term_attached": bool(return_term_payload),
                    "return_term_name": possession.return_document_name,
                    "return_term_mime_type": possession.return_document_mime_type,
                    "return_term_size_bytes": possession.return_document_size_bytes,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_return_term_path)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível encerrar a posse") from exc

        except OSError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_return_term_path)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Não foi possível armazenar o termo de devolução da posse",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_file(stored_return_term_path)
            raise

        return await self._get_by_id(possession.id, current_user)

    async def admin_update(
        self,
        possession_id: UUID,
        data: PossessionAdminUpdate,
        current_user: User,
        *,
        loan_term_document: UploadFile | None = None,
        return_term_document: UploadFile | None = None,
        new_photos: list[UploadFile] | None = None,
        new_photo_metadata: list[PossessionPhotoCreate] | None = None,
    ) -> dict:
        visible_possession = await self.possessions.get_by_id(possession_id)
        if not visible_possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")

        await self._ensure_possession_visible_to_user(visible_possession, current_user)
        if not await self.possessions.lock_vehicle(visible_possession.vehicle_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
        possession = await self.possessions.get_by_id_for_update(possession_id)
        if not possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")
        if return_term_document is not None:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "LEGACY_RETURN_TERM_READ_ONLY",
                    "message": "Anexos separados de devolução são somente leitura; use a confirmação versionada.",
                },
            )
        current_confirmation = await self.return_confirmations.get_current(possession_id, for_update=True)
        if possession.end_date is None and data.end_date is not None:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "POSSESSION_END_REQUIRES_DECLARATION",
                    "message": "Use o encerramento com declaração autenticada para finalizar uma posse ativa.",
                },
            )
        if current_confirmation and (
            data.end_date != possession.end_date
            or data.end_odometer_km != possession.end_odometer_km
        ):
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "RETURN_CONFIRMATION_CORRECTION_REQUIRED",
                    "message": "Data ou hodômetro de devolução com confirmação exigem correção administrativa versionada.",
                },
            )
        if data.end_date is not None and data.end_date < data.start_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data final não pode ser anterior ao início da posse")

        existing_trips = await self.trips.list_by_possession(possession_id)
        if data.end_date is not None and any(
            trip.status == VehiclePossessionTripStatus.EM_ANDAMENTO for trip in existing_trips
        ):
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "POSSESSION_HAS_OPEN_TRIP",
                    "message": "A posse não pode ser encerrada enquanto houver rota em andamento.",
                },
            )
        if any(
            trip.departure_at < data.start_date
            or (
                data.end_date is not None
                and (trip.return_at or trip.departure_at) > data.end_date
            )
            for trip in existing_trips
        ):
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "POSSESSION_PERIOD_CONFLICTS_WITH_TRIPS",
                    "message": "O período informado não contém todas as rotas registradas.",
                },
            )

        selected_driver = await self._resolve_driver_snapshot(
            driver_id=data.driver_id,
            fallback_name=data.driver_name,
            fallback_document=data.driver_document,
            fallback_contact=data.driver_contact,
            current_user=current_user,
        )
        period_changed = possession.start_date != data.start_date or possession.end_date != data.end_date
        if period_changed:
            await self._ensure_non_overlapping_period(
                vehicle_id=possession.vehicle_id,
                possession_id=possession.id,
                start_date=data.start_date,
                end_date=data.end_date,
            )

        loan_term_payload = await self._read_and_validate_document(loan_term_document)
        return_term_payload = await self._read_and_validate_document(return_term_document)
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
            "loan_term_name": possession.document_name,
            "return_term_name": possession.return_document_name,
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
        old_return_document_path = self._resolve_document_path(possession.return_document_path) if possession.return_document_path else None
        old_return_document_path_str = possession.return_document_path
        stored_loan_term_path: Path | None = None
        stored_return_term_path: Path | None = None
        stored_photo_paths: list[Path] = []
        try:
            if loan_term_payload:
                relative_document_path, stored_loan_term_path = self._build_document_storage_paths(
                    possession.id,
                    loan_term_payload["mime_type"],
                    document_kind="loan",
                )
                self._store_file(stored_loan_term_path, loan_term_payload["content"])
                possession.document_path = relative_document_path
                possession.document_name = loan_term_payload["filename"]
                possession.document_mime_type = loan_term_payload["mime_type"]
                possession.document_size_bytes = loan_term_payload["size_bytes"]
                possession.document_uploaded_at = datetime.now(timezone.utc)

            if return_term_payload:
                relative_document_path, stored_return_term_path = self._build_document_storage_paths(
                    possession.id,
                    return_term_payload["mime_type"],
                    document_kind="return",
                )
                self._store_file(stored_return_term_path, return_term_payload["content"])
                possession.return_document_path = relative_document_path
                possession.return_document_name = return_term_payload["filename"]
                possession.return_document_mime_type = return_term_payload["mime_type"]
                possession.return_document_size_bytes = return_term_payload["size_bytes"]
                possession.return_document_uploaded_at = datetime.now(timezone.utc)

            await self._store_photo_payloads(possession, photo_payloads, stored_photo_paths)

            responsibility_scope_changed = bool(photo_payloads) or any(
                (
                    before["driver_id"] != (str(possession.driver_id) if possession.driver_id else None),
                    before["driver_name"] != possession.driver_name,
                    before["driver_document"] != possession.driver_document,
                    before["driver_contact"] != possession.driver_contact,
                    before["start_date"] != (possession.start_date.isoformat() if possession.start_date else None),
                    before["observation"] != possession.observation,
                    before["start_odometer_km"] != possession.start_odometer_km,
                )
            )
            superseded_document_types = [
                DigitalDocumentType.POSSESSION_LOAN_TERM,
                DigitalDocumentType.POSSESSION_RETURN_TERM,
            ]
            if responsibility_scope_changed:
                superseded_document_types.insert(0, DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM)
            await DocumentSignatureService(self.db).mark_source_documents_superseded(
                source_type=SOURCE_POSSESSION,
                source_id=possession.id,
                document_types=superseded_document_types,
                current_user=current_user,
                reason="POSSESSION_ADMIN_EDIT",
            )

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
                "loan_term_name": possession.document_name,
                "return_term_name": possession.return_document_name,
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
                    "loan_term_replaced": bool(loan_term_payload),
                    "return_term_replaced": bool(return_term_payload),
                    "document_replaced": bool(loan_term_payload),
                    "added_photo_count": len(photo_payloads),
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_loan_term_path)
            self._cleanup_file(stored_return_term_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível atualizar a posse") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_file(stored_loan_term_path)
            self._cleanup_file(stored_return_term_path)
            self._cleanup_files(stored_photo_paths)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Não foi possível armazenar os anexos da posse",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_file(stored_loan_term_path)
            self._cleanup_file(stored_return_term_path)
            self._cleanup_files(stored_photo_paths)
            raise

        if loan_term_payload and old_document_path and old_document_path_str != possession.document_path:
            self._cleanup_file(old_document_path)
        if return_term_payload and old_return_document_path and old_return_document_path_str != possession.return_document_path:
            self._cleanup_file(old_return_document_path)

        return await self._get_by_id(possession.id, current_user)

    async def reject_hard_delete(self, possession_id: UUID, current_user: User) -> None:
        possession = await self.possessions.get_by_id(possession_id)
        if not possession:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")

        await self._ensure_possession_visible_to_user(possession, current_user)
        vehicle_label = possession.vehicle.plate if possession.vehicle else possession.vehicle_id

        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE_DENIED",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"{vehicle_label} - {possession.driver_name}",
                details={
                    "event": "HARD_DELETE_DISABLED",
                    "reason": HARD_DELETE_DISABLED_DETAIL["code"],
                    "vehicle_id": str(possession.vehicle_id),
                    "is_active": possession.is_active,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Não foi possível auditar a tentativa de exclusão") from exc
        except Exception:
            await self.db.rollback()
            raise

        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=HARD_DELETE_DISABLED_DETAIL)

    async def get_photo_file(self, possession_id: UUID, *, photo_id: UUID | None = None, current_user: User | None = None) -> FileResponse:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")

        await self._ensure_possession_visible_to_user(record, current_user)
        if not self._can_view_personal_data(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Evidencia integral restrita a perfis operacionais")
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
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foto da posse não encontrada")
            absolute_photo_path = self._resolve_photo_path(selected_photo.photo_path)
            photo_mime_type = selected_photo.photo_mime_type or "application/octet-stream"

        if not absolute_photo_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo da foto não encontrado")

        return FileResponse(
            absolute_photo_path,
            media_type=photo_mime_type,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "Content-Disposition": "inline",
            },
        )

    async def get_document_file(self, possession_id: UUID, *, document_kind: str = "loan", current_user: User | None = None) -> FileResponse:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")
        await self._ensure_possession_visible_to_user(record, current_user)
        if not self._can_view_personal_data(current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Download integral restrito a perfis operacionais")
        if document_kind == "return":
            document_path = record.return_document_path
            document_name = record.return_document_name
            document_mime_type = record.return_document_mime_type
            missing_detail = "Nenhum termo de devolução encontrado para esta posse"
        else:
            document_path = record.document_path
            document_name = record.document_name
            document_mime_type = record.document_mime_type
            missing_detail = "Nenhum termo de empréstimo encontrado para esta posse"

        if not document_path:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=missing_detail)

        absolute_document_path = self._resolve_document_path(document_path)
        if not absolute_document_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo do documento não encontrado")

        disposition_type = "inline" if (document_mime_type or "") in INLINE_DOCUMENT_MIME_TYPES else "attachment"
        extension = absolute_document_path.suffix.lower() or DOCUMENT_EXTENSIONS.get(document_mime_type or "", ".bin")
        public_reference = str(record.public_number or record.id).replace("-", "")[:20]
        filename = f"termo-posse-{public_reference}-{document_kind}{extension}"
        return FileResponse(
            absolute_document_path,
            media_type=document_mime_type or "application/octet-stream",
            filename=self._sanitize_document_name(filename),
            content_disposition_type=disposition_type,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
            },
        )

    async def get_public_term(self, validation_code: str, *, term_type: str) -> dict:
        normalized_code = (validation_code or "").strip().upper()
        if not normalized_code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Termo público não encontrado")

        if term_type == "return":
            record = await self.possessions.get_by_return_term_validation_code(normalized_code)
            if not record:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Termo público não encontrado")
            if record.end_date is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Termo de devolução ainda não disponível")
        else:
            record = await self.possessions.get_by_loan_term_validation_code(normalized_code)
            if not record:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Termo público não encontrado")

        payload = self._serialize_public_term(record, term_type=term_type)
        signature_summary = await DocumentSignatureService(self.db).get_summary_for_source(
            DigitalDocumentType.POSSESSION_RETURN_TERM if term_type == "return" else DigitalDocumentType.POSSESSION_LOAN_TERM,
            record.id,
        )
        payload["signature_summary"] = DocumentSignatureService.sanitize_summary_for_legacy_public_view(
            signature_summary,
        )
        return payload

    async def _get_by_id(self, possession_id: UUID, current_user: User | None = None) -> dict:
        record = await self.possessions.get_by_id(possession_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")
        await self._ensure_possession_visible_to_user(record, current_user)
        await self.db.refresh(record, attribute_names=["vehicle", "photos"])
        return await self._serialize_with_signatures(
            record,
            can_view_location=self._can_view_location(current_user),
            can_view_personal_data=self._can_view_personal_data(current_user),
            current_user=current_user,
        )

    async def _ensure_vehicle_exists(self, vehicle_id: UUID, current_user: User | None = None) -> Vehicle:
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
        await self._ensure_vehicle_visible_to_user(vehicle_id, current_user)
        return vehicle

    async def _ensure_vehicle_visible_to_user(self, vehicle_id: UUID, current_user: User | None) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
            return
        if not await self.vehicles.is_vehicle_in_organization(vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

    async def _ensure_possession_visible_to_user(self, possession: VehiclePossession, current_user: User | None) -> None:
        await self._ensure_vehicle_visible_to_user(possession.vehicle_id, current_user)

    async def _resolve_driver_snapshot(
        self,
        *,
        driver_id: UUID | None,
        fallback_name: str,
        fallback_document: str | None,
        fallback_contact: str | None,
        current_user: User | None = None,
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor selecionado não encontrado")
        if not driver.ativo:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Condutor selecionado está inativo")

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
                    detail="Período informado se sobrepõe a outro registro de posse deste veículo",
                )

    async def _read_and_validate_captured_photos(
        self,
        photos: list[UploadFile],
        photo_metadata: list[PossessionPhotoCreate],
        *,
        require_at_least_one: bool,
    ) -> list[dict]:
        if require_at_least_one and not photos:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ao menos uma foto é obrigatória para registrar a posse")
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
                    detail="Os metadados enviados para novas fotos não possuem arquivos correspondentes",
                )
            return []

        if photo_metadata and len(photos) != len(photo_metadata):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Se metadados forem enviados na edição, a quantidade deve corresponder ao número de fotos anexadas",
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

        content = await photo.read(MAX_PHOTO_SIZE_BYTES + 1)
        await photo.close()

        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uma das fotos enviadas está vazia")
        if len(content) > MAX_PHOTO_SIZE_BYTES:
            raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uma das fotos excede o limite de 8 MB")
        if not self._content_matches_mime(content, photo_mime_type):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O conteudo da foto nao corresponde ao formato informado")

        return content, photo_mime_type

    async def _read_and_validate_document(self, document: UploadFile | None) -> dict | None:
        if document is None:
            return None

        document_mime_type = (document.content_type or "").lower()
        if document_mime_type not in DOCUMENT_EXTENSIONS:
            await document.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Termo anexado deve estar em PDF, JPG, PNG, WEBP, DOC ou DOCX",
            )

        content = await document.read(MAX_DOCUMENT_SIZE_BYTES + 1)
        original_filename = document.filename or "documento-assinado"
        await document.close()

        if not content:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Documento anexado está vazio")
        if len(content) > MAX_DOCUMENT_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail="Termo anexado excede o limite de 12 MB",
            )
        if not self._content_matches_mime(content, document_mime_type):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="O conteudo do documento nao corresponde ao formato informado")

        return {
            "content": content,
            "mime_type": document_mime_type,
            "filename": self._sanitize_document_name(original_filename),
            "size_bytes": len(content),
        }

    async def _generate_validation_code(self, prefix: str) -> str:
        for _ in range(8):
            candidate = f"{prefix}-{uuid4().hex[:12].upper()}"
            if not await self.possessions.has_validation_code(candidate):
                return candidate
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Não foi possível gerar o código público do termo",
        )

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

    def _build_document_storage_paths(self, possession_id: UUID, document_mime_type: str, *, document_kind: str = "loan") -> tuple[str, Path]:
        extension = DOCUMENT_EXTENSIONS[document_mime_type]
        suffix = "" if document_kind == "loan" else f"-{document_kind}"
        relative_path = Path("possession_documents") / f"{possession_id}{suffix}{extension}"
        absolute_path = Path(settings.STORAGE_DIR) / relative_path
        return relative_path.as_posix(), absolute_path

    def _store_file(self, absolute_path: Path, content: bytes) -> None:
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(content)

    def _resolve_photo_path(self, relative_photo_path: str) -> Path:
        return self._resolve_storage_path(relative_photo_path)

    def _resolve_document_path(self, relative_document_path: str) -> Path:
        return self._resolve_storage_path(relative_document_path)

    def _resolve_storage_path(self, relative_path: str) -> Path:
        storage_root = Path(settings.STORAGE_DIR).resolve()
        candidate = (storage_root / Path(relative_path)).resolve()
        try:
            candidate.relative_to(storage_root)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo nao encontrado") from exc
        return candidate

    @staticmethod
    def _content_matches_mime(content: bytes, mime_type: str) -> bool:
        if mime_type == "image/jpeg":
            return content.startswith(b"\xff\xd8\xff")
        if mime_type == "image/png":
            return content.startswith(b"\x89PNG\r\n\x1a\n")
        if mime_type == "image/webp":
            return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
        if mime_type == "application/pdf":
            return content.startswith(b"%PDF-")
        if mime_type == "application/msword":
            return content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
        if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            try:
                with ZipFile(BytesIO(content)) as archive:
                    names = set(archive.namelist())
                return "[Content_Types].xml" in names and "word/document.xml" in names
            except (BadZipFile, OSError):
                return False
        return False

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

    def _build_public_validation_path(self, validation_code: str | None, *, term_type: str) -> str | None:
        if not validation_code:
            return None
        prefix = PUBLIC_RETURN_TERM_PATH_PREFIX if term_type == "return" else PUBLIC_LOAN_TERM_PATH_PREFIX
        return f"{prefix}/{validation_code}"

    def _build_vehicle_description(self, record: VehiclePossession) -> str | None:
        if not record.vehicle:
            return record.vehicle_id and str(record.vehicle_id)

        parts = [record.vehicle.plate]
        vehicle_name = " ".join(filter(None, [record.vehicle.brand, record.vehicle.model])).strip()
        if vehicle_name:
            parts.append(vehicle_name)
        return " - ".join(parts)

    def _mask_document(self, value: str | None) -> str | None:
        if not value:
            return None
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) <= 4:
            return "***"
        return f"{digits[:3]}.***.***-{digits[-2:]}"

    def _serialize(
        self,
        record: VehiclePossession,
        *,
        can_view_location: bool,
        can_view_personal_data: bool,
    ) -> dict:
        stored_photos = list(getattr(record, "photos", []) or [])
        photos = (
            self._serialize_photo_entries(record, can_view_location=can_view_location)
            if can_view_personal_data
            else []
        )
        primary_photo = photos[0] if photos else None
        loan_term_url = f"/api/possession/{record.id}/documents/loan-term" if record.document_path and can_view_personal_data else None
        return_term_url = f"/api/possession/{record.id}/documents/return-term" if record.return_document_path and can_view_personal_data else None
        current_confirmation = next((item for item in getattr(record, "return_confirmations", []) if item.is_current), None)

        return {
            "id": record.id,
            "public_number": record.public_number,
            "vehicle_id": record.vehicle_id,
            "vehicle_plate": record.vehicle.plate if record.vehicle else "",
            "vehicle_brand": record.vehicle.brand if record.vehicle else None,
            "vehicle_model": record.vehicle.model if record.vehicle else None,
            "vehicle_description": self._build_vehicle_description(record),
            "driver_id": record.driver_id if can_view_personal_data else None,
            "driver_name": record.driver_name if can_view_personal_data else "Identidade protegida",
            "driver_document": record.driver_document if can_view_personal_data else self._mask_document(record.driver_document),
            "driver_contact": record.driver_contact if can_view_personal_data else None,
            "start_date": record.start_date,
            "end_date": record.end_date,
            "observation": record.observation if can_view_personal_data else None,
            "start_odometer_km": record.start_odometer_km,
            "end_odometer_km": record.end_odometer_km,
            "kilometers_driven": self._calculate_kilometers_driven(record.start_odometer_km, record.end_odometer_km),
            "created_at": record.created_at,
            "is_active": record.is_active,
            "photo_available": bool(stored_photos),
            "photo_count": len(stored_photos),
            "photo_url": primary_photo["url"] if primary_photo else None,
            "photo_captured_at": primary_photo["captured_at"] if primary_photo else None,
            "photos": photos,
            "loan_term_available": bool(record.document_path),
            "loan_term_name": record.document_name if can_view_personal_data else None,
            "loan_term_url": loan_term_url,
            "loan_term_uploaded_at": record.document_uploaded_at if can_view_personal_data else None,
            "loan_term_validation_code": record.loan_term_validation_code if can_view_personal_data else None,
            "loan_term_public_validation_path": (
                self._build_public_validation_path(record.loan_term_validation_code, term_type="loan")
                if can_view_personal_data
                else None
            ),
            "return_term_available": bool(record.return_document_path),
            "return_term_name": record.return_document_name if can_view_personal_data else None,
            "return_term_url": return_term_url,
            "return_term_uploaded_at": record.return_document_uploaded_at if can_view_personal_data else None,
            "return_term_validation_code": record.return_term_validation_code if can_view_personal_data else None,
            "return_term_public_validation_path": (
                self._build_public_validation_path(record.return_term_validation_code, term_type="return")
                if can_view_personal_data
                else None
            ),
            "return_confirmation_available": current_confirmation is not None,
            "return_confirmation_version": current_confirmation.version if current_confirmation else None,
            "return_confirmation_hash": (
                current_confirmation.canonical_payload_hash
                if current_confirmation and can_view_personal_data
                else None
            ),
            "document_available": bool(record.document_path),
            "document_name": record.document_name if can_view_personal_data else None,
            "document_url": f"/api/possession/{record.id}/document" if record.document_path and can_view_personal_data else None,
            "document_uploaded_at": record.document_uploaded_at if can_view_personal_data else None,
            "capture_location": primary_photo["capture_location"] if primary_photo else None,
            "signature_summary": None,
        }

    async def _serialize_with_signatures(
        self,
        record: VehiclePossession,
        *,
        can_view_location: bool,
        can_view_personal_data: bool,
        current_user: User | None,
    ) -> dict:
        payload = self._serialize(
            record,
            can_view_location=can_view_location,
            can_view_personal_data=can_view_personal_data,
        )
        signature_summary = await self._build_possession_signature_summary(record, current_user=current_user)
        payload["signature_summary"] = self._sanitize_signature_summaries(
            signature_summary,
            can_view_personal_data=can_view_personal_data,
        )
        return payload

    async def _build_possession_signature_summary(
        self,
        record: VehiclePossession,
        *,
        current_user: User | None,
    ) -> dict:
        service = DocumentSignatureService(self.db)
        responsibility = (
            await service.get_validated_summary_for_source(
                DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
                record.id,
                current_user=current_user,
                supersede_stale=False,
            )
            if current_user is not None
            else await service.get_summary_for_source(
                DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
                record.id,
            )
        )
        return {
            "responsibility": responsibility,
            "loan": await service.get_summary_for_source(DigitalDocumentType.POSSESSION_LOAN_TERM, record.id),
            "return": await service.get_summary_for_source(DigitalDocumentType.POSSESSION_RETURN_TERM, record.id),
        }

    def _sanitize_signature_summaries(self, summaries: dict, *, can_view_personal_data: bool) -> dict:
        return {
            key: self._sanitize_signature_summary(value, can_view_personal_data=can_view_personal_data)
            for key, value in summaries.items()
        }

    def _sanitize_signature_summary(self, summary: dict, *, can_view_personal_data: bool) -> dict:
        if can_view_personal_data:
            return summary
        return DocumentSignatureService.sanitize_summary_for_restricted_view(summary)

    def _serialize_public_term(self, record: VehiclePossession, *, term_type: str) -> dict:
        validation_code = (
            record.return_term_validation_code
            if term_type == "return"
            else record.loan_term_validation_code
        )
        return {
            "term_type": term_type,
            "validation_code": validation_code,
            "public_validation_path": self._build_public_validation_path(validation_code, term_type=term_type),
            "possession_id": record.id,
            "vehicle_plate": record.vehicle.plate if record.vehicle else "",
            "vehicle_brand": record.vehicle.brand if record.vehicle else None,
            "vehicle_model": record.vehicle.model if record.vehicle else None,
            "vehicle_description": self._build_vehicle_description(record),
            "driver_name": record.driver_name,
            "driver_document_masked": self._mask_document(record.driver_document),
            "start_date": record.start_date,
            "end_date": record.end_date,
            "start_odometer_km": record.start_odometer_km,
            "end_odometer_km": record.end_odometer_km,
            "kilometers_driven": self._calculate_kilometers_driven(record.start_odometer_km, record.end_odometer_km),
            "observation": record.observation,
            "created_at": record.created_at,
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
        return bool(current_user and current_user.role in {UserRole.ADMIN, UserRole.PRODUCAO})

    def _can_view_personal_data(self, current_user: User | None) -> bool:
        return bool(current_user and current_user.role in {UserRole.ADMIN, UserRole.PRODUCAO})
