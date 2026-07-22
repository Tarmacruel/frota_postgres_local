from __future__ import annotations

import logging
from hashlib import sha256
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
from app.models.claim import Claim, ClaimStatus, ClaimType
from app.models.claim_attachment import ClaimAttachment
from app.models.user import User
from app.models.vehicle import VehicleStatus
from app.repositories.claim_repository import ClaimRepository
from app.repositories.driver_repository import DriverRepository
from app.repositories.possession_repository import PossessionRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.claim import ClaimCreate, ClaimUpdate
from app.schemas.common import PaginatedResponse, build_pagination
from app.services.audit_service import AuditService


MAX_CLAIM_ATTACHMENTS = 20
MAX_ATTACHMENT_BATCH_SIZE_BYTES = 50 * 1024 * 1024
MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024
MAX_DOCUMENT_SIZE_BYTES = 12 * 1024 * 1024
ATTACHMENT_EXTENSIONS = {
    "application/msword": ".doc",
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
ATTACHMENT_FILENAME_EXTENSIONS = {
    "application/msword": {".doc"},
    "application/pdf": {".pdf"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
}
INLINE_ATTACHMENT_MIME_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp"}
ATTACHMENT_MIME_ALIASES = {"image/jpg": "image/jpeg"}
ATTACHMENT_MIME_BY_EXTENSION = {
    extension: mime_type
    for mime_type, extensions in ATTACHMENT_FILENAME_EXTENSIONS.items()
    for extension in extensions
}

logger = logging.getLogger(__name__)


class ClaimService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.claims = ClaimRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.possessions = PossessionRepository(db)
        self.audit = AuditService(db)

    async def list(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        organization_id: UUID | None = None,
        status_filter: ClaimStatus | None = None,
        tipo: ClaimType | None = None,
        search: str | None = None,
        current_user: User | None = None,
    ) -> PaginatedResponse[dict]:
        if production_scope_is_empty(current_user):
            return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

        organization_id = scoped_organization_id(current_user, organization_id)
        items, total = await self.claims.list_paginated(
            page=page,
            limit=limit,
            vehicle_id=vehicle_id,
            organization_id=organization_id,
            status=status_filter,
            tipo=tipo,
            search=search,
        )
        return PaginatedResponse[dict](data=[self._serialize(item) for item in items], pagination=build_pagination(page, limit, total))

    async def get(self, claim_id: UUID, current_user: User | None = None) -> dict:
        claim = await self.claims.get_by_id(claim_id)
        if not claim:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sinistro não encontrado")
        await self._ensure_vehicle_visible_to_user(claim.vehicle_id, current_user)
        return self._serialize(claim)

    async def create(
        self,
        data: ClaimCreate,
        current_user: User,
        attachments: list[UploadFile] | None = None,
    ) -> dict:
        vehicle = await self._require_vehicle_for_claim(data.vehicle_id, current_user=current_user)
        driver = await self._require_driver_if_needed(data.driver_id, data.data_ocorrencia, data.vehicle_id)
        await self._validate_closed_claim(data.status, data.valor_estimado, data.justificativa_encerramento)
        attachment_payloads = await self._read_and_validate_attachments(attachments or [], current_count=0)

        claim = Claim(
            vehicle_id=data.vehicle_id,
            driver_id=driver.id if driver else None,
            data_ocorrencia=data.data_ocorrencia,
            tipo=data.tipo,
            descricao=data.descricao,
            local=data.local,
            boletim_ocorrencia=data.boletim_ocorrencia,
            valor_estimado=data.valor_estimado,
            status=data.status,
            justificativa_encerramento=data.justificativa_encerramento,
            anexos=data.anexos,
            created_by=current_user.id,
        )

        stored_paths: list[Path] = []
        try:
            await self.claims.create(claim)
            attachment_records = self._store_attachment_payloads(
                claim_id=claim.id,
                payloads=attachment_payloads,
                uploaded_by=current_user.id,
                stored_paths=stored_paths,
            )
            if attachment_records:
                await self.db.flush()
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="CLAIM",
                entity_id=claim.id,
                entity_label=f"{vehicle.plate} - {claim.tipo.value}",
                details=self._serialize(claim, attachments=attachment_records),
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_files(stored_paths)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível registrar o sinistro") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_files(stored_paths)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Não foi possível armazenar os anexos do sinistro",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_files(stored_paths)
            raise
        return await self.get(claim.id, current_user=current_user)

    async def update(
        self,
        claim_id: UUID,
        data: ClaimUpdate,
        current_user: User,
        attachments: list[UploadFile] | None = None,
        removed_attachment_ids: list[UUID] | None = None,
    ) -> dict:
        claim = await self.claims.get_by_id_for_update(claim_id)
        if not claim:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sinistro não encontrado")

        await self._ensure_vehicle_visible_to_user(claim.vehicle_id, current_user)

        payload = data.model_dump(exclude_unset=True)
        next_vehicle_id = claim.vehicle_id
        next_driver_id = payload["driver_id"] if "driver_id" in payload else claim.driver_id
        next_data_ocorrencia = payload["data_ocorrencia"] if "data_ocorrencia" in payload else claim.data_ocorrencia
        next_status = payload["status"] if "status" in payload else claim.status
        next_valor = payload["valor_estimado"] if "valor_estimado" in payload else claim.valor_estimado
        next_justificativa = payload["justificativa_encerramento"] if "justificativa_encerramento" in payload else claim.justificativa_encerramento

        await self._require_vehicle_for_claim(next_vehicle_id, current_user=current_user)
        driver = await self._require_driver_if_needed(next_driver_id, next_data_ocorrencia, next_vehicle_id)
        await self._validate_closed_claim(next_status, next_valor, next_justificativa)

        attachments_by_id = {attachment.id: attachment for attachment in claim.attachments}
        requested_removals = set(removed_attachment_ids or [])
        missing_attachment_ids = requested_removals.difference(attachments_by_id)
        if missing_attachment_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Um dos anexos informados não foi encontrado")

        removed_attachments = [attachments_by_id[attachment_id] for attachment_id in requested_removals]
        remaining_attachments = [
            attachment for attachment in claim.attachments if attachment.id not in requested_removals
        ]
        attachment_payloads = await self._read_and_validate_attachments(
            attachments or [],
            current_count=len(remaining_attachments),
        )
        removed_paths = [self._resolve_storage_path(attachment.storage_path) for attachment in removed_attachments]

        before = self._serialize(claim)
        for field, value in payload.items():
            setattr(claim, field, value)
        claim.driver_id = driver.id if driver else None

        stored_paths: list[Path] = []
        try:
            new_attachment_records = self._store_attachment_payloads(
                claim_id=claim.id,
                payloads=attachment_payloads,
                uploaded_by=current_user.id,
                stored_paths=stored_paths,
            )
            for attachment in removed_attachments:
                await self.db.delete(attachment)
            await self.db.flush()

            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="CLAIM",
                entity_id=claim.id,
                entity_label=f"{claim.vehicle.plate if claim.vehicle else claim.vehicle_id} - {claim.tipo.value}",
                details={
                    "before": before,
                    "after": self._serialize(
                        claim,
                        attachments=[*remaining_attachments, *new_attachment_records],
                    ),
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            self._cleanup_files(stored_paths)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível atualizar o sinistro") from exc
        except OSError as exc:
            await self.db.rollback()
            self._cleanup_files(stored_paths)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Não foi possível armazenar os anexos do sinistro",
            ) from exc
        except Exception:
            await self.db.rollback()
            self._cleanup_files(stored_paths)
            raise

        self._cleanup_files(removed_paths)
        return await self.get(claim.id, current_user=current_user)

    async def get_attachment_file(
        self,
        claim_id: UUID,
        attachment_id: UUID,
        current_user: User | None = None,
        *,
        download: bool = False,
    ) -> FileResponse:
        claim = await self.claims.get_by_id(claim_id)
        if not claim:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sinistro não encontrado")
        await self._ensure_vehicle_visible_to_user(claim.vehicle_id, current_user)

        attachment = next((item for item in claim.attachments if item.id == attachment_id), None)
        if not attachment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anexo não encontrado")

        absolute_path = self._resolve_storage_path(attachment.storage_path)
        if not absolute_path.is_file():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo do anexo não encontrado")

        content_disposition_type = (
            "attachment"
            if download or attachment.mime_type not in INLINE_ATTACHMENT_MIME_TYPES
            else "inline"
        )
        return FileResponse(
            absolute_path,
            media_type=attachment.mime_type,
            filename=attachment.original_filename,
            content_disposition_type=content_disposition_type,
            headers={
                "Cache-Control": "private, no-store, max-age=0",
                "X-Content-Type-Options": "nosniff",
            },
        )

    async def _require_vehicle_for_claim(self, vehicle_id: UUID, current_user: User | None = None):
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
        await self._ensure_vehicle_visible_to_user(vehicle_id, current_user)
        if vehicle.status not in {VehicleStatus.ATIVO, VehicleStatus.MANUTENCAO}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sinistros só podem ser registrados para veículos ativos ou em manutenção",
            )
        return vehicle

    async def _ensure_vehicle_visible_to_user(self, vehicle_id: UUID, current_user: User | None) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
            return
        if not await self.vehicles.is_vehicle_in_organization(vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

    async def _require_driver_if_needed(self, driver_id: UUID | None, occurred_at, vehicle_id: UUID):
        if not driver_id:
            return None
        driver = await self.drivers.get_by_id(driver_id)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")
        if not await self.possessions.driver_had_vehicle_at(vehicle_id=vehicle_id, driver_id=driver_id, occurred_at=occurred_at):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Condutor informado não possuía posse ativa deste veículo na data do sinistro",
            )
        return driver

    async def _validate_closed_claim(self, claim_status: ClaimStatus, valor, justificativa: str | None) -> None:
        if claim_status == ClaimStatus.ENCERRADO and valor is None and not justificativa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sinistro encerrado exige valor estimado ou justificativa",
            )

    async def _read_and_validate_attachments(
        self,
        attachments: list[UploadFile],
        *,
        current_count: int,
    ) -> list[dict]:
        uploads = [attachment for attachment in attachments if attachment is not None]
        if current_count + len(uploads) > MAX_CLAIM_ATTACHMENTS:
            await self._close_uploads(uploads)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cada sinistro pode ter no máximo {MAX_CLAIM_ATTACHMENTS} anexos",
            )

        payloads: list[dict] = []
        batch_size = 0
        try:
            for upload in uploads:
                mime_type = self._normalize_attachment_mime_type(upload)
                if mime_type not in ATTACHMENT_EXTENSIONS:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Anexos devem estar em PDF, JPG, PNG, WEBP, DOC ou DOCX",
                    )

                size_limit = MAX_IMAGE_SIZE_BYTES if mime_type.startswith("image/") else MAX_DOCUMENT_SIZE_BYTES
                content = await upload.read(size_limit + 1)
                if not content:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Um dos anexos enviados está vazio")
                if len(content) > size_limit:
                    limit_mb = size_limit // (1024 * 1024)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"O arquivo {upload.filename or 'anexo'} excede o limite de {limit_mb} MB",
                    )
                if not self._content_matches_mime(content, mime_type):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"O conteúdo de {upload.filename or 'um anexo'} não corresponde ao formato informado",
                    )

                batch_size += len(content)
                if batch_size > MAX_ATTACHMENT_BATCH_SIZE_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="O conjunto de anexos excede o limite de 50 MB por envio",
                    )

                payloads.append(
                    {
                        "content": content,
                        "mime_type": mime_type,
                        "filename": self._sanitize_attachment_name(upload.filename or "anexo", mime_type),
                        "size_bytes": len(content),
                        "sha256": sha256(content).hexdigest(),
                    }
                )
        finally:
            await self._close_uploads(uploads)
        return payloads

    @staticmethod
    async def _close_uploads(uploads: list[UploadFile]) -> None:
        for upload in uploads:
            try:
                await upload.close()
            except Exception:
                continue

    def _store_attachment_payloads(
        self,
        *,
        claim_id: UUID,
        payloads: list[dict],
        uploaded_by: UUID,
        stored_paths: list[Path],
    ) -> list[ClaimAttachment]:
        records: list[ClaimAttachment] = []
        for payload in payloads:
            attachment_id = uuid4()
            relative_path, absolute_path = self._build_attachment_storage_paths(
                claim_id,
                attachment_id,
                payload["mime_type"],
            )
            self._store_file(absolute_path, payload["content"])
            stored_paths.append(absolute_path)
            record = ClaimAttachment(
                id=attachment_id,
                claim_id=claim_id,
                original_filename=payload["filename"],
                storage_path=relative_path,
                mime_type=payload["mime_type"],
                size_bytes=payload["size_bytes"],
                sha256=payload["sha256"],
                uploaded_by=uploaded_by,
            )
            self.db.add(record)
            records.append(record)
        return records

    def _build_attachment_storage_paths(
        self,
        claim_id: UUID,
        attachment_id: UUID,
        mime_type: str,
    ) -> tuple[str, Path]:
        extension = ATTACHMENT_EXTENSIONS[mime_type]
        relative_path = Path("claim_attachments") / str(claim_id) / f"{attachment_id}{extension}"
        absolute_path = Path(settings.STORAGE_DIR) / relative_path
        return relative_path.as_posix(), absolute_path

    def _resolve_storage_path(self, relative_path: str) -> Path:
        storage_root = Path(settings.STORAGE_DIR).resolve()
        candidate = (storage_root / Path(relative_path)).resolve()
        try:
            candidate.relative_to(storage_root)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Arquivo do anexo não encontrado") from exc
        return candidate

    @staticmethod
    def _store_file(absolute_path: Path, content: bytes) -> None:
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        stored_file = absolute_path.open("xb")
        try:
            with stored_file:
                stored_file.write(content)
        except OSError:
            try:
                absolute_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    @staticmethod
    def _cleanup_file(absolute_path: Path | None) -> None:
        if not absolute_path:
            return
        try:
            if absolute_path.is_file():
                absolute_path.unlink()
        except OSError as exc:
            logger.warning("Não foi possível remover arquivo de anexo em %s: %s", absolute_path, exc)

    def _cleanup_files(self, absolute_paths: list[Path]) -> None:
        for absolute_path in absolute_paths:
            self._cleanup_file(absolute_path)

    @staticmethod
    def _sanitize_attachment_name(filename: str, mime_type: str) -> str:
        basename = filename.replace("\\", "/").rsplit("/", 1)[-1]
        sanitized = sub(r"[\x00-\x1f\x7f<>:\"/\\|?*]", "_", basename).strip(" .")
        if not sanitized:
            sanitized = "anexo"

        current_suffix = Path(sanitized).suffix.lower()
        expected_suffix = ATTACHMENT_EXTENSIONS[mime_type]
        if current_suffix not in ATTACHMENT_FILENAME_EXTENSIONS[mime_type]:
            stem = Path(sanitized).stem if current_suffix else sanitized
            sanitized = f"{stem.rstrip(' ._') or 'anexo'}{expected_suffix}"

        max_length = 180
        if len(sanitized) > max_length:
            suffix = Path(sanitized).suffix
            sanitized = f"{Path(sanitized).stem[: max_length - len(suffix)]}{suffix}"
        return sanitized

    @staticmethod
    def _normalize_attachment_mime_type(upload: UploadFile) -> str:
        supplied = (upload.content_type or "").split(";", 1)[0].strip().lower()
        supplied = ATTACHMENT_MIME_ALIASES.get(supplied, supplied)
        if supplied in ATTACHMENT_EXTENSIONS:
            return supplied
        if supplied in {"", "application/octet-stream"}:
            suffix = Path(upload.filename or "").suffix.lower()
            return ATTACHMENT_MIME_BY_EXTENSION.get(suffix, supplied)
        return supplied

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

    @staticmethod
    def _serialize_attachment(attachment: ClaimAttachment) -> dict:
        return {
            "id": attachment.id,
            "filename": attachment.original_filename,
            "mime_type": attachment.mime_type,
            "size_bytes": attachment.size_bytes,
            "kind": "PHOTO" if attachment.mime_type.startswith("image/") else "DOCUMENT",
            "created_at": attachment.created_at,
        }

    def _serialize(
        self,
        claim: Claim,
        *,
        attachments: list[ClaimAttachment] | None = None,
    ) -> dict:
        attachment_records = attachments if attachments is not None else claim.attachments
        return {
            "id": claim.id,
            "vehicle_id": claim.vehicle_id,
            "vehicle_plate": claim.vehicle.plate if claim.vehicle else "",
            "driver_id": claim.driver_id,
            "driver_name": claim.driver.nome_completo if claim.driver else None,
            "data_ocorrencia": claim.data_ocorrencia,
            "tipo": claim.tipo,
            "descricao": claim.descricao,
            "local": claim.local,
            "boletim_ocorrencia": claim.boletim_ocorrencia,
            "valor_estimado": claim.valor_estimado,
            "status": claim.status,
            "justificativa_encerramento": claim.justificativa_encerramento,
            "anexos": claim.anexos,
            "attachments": [self._serialize_attachment(attachment) for attachment in attachment_records],
            "created_by": claim.created_by,
            "created_at": claim.created_at,
            "updated_at": claim.updated_at,
        }
