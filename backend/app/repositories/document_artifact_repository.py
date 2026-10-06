from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document_signature import (
    CertificateSigningSession,
    CertificateSigningSessionStatus,
    DigitalDocumentArtifact,
    DocumentSignatureValidation,
    HomologationSigningTarget,
    SignatureAgentDevice,
    SignatureAgentDeviceStatus,
    SignatureAgentPairing,
    SignatureAgentPairingStatus,
    SignatureAgentRequestNonce,
)


class DocumentArtifactRepository:
    """Read and append immutable document evidence.

    This repository intentionally exposes no update or delete operation. Artifact
    versions are append-only and their database foreign keys use RESTRICT.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, artifact_id: UUID) -> DigitalDocumentArtifact | None:
        result = await self.db.execute(
            select(DigitalDocumentArtifact).where(DigitalDocumentArtifact.id == artifact_id)
        )
        return result.scalar_one_or_none()

    async def get_latest(
        self,
        *,
        document_id: UUID,
        artifact_type: str,
        for_update: bool = False,
    ) -> DigitalDocumentArtifact | None:
        statement = (
            select(DigitalDocumentArtifact)
            .where(
                DigitalDocumentArtifact.document_id == document_id,
                DigitalDocumentArtifact.artifact_type == artifact_type,
            )
            .order_by(
                DigitalDocumentArtifact.version.desc(),
                DigitalDocumentArtifact.created_at.desc(),
            )
            .limit(1)
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def list_for_document(self, document_id: UUID) -> list[DigitalDocumentArtifact]:
        result = await self.db.execute(
            select(DigitalDocumentArtifact)
            .where(DigitalDocumentArtifact.document_id == document_id)
            .order_by(
                DigitalDocumentArtifact.artifact_type.asc(),
                DigitalDocumentArtifact.version.asc(),
            )
        )
        return list(result.scalars().all())

    async def get_by_storage_path(self, storage_path: str) -> DigitalDocumentArtifact | None:
        result = await self.db.execute(
            select(DigitalDocumentArtifact).where(
                DigitalDocumentArtifact.storage_path == storage_path
            )
        )
        return result.scalar_one_or_none()

    async def list_storage_paths(self) -> set[str]:
        result = await self.db.execute(select(DigitalDocumentArtifact.storage_path))
        return set(result.scalars().all())

    def add(self, artifact: DigitalDocumentArtifact) -> None:
        self.db.add(artifact)


class DocumentSignatureValidationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_document(self, document_id: UUID) -> list[DocumentSignatureValidation]:
        result = await self.db.execute(
            select(DocumentSignatureValidation)
            .where(DocumentSignatureValidation.document_id == document_id)
            .order_by(
                DocumentSignatureValidation.validated_at.asc(),
                DocumentSignatureValidation.created_at.asc(),
            )
        )
        return list(result.scalars().all())


class HomologationSigningTargetRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active(
        self,
        *,
        document_type: str,
        source_type: str,
        source_id: UUID,
        now: datetime | None = None,
    ) -> HomologationSigningTarget | None:
        current_time = now or datetime.now(timezone.utc)
        result = await self.db.execute(
            select(HomologationSigningTarget).where(
                HomologationSigningTarget.document_type == document_type,
                HomologationSigningTarget.source_type == source_type,
                HomologationSigningTarget.source_id == source_id,
                HomologationSigningTarget.is_active.is_(True),
                or_(
                    HomologationSigningTarget.expires_at.is_(None),
                    HomologationSigningTarget.expires_at > current_time,
                ),
            )
        )
        return result.scalar_one_or_none()


class SignatureAgentDeviceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_active_for_user(
        self,
        *,
        device_id: UUID,
        user_id: UUID,
        for_update: bool = False,
    ) -> SignatureAgentDevice | None:
        statement = select(SignatureAgentDevice).where(
            SignatureAgentDevice.id == device_id,
            SignatureAgentDevice.user_id == user_id,
            SignatureAgentDevice.status == SignatureAgentDeviceStatus.ACTIVE,
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def get_by_fingerprint(self, fingerprint: str) -> SignatureAgentDevice | None:
        result = await self.db.execute(
            select(SignatureAgentDevice).where(
                SignatureAgentDevice.public_key_fingerprint == fingerprint,
            )
        )
        return result.scalar_one_or_none()

    async def get_active_by_external_id(
        self,
        external_device_id: str,
        *,
        user_id: UUID | None = None,
        for_update: bool = False,
    ) -> SignatureAgentDevice | None:
        statement = select(SignatureAgentDevice).where(
            SignatureAgentDevice.public_key_fingerprint == external_device_id.lower(),
            SignatureAgentDevice.status == SignatureAgentDeviceStatus.ACTIVE,
        )
        if user_id is not None:
            statement = statement.where(SignatureAgentDevice.user_id == user_id)
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def list_for_user(self, user_id: UUID) -> list[SignatureAgentDevice]:
        result = await self.db.execute(
            select(SignatureAgentDevice)
            .where(SignatureAgentDevice.user_id == user_id)
            .order_by(SignatureAgentDevice.created_at.desc())
        )
        return list(result.scalars().all())

    def add(self, device: SignatureAgentDevice) -> None:
        self.db.add(device)


class CertificateSigningSessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(
        self,
        session_id: UUID,
        *,
        for_update: bool = False,
    ) -> CertificateSigningSession | None:
        statement = select(CertificateSigningSession).where(
            CertificateSigningSession.id == session_id,
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def get_full_by_id(
        self,
        session_id: UUID,
        *,
        for_update: bool = False,
    ) -> CertificateSigningSession | None:
        from sqlalchemy.orm import joinedload, selectinload

        from app.models.document_signature import DigitalDocument, DocumentSignatureRequest
        from app.models.user import User

        statement = (
            select(CertificateSigningSession)
            .options(
                joinedload(CertificateSigningSession.signer).joinedload(User.organization),
                joinedload(CertificateSigningSession.signer).selectinload(User.permission_entries),
                joinedload(CertificateSigningSession.device),
                joinedload(CertificateSigningSession.canonical_artifact),
                joinedload(CertificateSigningSession.input_artifact),
                joinedload(CertificateSigningSession.document).selectinload(DigitalDocument.signatures),
                joinedload(CertificateSigningSession.document)
                .selectinload(DigitalDocument.signature_requests)
                .joinedload(DocumentSignatureRequest.requester),
                joinedload(CertificateSigningSession.document)
                .selectinload(DigitalDocument.signature_requests)
                .joinedload(DocumentSignatureRequest.requested_signer),
            )
            .where(CertificateSigningSession.id == session_id)
        )
        if for_update:
            statement = statement.with_for_update(
                of=CertificateSigningSession
            ).execution_options(populate_existing=True)
        result = await self.db.execute(statement)
        return result.scalars().unique().first()

    async def get_active_for_document_and_signer(
        self,
        *,
        document_id: UUID,
        signer_user_id: UUID,
    ) -> CertificateSigningSession | None:
        result = await self.db.execute(
            select(CertificateSigningSession)
            .where(
                CertificateSigningSession.document_id == document_id,
                CertificateSigningSession.signer_user_id == signer_user_id,
                CertificateSigningSession.status.in_(
                    [
                        CertificateSigningSessionStatus.CREATED,
                        CertificateSigningSessionStatus.CERTIFICATE_VALIDATED,
                        CertificateSigningSessionStatus.AWAITING_SIGNATURE,
                        CertificateSigningSessionStatus.FINALIZING,
                    ]
                ),
            )
            .order_by(CertificateSigningSession.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def get_active_for_document(
        self,
        *,
        document_id: UUID,
        for_update: bool = False,
    ) -> CertificateSigningSession | None:
        statement = (
            select(CertificateSigningSession)
            .where(
                CertificateSigningSession.document_id == document_id,
                CertificateSigningSession.status.in_(
                    [
                        CertificateSigningSessionStatus.CREATED,
                        CertificateSigningSessionStatus.CERTIFICATE_VALIDATED,
                        CertificateSigningSessionStatus.AWAITING_SIGNATURE,
                        CertificateSigningSessionStatus.FINALIZING,
                    ]
                ),
            )
            .order_by(CertificateSigningSession.created_at.desc())
            .limit(1)
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def list_active_for_device(self, device_id: UUID) -> list[CertificateSigningSession]:
        result = await self.db.execute(
            select(CertificateSigningSession).where(
                CertificateSigningSession.device_id == device_id,
                CertificateSigningSession.status.in_(
                    [
                        CertificateSigningSessionStatus.CREATED,
                        CertificateSigningSessionStatus.CERTIFICATE_VALIDATED,
                        CertificateSigningSessionStatus.AWAITING_SIGNATURE,
                        CertificateSigningSessionStatus.FINALIZING,
                    ]
                ),
            )
        )
        return list(result.scalars().all())

    def add(self, signing_session: CertificateSigningSession) -> None:
        self.db.add(signing_session)


class SignatureAgentPairingRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(
        self,
        pairing_id: UUID,
        *,
        for_update: bool = False,
    ) -> SignatureAgentPairing | None:
        statement = select(SignatureAgentPairing).where(SignatureAgentPairing.id == pairing_id)
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def cancel_active_for_user(self, user_id: UUID, *, now: datetime) -> None:
        result = await self.db.execute(
            select(SignatureAgentPairing).where(
                SignatureAgentPairing.user_id == user_id,
                SignatureAgentPairing.status == SignatureAgentPairingStatus.CREATED,
            )
        )
        for pairing in result.scalars().all():
            pairing.status = SignatureAgentPairingStatus.CANCELLED
            pairing.cancelled_at = now
            pairing.updated_at = now

    def add(self, pairing: SignatureAgentPairing) -> None:
        self.db.add(pairing)


class SignatureAgentRequestNonceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def exists(self, *, device_id: UUID, nonce_hash: str) -> bool:
        result = await self.db.execute(
            select(SignatureAgentRequestNonce.id).where(
                SignatureAgentRequestNonce.device_id == device_id,
                SignatureAgentRequestNonce.nonce_hash == nonce_hash,
            )
        )
        return result.scalar_one_or_none() is not None

    async def purge_expired(self, *, now: datetime) -> None:
        await self.db.execute(
            delete(SignatureAgentRequestNonce).where(
                SignatureAgentRequestNonce.expires_at <= now,
            )
        )

    def add(self, nonce: SignatureAgentRequestNonce) -> None:
        self.db.add(nonce)
