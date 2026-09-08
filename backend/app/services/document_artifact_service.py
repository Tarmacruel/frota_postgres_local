from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.document_signature import (
    DigitalDocument,
    DigitalDocumentArtifact,
    DigitalDocumentArtifactType,
    DigitalDocumentType,
    DocumentSignatureMethod,
)
from app.models.user import User
from app.repositories.document_artifact_repository import (
    DocumentArtifactRepository,
    DocumentSignatureValidationRepository,
    HomologationSigningTargetRepository,
)
from app.services.audit_service import AuditService


CANONICAL_ARTIFACT_DOCUMENT_TYPES = frozenset(
    {
        DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
        DigitalDocumentType.FUEL_SUPPLY_ORDER,
    }
)
HISTORICAL_POSSESSION_DOCUMENT_TYPES = frozenset(
    {
        DigitalDocumentType.POSSESSION_LOAN_TERM,
        DigitalDocumentType.POSSESSION_RETURN_TERM,
    }
)


class DocumentArtifactService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.artifacts = DocumentArtifactRepository(db)
        self.validations = DocumentSignatureValidationRepository(db)
        self.homologation_targets = HomologationSigningTargetRepository(db)
        self.audit = AuditService(db)

    async def ensure_canonical_artifact(
        self,
        document: DigitalDocument,
        *,
        current_user: User,
    ) -> DigitalDocumentArtifact:
        if not settings.CANONICAL_DOCUMENT_ARTIFACTS_ENABLED:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "CANONICAL_ARTIFACTS_DISABLED",
                    "message": "Artefatos canônicos ainda não estão habilitados.",
                },
            )
        if document.document_type in HISTORICAL_POSSESSION_DOCUMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "HISTORICAL_CANONICAL_SOURCE_INSUFFICIENT",
                    "message": (
                        "O registro histórico não possui hash de origem nem preservação imutável dos bytes "
                        "e da declaração integral original; ele não pode ser promovido a artefato canônico "
                        "para assinatura."
                    ),
                },
            )
        if document.document_type not in CANONICAL_ARTIFACT_DOCUMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "CANONICAL_ARTIFACT_NOT_SUPPORTED",
                    "message": "O tipo de documento não possui um gerador canônico versionado.",
                },
            )

        target = await self.homologation_targets.get_active(
            document_type=document.document_type,
            source_type=document.source_type,
            source_id=document.source_id,
        )
        existing = await self.artifacts.get_latest(
            document_id=document.id,
            artifact_type=DigitalDocumentArtifactType.CANONICAL_PDF,
            for_update=True,
        )
        if existing is not None:
            if existing.source_content_hash != document.content_hash:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "CANONICAL_ARTIFACT_SOURCE_MISMATCH",
                        "message": "O artefato pertence a outra versão do conteúdo.",
                    },
                )
            self._verify_artifact_file(existing)
            # A copied production artifact must never become the signing base in
            # homologation without the visible watermark. Keep the old bytes as
            # evidence and append a new immutable canonical revision.
            existing_metadata = existing.artifact_metadata or {}
            target_matches = (
                bool(existing_metadata.get("homologation_watermark"))
                and existing_metadata.get("homologation_target_id") == str(target.id)
            ) if target is not None else True
            if target_matches:
                return existing

        pdf_bytes, artifact_metadata = self._render_canonical_pdf(
            document,
            homologation_watermark=target is not None,
        )
        if target is not None:
            artifact_metadata["homologation_target_id"] = str(target.id)
        content_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
        version = (existing.version + 1) if existing is not None else 1
        relative_path = (
            Path(str(document.id))
            / f"canonical-v{version}-{content_sha256}.pdf"
        )
        absolute_path = self._resolve_artifact_path(relative_path)
        self._write_once(absolute_path, pdf_bytes, expected_sha256=content_sha256)

        artifact = DigitalDocumentArtifact(
            document_id=document.id,
            artifact_type=DigitalDocumentArtifactType.CANONICAL_PDF,
            version=version,
            source_content_hash=document.content_hash,
            content_sha256=content_sha256,
            media_type="application/pdf",
            storage_path=relative_path.as_posix(),
            size_bytes=len(pdf_bytes),
            artifact_metadata=artifact_metadata,
            created_by_user_id=current_user.id,
        )
        self.artifacts.add(artifact)
        await self.db.flush()
        await self.audit.record(
            actor=current_user,
            action="CREATE_CANONICAL_ARTIFACT",
            entity_type="DIGITAL_DOCUMENT",
            entity_id=document.id,
            entity_label=document.title,
            details={
                "artifact_id": str(artifact.id),
                "artifact_type": artifact.artifact_type,
                "source_content_hash": artifact.source_content_hash,
                "content_sha256": artifact.content_sha256,
                "size_bytes": artifact.size_bytes,
                "homologation_watermark": target is not None,
            },
        )
        return artifact

    @staticmethod
    def supports_canonical_artifact(document_type: str) -> bool:
        return document_type in CANONICAL_ARTIFACT_DOCUMENT_TYPES

    @staticmethod
    def _render_canonical_pdf(
        document: DigitalDocument,
        *,
        homologation_watermark: bool,
    ) -> tuple[bytes, dict]:
        if document.document_type == DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM:
            from app.services.possession_term_pdf_service import PossessionTermPdfService

            content = PossessionTermPdfService.build_canonical_delivery_pdf(
                document.snapshot,
                content_hash=document.content_hash,
                homologation_watermark=homologation_watermark,
            )
            metadata = {
                "schema_version": "canonical-possession-delivery.v1",
                "scope": document.snapshot.get("scope"),
            }
        elif document.document_type == DigitalDocumentType.FUEL_SUPPLY_ORDER:
            from app.services.fuel_supply_order_pdf_service import (
                FUEL_SUPPLY_ORDER_CANONICAL_SCHEMA,
                FuelSupplyOrderPdfService,
            )

            content = FuelSupplyOrderPdfService.build_canonical_pdf(
                document.snapshot,
                content_hash=document.content_hash,
                homologation_watermark=homologation_watermark,
            )
            metadata = {
                "schema_version": FUEL_SUPPLY_ORDER_CANONICAL_SCHEMA,
                "scope": "FUEL_SUPPLY_ORDER_AUTHORIZATION",
            }
        else:  # pragma: no cover - guarded by supports_canonical_artifact
            raise ValueError("Tipo de documento sem renderizador canônico")

        metadata.update(
            {
                "deterministic": True,
                "homologation_watermark": homologation_watermark,
            }
        )
        return content, metadata

    async def get_artifact_for_download(
        self,
        *,
        document_id: UUID,
        artifact_type: str,
    ) -> tuple[DigitalDocumentArtifact, Path]:
        normalized_type = artifact_type.strip().upper()
        if normalized_type not in {
            DigitalDocumentArtifactType.CANONICAL_PDF,
            DigitalDocumentArtifactType.CERTIFIED_PDF,
        }:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artefato não encontrado")
        artifact = await self.artifacts.get_latest(
            document_id=document_id,
            artifact_type=normalized_type,
        )
        if artifact is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artefato não encontrado")
        absolute_path = self._verify_artifact_file(artifact)
        return artifact, absolute_path

    def read_verified_bytes(self, artifact: DigitalDocumentArtifact) -> bytes:
        """Read an immutable artifact only after checking its recorded hash and size."""
        return self._verify_artifact_file(artifact).read_bytes()

    async def store_certified_artifact(
        self,
        *,
        document: DigitalDocument,
        based_on: DigitalDocumentArtifact,
        signed_pdf: bytes,
        current_user: User,
        metadata: dict | None = None,
    ) -> DigitalDocumentArtifact:
        """Append a certified PDF revision without replacing prior evidence."""
        if not signed_pdf.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="O resultado certificado nÃ£o Ã© um PDF vÃ¡lido",
            )
        if based_on.document_id != document.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="O artefato base nÃ£o pertence ao documento",
            )
        latest = await self.artifacts.get_latest(
            document_id=document.id,
            artifact_type=DigitalDocumentArtifactType.CERTIFIED_PDF,
            for_update=True,
        )
        version = (latest.version + 1) if latest is not None else 1
        content_sha256 = hashlib.sha256(signed_pdf).hexdigest()
        relative_path = Path(str(document.id)) / f"certified-v{version}-{content_sha256}.pdf"
        absolute_path = self._resolve_artifact_path(relative_path)
        self._write_once(absolute_path, signed_pdf, expected_sha256=content_sha256)
        artifact = DigitalDocumentArtifact(
            document_id=document.id,
            artifact_type=DigitalDocumentArtifactType.CERTIFIED_PDF,
            version=version,
            source_content_hash=document.content_hash,
            content_sha256=content_sha256,
            media_type="application/pdf",
            storage_path=relative_path.as_posix(),
            size_bytes=len(signed_pdf),
            certified_from_artifact_id=based_on.id,
            artifact_metadata={
                "schema_version": "icp-brasil-pades-ad-rt.v1",
                "immutable": True,
                **(metadata or {}),
                "homologation_watermark": bool(
                    (based_on.artifact_metadata or {}).get("homologation_watermark")
                ),
                "homologation_target_id": (based_on.artifact_metadata or {}).get(
                    "homologation_target_id"
                ),
            },
            created_by_user_id=current_user.id,
        )
        try:
            self.artifacts.add(artifact)
            await self.db.flush()
            await self.audit.record(
                actor=current_user,
                action="CREATE_CERTIFIED_ARTIFACT",
                entity_type="DIGITAL_DOCUMENT",
                entity_id=document.id,
                entity_label=document.title,
                details={
                    "artifact_id": str(artifact.id),
                    "based_on_artifact_id": str(based_on.id),
                    "version": version,
                    "content_sha256": content_sha256,
                    "size_bytes": len(signed_pdf),
                },
            )
        except Exception:
            await self.db.rollback()
            await self.discard_uncommitted_artifact_file(artifact)
            raise
        return artifact

    async def discard_uncommitted_artifact_file(
        self, artifact: DigitalDocumentArtifact
    ) -> bool:
        """Compensate a rolled-back append without touching referenced evidence."""
        referenced = await self.artifacts.get_by_storage_path(artifact.storage_path)
        if referenced is not None:
            return False
        absolute_path = self._resolve_artifact_path(artifact.storage_path)
        if not absolute_path.exists():
            return False
        if not absolute_path.is_file() or absolute_path.is_symlink():
            raise RuntimeError("O caminho do artefato nÃ£o confirmado nÃ£o Ã© um arquivo regular")
        payload = absolute_path.read_bytes()
        if (
            not hmac.compare_digest(hashlib.sha256(payload).hexdigest(), artifact.content_sha256)
            or len(payload) != artifact.size_bytes
        ):
            raise RuntimeError("O arquivo nÃ£o confirmado diverge do artefato esperado")
        absolute_path.unlink()
        try:
            absolute_path.parent.rmdir()
        except OSError:
            pass
        return True

    async def reconcile_orphaned_certified_files(
        self, *, minimum_age_seconds: int = 3600
    ) -> list[str]:
        """Delete only old, hash-self-identifying certified files absent from the DB."""
        if minimum_age_seconds < 300:
            raise ValueError("A reconciliaÃ§Ã£o exige janela de seguranÃ§a de ao menos 300 segundos")
        root = self._artifact_root()
        if not root.is_dir():
            return []
        referenced_paths = await self.artifacts.list_storage_paths()
        filename_pattern = re.compile(r"^certified-v[1-9][0-9]*-([0-9a-f]{64})\.pdf$")
        uuid_directory_pattern = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
        )
        cutoff = time.time() - minimum_age_seconds
        removed: list[str] = []
        for directory in root.iterdir():
            if (
                directory.is_symlink()
                or not directory.is_dir()
                or uuid_directory_pattern.fullmatch(directory.name.lower()) is None
            ):
                continue
            for candidate in directory.iterdir():
                match = filename_pattern.fullmatch(candidate.name)
                if match is None or candidate.is_symlink() or not candidate.is_file():
                    continue
                relative = candidate.relative_to(root).as_posix()
                if relative in referenced_paths or candidate.stat().st_mtime > cutoff:
                    continue
                if not hmac.compare_digest(
                    hashlib.sha256(candidate.read_bytes()).hexdigest(), match.group(1)
                ):
                    continue
                candidate.unlink()
                removed.append(relative)
            try:
                directory.rmdir()
            except OSError:
                pass
        return removed

    async def build_validation_summary(self, document: DigitalDocument) -> dict:
        artifacts = await self.artifacts.list_for_document(document.id)
        validations = await self.validations.list_for_document(document.id)
        counts: dict[str, int] = {}
        for signature in document.signatures:
            method = signature.signature_method or DocumentSignatureMethod.INTERNAL_PASSWORD
            counts[method] = counts.get(method, 0) + 1
        return {
            "document_id": document.id,
            "document_type": document.document_type,
            "document_status": document.status,
            "content_hash": document.content_hash,
            "signature_counts_by_method": counts,
            "artifacts": [self.serialize_artifact(item) for item in artifacts],
            "validations": [
                {
                    "id": item.id,
                    "signature_id": item.signature_id,
                    "artifact_id": item.artifact_id,
                    "status": item.status,
                    "validator": item.validator,
                    "policy_oid": item.policy_oid,
                    "certificate_fingerprint": item.certificate_fingerprint,
                    "timestamped_at": item.timestamped_at,
                    "validated_at": item.validated_at,
                }
                for item in validations
            ],
            "certificate_signing_enabled": settings.CERTIFICATE_SIGNING_ENABLED,
        }

    async def ensure_certificate_signing_allowed(self, document: DigitalDocument) -> None:
        """Fail closed until the future PAdES endpoint has passed every gate."""
        if not settings.CERTIFICATE_SIGNING_ENABLED:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={
                    "code": "CERTIFICATE_SIGNING_DISABLED",
                    "message": "Assinatura por certificado ainda não está habilitada.",
                },
            )
        if not settings.HOMOLOGATION_CERTIFICATE_TARGETS_ONLY:
            return
        target = await self.homologation_targets.get_active(
            document_type=document.document_type,
            source_type=document.source_type,
            source_id=document.source_id,
        )
        if target is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "HOMOLOGATION_SIGNING_TARGET_REQUIRED",
                    "message": "Somente registros sintéticos autorizados podem ser assinados neste ambiente.",
                },
            )

    @staticmethod
    def serialize_artifact(artifact: DigitalDocumentArtifact) -> dict:
        segment = (
            "canonical"
            if artifact.artifact_type == DigitalDocumentArtifactType.CANONICAL_PDF
            else "certified"
        )
        return {
            "id": artifact.id,
            "artifact_type": artifact.artifact_type,
            "version": artifact.version,
            "source_content_hash": artifact.source_content_hash,
            "content_sha256": artifact.content_sha256,
            "media_type": artifact.media_type,
            "size_bytes": artifact.size_bytes,
            "created_at": artifact.created_at,
            "download_path": f"/api/documents/{artifact.document_id}/artifacts/{segment}",
        }

    @staticmethod
    def _artifact_root() -> Path:
        configured = settings.DIGITAL_DOCUMENT_ARTIFACTS_DIR
        root = Path(configured) if configured else Path(settings.STORAGE_DIR) / "digital_document_artifacts"
        return root.resolve()

    def _resolve_artifact_path(self, relative_path: Path | str) -> Path:
        root = self._artifact_root()
        candidate = (root / Path(relative_path)).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Caminho de artefato inválido",
            ) from exc
        return candidate

    def _verify_artifact_file(self, artifact: DigitalDocumentArtifact) -> Path:
        absolute_path = self._resolve_artifact_path(artifact.storage_path)
        if not absolute_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "DOCUMENT_ARTIFACT_MISSING",
                    "message": "O arquivo probatório não está disponível no armazenamento.",
                },
            )
        content = absolute_path.read_bytes()
        actual_hash = hashlib.sha256(content).hexdigest()
        if actual_hash != artifact.content_sha256 or len(content) != artifact.size_bytes:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "DOCUMENT_ARTIFACT_INTEGRITY_FAILURE",
                    "message": "A integridade do arquivo probatório não pôde ser confirmada.",
                },
            )
        return absolute_path

    @staticmethod
    def _write_once(path: Path, content: bytes, *, expected_sha256: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected_sha256:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Colisão de caminho no armazenamento imutável",
                )
            return

        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            try:
                os.rename(temporary, path)
            except FileExistsError:
                if hashlib.sha256(path.read_bytes()).hexdigest() != expected_sha256:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Colisão de caminho no armazenamento imutável",
                    )
        finally:
            temporary.unlink(missing_ok=True)
