from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import os
import re
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Callable, Sequence
from urllib.parse import urlparse
from uuid import UUID, uuid4

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cpf import mask_cpf, normalize_cpf
from app.models.document_signature import (
    CertificateSigningSession,
    CertificateSigningSessionStatus,
    DigitalDocumentArtifact,
    DigitalDocumentArtifactType,
    DocumentSignature,
    DocumentSignatureMethod,
    DocumentSignatureRequestStatus,
    DocumentSignatureValidation,
    DocumentSignatureValidationStatus,
    SignatureAgentDevice,
    SignatureAgentDeviceStatus,
    SignatureAgentPairing,
    SignatureAgentPairingStatus,
    SignatureAgentRequestNonce,
)
from app.models.user import User, UserRole
from app.repositories.document_artifact_repository import (
    CertificateSigningSessionRepository,
    DocumentArtifactRepository,
    SignatureAgentDeviceRepository,
    SignatureAgentPairingRepository,
    SignatureAgentRequestNonceRepository,
)
from app.repositories.user_repository import UserRepository
from app.schemas.document_signature import (
    CertificateClaimInput,
    CertificateSigningSessionCreateInput,
    CompleteCertificateSignatureInput,
    SignatureAgentPairingCompleteInput,
)
from app.services.audit_service import AuditService
from app.services.certificate_pades_service import (
    PADES_AD_RT_POLICY_OID,
    CertificatePadesService,
    CertificateSigningError,
    PreparedPadesSignature,
)
from app.services.document_artifact_service import DocumentArtifactService
from app.services.document_signature_service import DocumentSignatureService
from app.services.icp_brasil_trust_service import IcpBrasilTrustStore


_ACTIVE_SESSION_STATUSES = {
    CertificateSigningSessionStatus.CREATED,
    CertificateSigningSessionStatus.CERTIFICATE_VALIDATED,
    CertificateSigningSessionStatus.AWAITING_SIGNATURE,
    CertificateSigningSessionStatus.FINALIZING,
}
_TERMINAL_SESSION_STATUSES = {
    CertificateSigningSessionStatus.COMPLETED,
    CertificateSigningSessionStatus.FAILED,
    CertificateSigningSessionStatus.CANCELLED,
    CertificateSigningSessionStatus.EXPIRED,
}
_DEVICE_ID_RE = re.compile(r"^[0-9a-f]{64}$")
_DEVICE_NONCE_RE = re.compile(r"^[0-9a-f]{32}$")
_MAX_PAIRING_ATTEMPTS = 5


class CertificateSigningSessionService:
    """Persistent browser/backend/Windows-agent orchestration.

    Only public certificate material is retained while a session is active.
    Tokens are HMACed at rest and rotated between claim and completion.
    """

    def __init__(
        self,
        db: AsyncSession,
        *,
        pades_factory: Callable[[Sequence[bytes]], CertificatePadesService] | None = None,
    ) -> None:
        self.db = db
        self.sessions = CertificateSigningSessionRepository(db)
        self.devices = SignatureAgentDeviceRepository(db)
        self.pairings = SignatureAgentPairingRepository(db)
        self.request_nonces = SignatureAgentRequestNonceRepository(db)
        self.artifacts = DocumentArtifactRepository(db)
        self.artifact_service = DocumentArtifactService(db)
        self.document_service = DocumentSignatureService(db)
        self.users = UserRepository(db)
        self.audit = AuditService(db)
        self._pades_factory = pades_factory

    async def create_session(
        self,
        *,
        document_id: UUID,
        data: CertificateSigningSessionCreateInput,
        current_user: User,
    ) -> dict:
        self._require_feature()
        document = await self.document_service.get_document_for_certificate_signing(
            document_id, current_user
        )
        await self.artifact_service.ensure_certificate_signing_allowed(document)
        if not self.artifact_service.supports_canonical_artifact(document.document_type):
            self._raise(
                status.HTTP_409_CONFLICT,
                "CANONICAL_ARTIFACT_NOT_SUPPORTED",
                "Este tipo de documento ainda nÃ£o possui artefato canÃ´nico assinÃ¡vel.",
            )

        canonical = await self.artifact_service.ensure_canonical_artifact(
            document, current_user=current_user
        )
        target_id = await self._active_homologation_target_id(document)
        if settings.HOMOLOGATION_CERTIFICATE_TARGETS_ONLY and not self._has_expected_homologation_metadata(
            canonical, target_id
        ):
            self._raise(
                status.HTTP_409_CONFLICT,
                "HOMOLOGATION_WATERMARK_REQUIRED",
                "O PDF sintÃ©tico precisa ser regenerado com a marca de homologaÃ§Ã£o.",
            )
        input_artifact = await self._select_current_signing_input(
            document=document,
            canonical=canonical,
            homologation_target_id=target_id,
        )
        self._assert_artifact_matches_document(document, canonical, input_artifact)
        self.artifact_service.read_verified_bytes(input_artifact)

        active = await self.sessions.get_active_for_document(
            document_id=document.id, for_update=True
        )
        now = datetime.now(UTC)
        if active is not None and self._is_expired(active, now):
            self._expire_session(active, now)
            active = None
        if active is not None:
            self._raise(
                status.HTTP_409_CONFLICT,
                "CERTIFICATE_SESSION_ALREADY_ACTIVE",
                "JÃ¡ existe uma assinatura por certificado em andamento para este documento.",
            )

        device = await self._select_device(current_user, data.device_id)
        session_id = uuid4()
        raw_token = secrets.token_urlsafe(48)
        raw_nonce = secrets.token_urlsafe(32)
        expires_at = now + timedelta(seconds=settings.CERTIFICATE_SIGNING_SESSION_TTL_SECONDS)
        signing_session = CertificateSigningSession(
            id=session_id,
            document_id=document.id,
            canonical_artifact_id=canonical.id,
            input_artifact_id=input_artifact.id,
            device_id=device.id,
            signer_user_id=current_user.id,
            status=CertificateSigningSessionStatus.CREATED,
            expected_content_sha256=input_artifact.content_sha256,
            nonce_hash=self._secret_hash("session-nonce", session_id, raw_nonce),
            one_time_token_hash=self._token_hash(session_id, raw_token),
            state_version=1,
            attempt_count=0,
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )
        self.sessions.add(signing_session)
        await self.db.flush()
        signing_session.device = device
        signing_session.document = document
        signing_session.canonical_artifact = canonical
        signing_session.input_artifact = input_artifact
        await self.audit.record(
            actor=current_user,
            action="CERT_SESSION_CREATE",
            entity_type="DIGITAL_DOCUMENT",
            entity_id=document.id,
            entity_label=document.title,
            details={
                "session_id": str(signing_session.id),
                "input_artifact_id": str(input_artifact.id),
                "input_sha256": input_artifact.content_sha256,
                "device_id": device.public_key_fingerprint,
                "expires_at": expires_at.isoformat(),
            },
        )
        await self.db.commit()
        payload = self.serialize_session(signing_session)
        payload["one_time_token"] = raw_token
        payload["agent_request"] = {
            "session_id": signing_session.id,
            "one_time_token": raw_token,
            "backend_base_url": settings.SIGNATURE_BACKEND_BASE_URL.rstrip("/") + "/",
            "document_title": document.title,
            "document_type": document.document_type,
            "content_hash": input_artifact.content_sha256,
            "expires_at": expires_at,
        }
        return payload

    async def get_session(self, session_id: UUID, current_user: User) -> dict:
        signing_session = await self._require_session(session_id)
        self._authorize_session_user(signing_session, current_user)
        now = datetime.now(UTC)
        if signing_session.status in _ACTIVE_SESSION_STATUSES and self._is_expired(
            signing_session, now
        ):
            signing_session = await self._require_session(session_id, for_update=True)
            self._expire_session(signing_session, now)
            await self.db.commit()
        return self.serialize_session(signing_session)

    async def cancel_session(self, session_id: UUID, current_user: User) -> dict:
        signing_session = await self._require_session(session_id, for_update=True)
        self._authorize_session_user(signing_session, current_user)
        if signing_session.status == CertificateSigningSessionStatus.COMPLETED:
            self._raise(
                status.HTTP_409_CONFLICT,
                "CERTIFICATE_SESSION_COMPLETED",
                "Uma sessÃ£o concluÃ­da nÃ£o pode ser cancelada.",
            )
        if signing_session.status not in _TERMINAL_SESSION_STATUSES:
            now = datetime.now(UTC)
            signing_session.status = CertificateSigningSessionStatus.CANCELLED
            signing_session.cancelled_at = now
            signing_session.token_consumed_at = now
            signing_session.one_time_token_hash = self._terminal_token_hash(signing_session.id)
            signing_session.updated_at = now
            signing_session.state_version += 1
            self._cleanup_prepared_state(signing_session)
            await self.audit.record(
                actor=current_user,
                action="CERT_SESSION_CANCEL",
                entity_type="DIGITAL_DOCUMENT",
                entity_id=signing_session.document_id,
                entity_label=signing_session.document.title,
                details={"session_id": str(signing_session.id)},
            )
            await self.db.commit()
        return self.serialize_session(signing_session)

    async def claim(
        self,
        *,
        session_id: UUID,
        data: CertificateClaimInput,
        raw_body: bytes,
        request_path: str,
        headers,
    ) -> dict:
        self._require_feature()
        preliminary = await self._require_session(session_id)
        self._assert_session_state(preliminary, CertificateSigningSessionStatus.CREATED)
        self._assert_token(preliminary, headers.get("X-Frota-Signing-Token"))
        preliminary_device = self._assert_bound_device(preliminary, data.device_id)
        proof = self._verify_device_proof(
            public_key_spki_base64=preliminary_device.public_key_spki_base64,
            expected_device_id=preliminary_device.public_key_fingerprint,
            headers=headers,
            method="POST",
            path=request_path,
            raw_body=raw_body,
        )

        signer = preliminary.signer
        if signer is None:
            self._raise(status.HTTP_409_CONFLICT, "SIGNER_UNAVAILABLE", "UsuÃ¡rio da sessÃ£o nÃ£o estÃ¡ disponÃ­vel.")
        document = await self.document_service.get_document_for_certificate_signing(
            preliminary.document_id, signer
        )
        signing_session = await self._require_session(session_id, for_update=True)
        self._assert_session_state(signing_session, CertificateSigningSessionStatus.CREATED)
        self._assert_token(signing_session, headers.get("X-Frota-Signing-Token"))
        device = self._assert_bound_device(signing_session, data.device_id)
        await self._consume_device_nonce(device, proof)
        await self.artifact_service.ensure_certificate_signing_allowed(document)
        await self._assert_session_base_is_current(signing_session, document)

        certificate_der = self._decode_base64(data.certificate_der, "certificate_der", 48 * 1024)
        chain_der = tuple(
            self._decode_base64(item, "certificate_chain", 48 * 1024)
            for item in data.certificate_chain
        )
        if sum(map(len, chain_der)) > 256 * 1024:
            self._raise(status.HTTP_422_UNPROCESSABLE_ENTITY, "CERTIFICATE_CHAIN_TOO_LARGE", "Cadeia de certificados invÃ¡lida.")
        try:
            CertificatePadesService.assert_cpf_matches(certificate_der, signer.cpf)
            pades = self._build_pades_service(chain_der)
            input_pdf = self.artifact_service.read_verified_bytes(signing_session.input_artifact)
            prepared = await pades.prepare(
                canonical_pdf=input_pdf,
                certificate_der=certificate_der,
                chain_der=chain_der,
                supported_algorithms=data.supported_algorithms,
                field_name=f"FrotaICP_{str(signing_session.id).replace('-', '')[:24]}",
            )
        except (CertificateSigningError, ValueError, OSError) as exc:
            await self._fail_locked_session(
                signing_session,
                code="CERTIFICATE_PREPARATION_FAILED",
                safe_detail="O certificado, a cadeia, a revogaÃ§Ã£o ou o carimbo de tempo nÃ£o pÃ´de ser validado.",
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "CERTIFICATE_PREPARATION_FAILED",
                    "message": "NÃ£o foi possÃ­vel validar o certificado e preparar a assinatura.",
                },
            ) from exc

        completion_token = secrets.token_urlsafe(48)
        prepared_relative_path: str | None = None
        try:
            self._persist_prepared_state(signing_session, prepared)
            prepared_relative_path = signing_session.prepared_pdf_path
            now = datetime.now(UTC)
            signing_session.status = CertificateSigningSessionStatus.AWAITING_SIGNATURE
            signing_session.claimed_at = now
            signing_session.one_time_token_hash = self._token_hash(
                signing_session.id, completion_token
            )
            signing_session.attempt_count += 1
            signing_session.state_version += 1
            signing_session.updated_at = now
            device.last_seen_at = now
            device.updated_at = now
            await self.audit.record(
                actor=signer,
                action="CERT_SESSION_CLAIM",
                entity_type="DIGITAL_DOCUMENT",
                entity_id=document.id,
                entity_label=document.title,
                details={
                    "session_id": str(signing_session.id),
                    "device_id": device.public_key_fingerprint,
                    "signature_algorithm": prepared.signature_algorithm,
                    "input_sha256": signing_session.expected_content_sha256,
                },
            )
            await self.db.commit()
        except Exception as exc:
            await self.db.rollback()
            cleanup_error = self._discard_prepared_file(
                prepared_relative_path,
                hashlib.sha256(prepared.prepared_pdf).hexdigest(),
            )
            await self._mark_failed(
                session_id,
                code="PREPARED_STATE_PERSISTENCE_FAILED",
                safe_detail="O estado preparado nÃ£o pÃ´de ser persistido integralmente.",
            )
            if cleanup_error is not None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "code": "PREPARED_STATE_CLEANUP_FAILED",
                        "message": "Falha ao limpar estado preparado nÃ£o confirmado.",
                    },
                ) from cleanup_error
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={
                    "code": "PREPARED_STATE_PERSISTENCE_FAILED",
                    "message": "A sessÃ£o falhou sem expor um token de conclusÃ£o.",
                },
            ) from exc
        return {
            "to_be_signed": prepared.to_be_signed_base64,
            "signature_algorithm": prepared.signature_algorithm,
            "completion_token": completion_token,
            "document_title": document.title,
            "document_type": document.document_type,
            "content_hash": signing_session.expected_content_sha256,
            "environment": "HOMOLOGACAO",
            "expires_at": signing_session.expires_at,
        }

    async def complete(
        self,
        *,
        session_id: UUID,
        data: CompleteCertificateSignatureInput,
        raw_body: bytes,
        request_path: str,
        headers,
    ) -> dict:
        self._require_feature()
        preliminary = await self._require_session(session_id)
        self._assert_session_state(
            preliminary, CertificateSigningSessionStatus.AWAITING_SIGNATURE
        )
        self._assert_token(preliminary, headers.get("X-Frota-Signing-Token"))
        preliminary_device = self._assert_bound_device(preliminary, data.device_id)
        proof = self._verify_device_proof(
            public_key_spki_base64=preliminary_device.public_key_spki_base64,
            expected_device_id=preliminary_device.public_key_fingerprint,
            headers=headers,
            method="POST",
            path=request_path,
            raw_body=raw_body,
        )
        signer = preliminary.signer
        if signer is None:
            self._raise(status.HTTP_409_CONFLICT, "SIGNER_UNAVAILABLE", "UsuÃ¡rio da sessÃ£o nÃ£o estÃ¡ disponÃ­vel.")

        document = await self.document_service.get_document_for_certificate_signing(
            preliminary.document_id, signer
        )
        signing_session = await self._require_session(session_id, for_update=True)
        self._assert_session_state(
            signing_session, CertificateSigningSessionStatus.AWAITING_SIGNATURE
        )
        self._assert_token(signing_session, headers.get("X-Frota-Signing-Token"))
        device = self._assert_bound_device(signing_session, data.device_id)
        await self._consume_device_nonce(device, proof)
        await self.artifact_service.ensure_certificate_signing_allowed(document)
        await self._assert_session_base_is_current(signing_session, document)
        prepared = self._restore_prepared_state(signing_session)
        if data.signature_algorithm.upper() != prepared.signature_algorithm:
            self._raise(status.HTTP_409_CONFLICT, "SIGNATURE_ALGORITHM_MISMATCH", "Algoritmo de assinatura divergente.")
        raw_signature = self._decode_base64(data.raw_signature, "raw_signature", 8 * 1024)

        now = datetime.now(UTC)
        signing_session.status = CertificateSigningSessionStatus.FINALIZING
        signing_session.one_time_token_hash = self._terminal_token_hash(signing_session.id)
        signing_session.token_consumed_at = now
        signing_session.attempt_count += 1
        signing_session.state_version += 1
        signing_session.updated_at = now
        device.last_seen_at = now
        device.updated_at = now
        await self.db.commit()

        try:
            completed = await self._build_pades_service(
                prepared.certificate_chain
            ).complete(prepared=prepared, raw_signature=raw_signature)
        except (CertificateSigningError, ValueError, OSError) as exc:
            await self._mark_failed(
                session_id,
                code="CERTIFICATE_COMPLETION_FAILED",
                safe_detail="A assinatura retornada, a cadeia, a revogaÃ§Ã£o ou o carimbo de tempo falhou.",
            )
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "CERTIFICATE_COMPLETION_FAILED",
                    "message": "A assinatura por certificado nÃ£o pÃ´de ser concluÃ­da.",
                },
            ) from exc

        certified_artifact: DigitalDocumentArtifact | None = None
        try:
            document = await self.document_service.get_document_for_certificate_signing(
                preliminary.document_id, signer
            )
            signing_session = await self._require_session(session_id, for_update=True)
            self._assert_session_state(
                signing_session, CertificateSigningSessionStatus.FINALIZING
            )
            await self.artifact_service.ensure_certificate_signing_allowed(document)
            await self._assert_session_base_is_current(signing_session, document)
            now = datetime.now(UTC)
            if self._is_expired(signing_session, now):
                self._raise(status.HTTP_410_GONE, "CERTIFICATE_SESSION_EXPIRED", "A sessÃ£o de assinatura expirou.")

            certificate = x509.load_der_x509_certificate(prepared.signing_certificate)
            certificate_cpf = CertificatePadesService.extract_cpf(
                prepared.signing_certificate
            )
            if certificate_cpf is None:
                raise CertificateSigningError("CPF ausente no certificado.")
            certified_artifact = await self.artifact_service.store_certified_artifact(
                document=document,
                based_on=signing_session.input_artifact,
                signed_pdf=completed.signed_pdf,
                current_user=signer,
                metadata={
                    "policy_oid": PADES_AD_RT_POLICY_OID,
                    "timestamped": completed.timestamped,
                    "validation_status": DocumentSignatureValidationStatus.VALID,
                },
            )
            signature = DocumentSignature(
                document_id=document.id,
                signer_user_id=signer.id,
                signer_name=signer.name,
                signer_email=signer.email,
                signer_role=signer.role.value if signer.role else None,
                signer_organization_id=signer.organization_id,
                signer_organization_name=signer.organization_name,
                signer_cpf_masked=mask_cpf(signer.cpf),
                signer_cpf_hash=None,
                content_hash=document.content_hash,
                signature_fingerprint=self._secret_hash(
                    "certificate-signature", document.id, hashlib.sha256(raw_signature).hexdigest()
                ),
                signature_method=DocumentSignatureMethod.ICP_BRASIL_PADES,
                signature_format="PAdES AD-RT v1.3",
                artifact_id=certified_artifact.id,
                certificate_fingerprint=CertificatePadesService.certificate_fingerprint(
                    prepared.signing_certificate
                ),
                certificate_cpf_hmac=self._protected_cpf_hash(certificate_cpf),
                certificate_issuer_summary=self._issuer_summary(certificate),
                certificate_serial_masked=self._masked_certificate_serial(certificate),
                certificate_valid_from=certificate.not_valid_before_utc,
                certificate_valid_until=certificate.not_valid_after_utc,
                signature_policy_oid=PADES_AD_RT_POLICY_OID,
                timestamped_at=completed.timestamped_at,
                validation_status=DocumentSignatureValidationStatus.VALID,
                signed_at=now,
            )
            document.signatures.append(signature)
            await self.db.flush()
            validation = DocumentSignatureValidation(
                document_id=document.id,
                signature_id=signature.id,
                artifact_id=certified_artifact.id,
                status=DocumentSignatureValidationStatus.VALID,
                validator="pyHanko 0.36.2",
                policy_oid=PADES_AD_RT_POLICY_OID,
                certificate_fingerprint=signature.certificate_fingerprint,
                timestamped_at=signature.timestamped_at,
                validated_at=now,
                report={
                    "cryptographic_integrity": True,
                    "trusted_chain": True,
                    "revocation_required_fail_closed": True,
                    "timestamped": bool(completed.timestamped),
                    "artifact_sha256": certified_artifact.content_sha256,
                },
            )
            self.db.add(validation)
            for request in document.signature_requests:
                if (
                    request.status == DocumentSignatureRequestStatus.PENDING
                    and request.requested_signer_user_id == signer.id
                ):
                    request.status = DocumentSignatureRequestStatus.SIGNED
                    request.responded_at = now
                    request.updated_at = now
            await self.document_service._refresh_document_status(document, now=now)
            signing_session.status = CertificateSigningSessionStatus.COMPLETED
            signing_session.completed_at = now
            signing_session.updated_at = now
            signing_session.state_version += 1
            self._cleanup_prepared_state(signing_session)
            await self.audit.record(
                actor=signer,
                action="CERT_SESSION_COMPLETE",
                entity_type="DIGITAL_DOCUMENT",
                entity_id=document.id,
                entity_label=document.title,
                details={
                    "session_id": str(signing_session.id),
                    "artifact_id": str(certified_artifact.id),
                    "artifact_sha256": certified_artifact.content_sha256,
                    "signature_method": DocumentSignatureMethod.ICP_BRASIL_PADES,
                    "policy_oid": PADES_AD_RT_POLICY_OID,
                    "timestamped": bool(completed.timestamped),
                },
            )
            await self.db.commit()
            return {
                "status": CertificateSigningSessionStatus.COMPLETED,
                "artifact_sha256": certified_artifact.content_sha256,
            }
        except HTTPException:
            await self.db.rollback()
            cleanup_error = await self._discard_uncommitted_certified_artifact(
                certified_artifact
            )
            await self._mark_failed(
                session_id,
                code="DOCUMENT_CHANGED_DURING_FINALIZATION",
                safe_detail="O documento ou o artefato base mudou durante a finalizaÃ§Ã£o.",
            )
            if cleanup_error is not None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "code": "CERTIFIED_ARTIFACT_CLEANUP_FAILED",
                        "message": "Falha ao limpar artefato nÃ£o confirmado; intervenÃ§Ã£o operacional necessÃ¡ria.",
                    },
                ) from cleanup_error
            raise
        except Exception as exc:
            await self.db.rollback()
            cleanup_error = await self._discard_uncommitted_certified_artifact(
                certified_artifact
            )
            await self._mark_failed(
                session_id,
                code="CERTIFICATE_PERSISTENCE_FAILED",
                safe_detail="A evidÃªncia certificada nÃ£o pÃ´de ser persistida integralmente.",
            )
            if cleanup_error is not None:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "code": "CERTIFIED_ARTIFACT_CLEANUP_FAILED",
                        "message": "Falha ao limpar artefato nÃ£o confirmado; intervenÃ§Ã£o operacional necessÃ¡ria.",
                    },
                ) from cleanup_error
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "CERTIFICATE_PERSISTENCE_FAILED",
                    "message": "A assinatura foi recusada sem registrar evidÃªncia parcial.",
                },
            ) from exc

    async def _discard_uncommitted_certified_artifact(
        self, artifact: DigitalDocumentArtifact | None
    ) -> Exception | None:
        if artifact is None:
            return None
        try:
            await self.artifact_service.discard_uncommitted_artifact_file(artifact)
        except Exception as cleanup_error:
            return cleanup_error
        return None

    async def create_pairing(self, current_user: User) -> dict:
        self._require_feature()
        now = datetime.now(UTC)
        await self.pairings.cancel_active_for_user(current_user.id, now=now)
        pairing_id = uuid4()
        pairing_code = f"{secrets.randbelow(100_000_000):08d}"
        expires_at = now + timedelta(seconds=settings.SIGNATURE_AGENT_PAIRING_TTL_SECONDS)
        pairing = SignatureAgentPairing(
            id=pairing_id,
            user_id=current_user.id,
            code_hash=self._pairing_code_hash(pairing_id, pairing_code),
            status=SignatureAgentPairingStatus.CREATED,
            attempt_count=0,
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        )
        self.pairings.add(pairing)
        await self.audit.record(
            actor=current_user,
            action="SIGNER_PAIRING_CREATE",
            entity_type="SIGNATURE_AGENT_PAIRING",
            entity_id=pairing.id,
            entity_label="Pareamento FrotaSigner-HML",
            details={"expires_at": expires_at.isoformat()},
        )
        await self.db.commit()
        return {
            "id": pairing.id,
            "pairing_id": pairing.id,
            "status": pairing.status,
            "expires_at": pairing.expires_at,
            "pairing_code": pairing_code,
            "backend_base_url": settings.SIGNATURE_BACKEND_BASE_URL.rstrip("/") + "/",
            "agent_request": {
                "pairing_id": pairing.id,
                "pairing_code": pairing_code,
                "backend_base_url": settings.SIGNATURE_BACKEND_BASE_URL.rstrip("/") + "/",
                "expires_at": pairing.expires_at,
            },
        }

    async def get_pairing(self, pairing_id: UUID, current_user: User) -> dict:
        pairing = await self._require_pairing(pairing_id, for_update=True)
        if pairing.user_id != current_user.id and current_user.role != UserRole.ADMIN:
            self._raise(status.HTTP_404_NOT_FOUND, "PAIRING_NOT_FOUND", "Pareamento nÃ£o encontrado.")
        now = datetime.now(UTC)
        if pairing.status == SignatureAgentPairingStatus.CREATED and self._deadline(pairing.expires_at) <= now:
            pairing.status = SignatureAgentPairingStatus.EXPIRED
            pairing.updated_at = now
            await self.db.commit()
        device = None
        if pairing.device_id is not None:
            device = await self.devices.get_active_for_user(
                device_id=pairing.device_id, user_id=pairing.user_id
            )
        return self.serialize_pairing(pairing, device)

    async def complete_pairing(
        self,
        *,
        pairing_id: UUID,
        data: SignatureAgentPairingCompleteInput,
        raw_body: bytes,
        request_path: str,
        headers,
    ) -> dict:
        self._require_feature()
        pairing = await self._require_pairing(pairing_id, for_update=True)
        now = datetime.now(UTC)
        if pairing.status != SignatureAgentPairingStatus.CREATED:
            self._raise(status.HTTP_409_CONFLICT, "PAIRING_ALREADY_CONSUMED", "Pareamento jÃ¡ utilizado ou cancelado.")
        if self._deadline(pairing.expires_at) <= now:
            pairing.status = SignatureAgentPairingStatus.EXPIRED
            pairing.updated_at = now
            await self.db.commit()
            self._raise(status.HTTP_410_GONE, "PAIRING_EXPIRED", "Pareamento expirado.")
        if pairing.attempt_count >= _MAX_PAIRING_ATTEMPTS:
            pairing.status = SignatureAgentPairingStatus.CANCELLED
            pairing.cancelled_at = now
            pairing.updated_at = now
            await self.db.commit()
            self._raise(status.HTTP_429_TOO_MANY_REQUESTS, "PAIRING_ATTEMPTS_EXCEEDED", "Limite de tentativas excedido.")

        submitted_key = self._decode_base64(
            data.device_public_key, "device_public_key", 16 * 1024
        )
        fingerprint = hashlib.sha256(submitted_key).hexdigest()
        supplied_device_id = data.device_id.lower()
        header_device_id = str(headers.get("X-Frota-Device-Id") or "").lower()
        expected_code_hash = self._pairing_code_hash(pairing.id, data.pairing_code)
        valid_environment = data.environment.strip().upper() == "HOMOLOGACAO"
        valid_identity = (
            _DEVICE_ID_RE.fullmatch(supplied_device_id) is not None
            and hmac.compare_digest(fingerprint, supplied_device_id)
            and hmac.compare_digest(header_device_id, supplied_device_id)
        )
        valid_code = hmac.compare_digest(pairing.code_hash, expected_code_hash)
        try:
            self._verify_device_proof(
                public_key_spki_base64=data.device_public_key,
                expected_device_id=supplied_device_id,
                headers=headers,
                method="POST",
                path=request_path,
                raw_body=raw_body,
            )
            valid_proof = True
        except HTTPException:
            valid_proof = False

        if not (valid_environment and valid_identity and valid_code and valid_proof):
            pairing.attempt_count += 1
            pairing.updated_at = now
            if pairing.attempt_count >= _MAX_PAIRING_ATTEMPTS:
                pairing.status = SignatureAgentPairingStatus.CANCELLED
                pairing.cancelled_at = now
            await self.db.commit()
            self._raise(status.HTTP_403_FORBIDDEN, "PAIRING_INVALID", "Pareamento invÃ¡lido.")

        try:
            public_key = serialization.load_der_public_key(submitted_key)
        except (TypeError, ValueError) as exc:
            self._raise(status.HTTP_422_UNPROCESSABLE_ENTITY, "DEVICE_PUBLIC_KEY_INVALID", "Chave pÃºblica do dispositivo invÃ¡lida.")
        if not isinstance(public_key, rsa.RSAPublicKey) or public_key.key_size < 3072:
            self._raise(status.HTTP_422_UNPROCESSABLE_ENTITY, "DEVICE_PUBLIC_KEY_INVALID", "Chave pÃºblica do dispositivo invÃ¡lida.")

        existing = await self.devices.get_by_fingerprint(fingerprint)
        if existing is not None and existing.user_id not in {None, pairing.user_id}:
            self._raise(status.HTTP_409_CONFLICT, "DEVICE_ALREADY_PAIRED", "Dispositivo jÃ¡ vinculado a outra conta.")
        if existing is None:
            device = SignatureAgentDevice(
                id=uuid4(),
                user_id=pairing.user_id,
                display_name=f"FrotaSigner-HML {fingerprint[:12]}",
                public_key_spki_base64=data.device_public_key,
                public_key_fingerprint=fingerprint,
                status=SignatureAgentDeviceStatus.ACTIVE,
                paired_at=now,
                last_seen_at=now,
                created_at=now,
                updated_at=now,
            )
            self.devices.add(device)
            await self.db.flush()
        else:
            device = existing
            if not hmac.compare_digest(device.public_key_spki_base64, data.device_public_key):
                self._raise(status.HTTP_409_CONFLICT, "DEVICE_KEY_MISMATCH", "Chave do dispositivo divergente.")
            device.user_id = pairing.user_id
            device.status = SignatureAgentDeviceStatus.ACTIVE
            device.revoked_at = None
            device.paired_at = now
            device.last_seen_at = now
            device.updated_at = now

        pairing.device_id = device.id
        pairing.status = SignatureAgentPairingStatus.COMPLETED
        pairing.completed_at = now
        pairing.consumed_at = now
        pairing.updated_at = now
        user = await self.users.get_by_id(pairing.user_id)
        if user is not None:
            await self.audit.record(
                actor=user,
                action="SIGNER_PAIRING_COMPLETE",
                entity_type="SIGNATURE_AGENT_DEVICE",
                entity_id=device.id,
                entity_label=device.display_name,
                details={"device_id": fingerprint, "environment": "HOMOLOGACAO"},
            )
        await self.db.commit()
        return {"status": "paired", "device_id": fingerprint}

    async def list_devices(self, current_user: User) -> list[dict]:
        devices = await self.devices.list_for_user(current_user.id)
        return [
            self.serialize_device(device)
            for device in devices
            if device.status == SignatureAgentDeviceStatus.ACTIVE
        ]

    async def revoke_device(self, external_device_id: str, current_user: User) -> dict:
        device = await self.devices.get_active_by_external_id(
            external_device_id.lower(), for_update=True
        )
        if device is None or (
            device.user_id != current_user.id and current_user.role != UserRole.ADMIN
        ):
            self._raise(status.HTTP_404_NOT_FOUND, "DEVICE_NOT_FOUND", "Dispositivo nÃ£o encontrado.")
        now = datetime.now(UTC)
        device.status = SignatureAgentDeviceStatus.REVOKED
        device.revoked_at = now
        device.updated_at = now
        for signing_session in await self.sessions.list_active_for_device(device.id):
            signing_session.status = CertificateSigningSessionStatus.CANCELLED
            signing_session.cancelled_at = now
            signing_session.token_consumed_at = now
            signing_session.one_time_token_hash = self._terminal_token_hash(signing_session.id)
            signing_session.updated_at = now
            signing_session.state_version += 1
            self._cleanup_prepared_state(signing_session)
        await self.audit.record(
            actor=current_user,
            action="SIGNER_DEVICE_REVOKE",
            entity_type="SIGNATURE_AGENT_DEVICE",
            entity_id=device.id,
            entity_label=device.display_name,
            details={"device_id": device.public_key_fingerprint},
        )
        await self.db.commit()
        return self.serialize_device(device)

    def _require_feature(self) -> None:
        if not settings.CERTIFICATE_SIGNING_ENABLED or not settings.SIGNATURE_AGENT_ENABLED:
            self._raise(
                status.HTTP_404_NOT_FOUND,
                "CERTIFICATE_SIGNING_DISABLED",
                "Assinatura por certificado nÃ£o estÃ¡ habilitada.",
            )

    async def _select_device(self, current_user: User, external_device_id: str | None) -> SignatureAgentDevice:
        if external_device_id:
            device = await self.devices.get_active_by_external_id(
                external_device_id.lower(), user_id=current_user.id, for_update=True
            )
            if device is None:
                self._raise(status.HTTP_409_CONFLICT, "SIGNATURE_AGENT_PAIRING_REQUIRED", "Pareie o agente com sua conta.")
            return device
        devices = [
            item
            for item in await self.devices.list_for_user(current_user.id)
            if item.status == SignatureAgentDeviceStatus.ACTIVE
        ]
        if len(devices) != 1:
            self._raise(
                status.HTTP_409_CONFLICT,
                "SIGNATURE_AGENT_DEVICE_REQUIRED",
                "Pareie ou selecione exatamente um dispositivo de assinatura.",
            )
        return devices[0]

    async def _require_session(
        self, session_id: UUID, *, for_update: bool = False
    ) -> CertificateSigningSession:
        signing_session = await self.sessions.get_full_by_id(
            session_id, for_update=for_update
        )
        if signing_session is None:
            self._raise(status.HTTP_404_NOT_FOUND, "CERTIFICATE_SESSION_NOT_FOUND", "SessÃ£o nÃ£o encontrada.")
        return signing_session

    async def _require_pairing(
        self, pairing_id: UUID, *, for_update: bool = False
    ) -> SignatureAgentPairing:
        pairing = await self.pairings.get_by_id(pairing_id, for_update=for_update)
        if pairing is None:
            self._raise(status.HTTP_404_NOT_FOUND, "PAIRING_NOT_FOUND", "Pareamento nÃ£o encontrado.")
        return pairing

    def _authorize_session_user(
        self, signing_session: CertificateSigningSession, current_user: User
    ) -> None:
        if signing_session.signer_user_id != current_user.id and current_user.role != UserRole.ADMIN:
            self._raise(status.HTTP_404_NOT_FOUND, "CERTIFICATE_SESSION_NOT_FOUND", "SessÃ£o nÃ£o encontrada.")

    def _assert_session_state(self, signing_session: CertificateSigningSession, expected: str) -> None:
        now = datetime.now(UTC)
        if self._is_expired(signing_session, now):
            self._raise(status.HTTP_410_GONE, "CERTIFICATE_SESSION_EXPIRED", "A sessÃ£o de assinatura expirou.")
        if signing_session.status != expected:
            self._raise(
                status.HTTP_409_CONFLICT,
                "CERTIFICATE_SESSION_STATE_MISMATCH",
                "A sessÃ£o nÃ£o estÃ¡ no estado esperado.",
            )

    def _assert_token(self, signing_session: CertificateSigningSession, raw_token: str | None) -> None:
        if not raw_token or len(raw_token) < 32:
            self._raise(status.HTTP_401_UNAUTHORIZED, "SIGNING_TOKEN_INVALID", "Token de assinatura invÃ¡lido.")
        actual = self._token_hash(signing_session.id, raw_token)
        if not hmac.compare_digest(signing_session.one_time_token_hash, actual):
            self._raise(status.HTTP_401_UNAUTHORIZED, "SIGNING_TOKEN_INVALID", "Token de assinatura invÃ¡lido.")

    def _assert_bound_device(
        self, signing_session: CertificateSigningSession, external_device_id: str
    ) -> SignatureAgentDevice:
        device = signing_session.device
        normalized = external_device_id.lower()
        if (
            device is None
            or signing_session.device_id != device.id
            or device.status != SignatureAgentDeviceStatus.ACTIVE
            or not hmac.compare_digest(device.public_key_fingerprint, normalized)
            or device.user_id != signing_session.signer_user_id
        ):
            self._raise(status.HTTP_403_FORBIDDEN, "SIGNATURE_AGENT_DEVICE_INVALID", "Dispositivo nÃ£o autorizado.")
        return device

    async def _consume_device_nonce(self, device: SignatureAgentDevice, proof: dict) -> None:
        now = datetime.now(UTC)
        await self.request_nonces.purge_expired(now=now)
        nonce_hash = self._secret_hash("device-request-nonce", device.id, proof["nonce"])
        if await self.request_nonces.exists(device_id=device.id, nonce_hash=nonce_hash):
            self._raise(status.HTTP_409_CONFLICT, "DEVICE_REQUEST_REPLAY", "RequisiÃ§Ã£o do agente jÃ¡ utilizada.")
        self.request_nonces.add(
            SignatureAgentRequestNonce(
                id=uuid4(),
                device_id=device.id,
                nonce_hash=nonce_hash,
                request_timestamp=proof["timestamp"],
                expires_at=now
                + timedelta(seconds=settings.SIGNATURE_AGENT_PROOF_MAX_SKEW_SECONDS * 2),
                created_at=now,
            )
        )
        try:
            await self.db.flush()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "DEVICE_REQUEST_REPLAY", "message": "RequisiÃ§Ã£o do agente jÃ¡ utilizada."},
            ) from exc

    @classmethod
    def _verify_device_proof(
        cls,
        *,
        public_key_spki_base64: str,
        expected_device_id: str,
        headers,
        method: str,
        path: str,
        raw_body: bytes,
    ) -> dict:
        device_id = str(headers.get("X-Frota-Device-Id") or "").lower()
        timestamp_text = str(headers.get("X-Frota-Device-Timestamp") or "")
        nonce = str(headers.get("X-Frota-Device-Nonce") or "").lower()
        proof_text = str(headers.get("X-Frota-Device-Proof") or "")
        if not hmac.compare_digest(device_id, expected_device_id.lower()):
            cls._raise(status.HTTP_403_FORBIDDEN, "DEVICE_PROOF_INVALID", "Prova do dispositivo invÃ¡lida.")
        if _DEVICE_NONCE_RE.fullmatch(nonce) is None:
            cls._raise(status.HTTP_403_FORBIDDEN, "DEVICE_PROOF_INVALID", "Prova do dispositivo invÃ¡lida.")
        try:
            unix_timestamp = int(timestamp_text)
            request_time = datetime.fromtimestamp(unix_timestamp, UTC)
        except (ValueError, OverflowError, OSError):
            cls._raise(status.HTTP_403_FORBIDDEN, "DEVICE_PROOF_INVALID", "Prova do dispositivo invÃ¡lida.")
        if abs((datetime.now(UTC) - request_time).total_seconds()) > settings.SIGNATURE_AGENT_PROOF_MAX_SKEW_SECONDS:
            cls._raise(status.HTTP_403_FORBIDDEN, "DEVICE_PROOF_EXPIRED", "Prova do dispositivo expirada.")
        try:
            key_der = base64.b64decode(public_key_spki_base64, validate=True)
            proof = base64.b64decode(proof_text, validate=True)
            public_key = serialization.load_der_public_key(key_der)
        except (binascii.Error, TypeError, ValueError):
            cls._raise(status.HTTP_403_FORBIDDEN, "DEVICE_PROOF_INVALID", "Prova do dispositivo invÃ¡lida.")
        if not isinstance(public_key, rsa.RSAPublicKey) or public_key.key_size < 3072:
            cls._raise(status.HTTP_403_FORBIDDEN, "DEVICE_PROOF_INVALID", "Prova do dispositivo invÃ¡lida.")
        canonical = (
            f"{timestamp_text}\n{nonce}\n{method.upper()}\n{path}\n"
            f"{hashlib.sha256(raw_body).hexdigest()}"
        ).encode("utf-8")
        try:
            public_key.verify(
                proof,
                canonical,
                padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32),
                hashes.SHA256(),
            )
        except (InvalidSignature, ValueError):
            cls._raise(status.HTTP_403_FORBIDDEN, "DEVICE_PROOF_INVALID", "Prova do dispositivo invÃ¡lida.")
        return {"timestamp": request_time, "nonce": nonce}

    async def _assert_session_base_is_current(
        self, signing_session: CertificateSigningSession, document
    ) -> None:
        canonical = await self.artifacts.get_latest(
            document_id=document.id,
            artifact_type=DigitalDocumentArtifactType.CANONICAL_PDF,
            for_update=True,
        )
        target_id = await self._active_homologation_target_id(document)
        if canonical is not None and settings.HOMOLOGATION_CERTIFICATE_TARGETS_ONLY:
            if not self._has_expected_homologation_metadata(canonical, target_id):
                self._raise(
                    status.HTTP_409_CONFLICT,
                    "HOMOLOGATION_WATERMARK_REQUIRED",
                    "O artefato canÃ´nico atual nÃ£o pertence Ã  allowlist ativa.",
                )
        current_input = (
            await self._select_current_signing_input(
                document=document,
                canonical=canonical,
                homologation_target_id=target_id,
            )
            if canonical is not None
            else None
        )
        if (
            canonical is None
            or current_input is None
            or canonical.id != signing_session.canonical_artifact_id
            or current_input.id != signing_session.input_artifact_id
            or current_input.content_sha256 != signing_session.expected_content_sha256
        ):
            self._raise(
                status.HTTP_409_CONFLICT,
                "SIGNING_ARTIFACT_CHANGED",
                "O artefato de assinatura foi substituÃ­do; crie outra sessÃ£o.",
            )
        self._assert_artifact_matches_document(document, canonical, current_input)
        self.artifact_service.read_verified_bytes(current_input)

    async def _active_homologation_target_id(self, document) -> str | None:
        if not settings.HOMOLOGATION_CERTIFICATE_TARGETS_ONLY:
            return None
        target = await self.artifact_service.homologation_targets.get_active(
            document_type=document.document_type,
            source_type=document.source_type,
            source_id=document.source_id,
        )
        if target is None:
            self._raise(
                status.HTTP_403_FORBIDDEN,
                "HOMOLOGATION_SIGNING_TARGET_REQUIRED",
                "Somente registros sintÃ©ticos autorizados podem ser assinados.",
            )
        return str(target.id)

    async def _select_current_signing_input(
        self,
        *,
        document,
        canonical: DigitalDocumentArtifact,
        homologation_target_id: str | None,
    ) -> DigitalDocumentArtifact:
        all_artifacts = await self.artifacts.list_for_document(document.id)
        by_id = {item.id: item for item in all_artifacts}
        candidates = sorted(
            (
                item
                for item in all_artifacts
                if item.artifact_type == DigitalDocumentArtifactType.CERTIFIED_PDF
            ),
            key=lambda item: item.version,
            reverse=True,
        )
        for candidate in candidates:
            if self._certified_lineage_is_valid(
                candidate=candidate,
                canonical=canonical,
                by_id=by_id,
                document=document,
                homologation_target_id=homologation_target_id,
            ):
                return candidate
        return canonical

    def _certified_lineage_is_valid(
        self,
        *,
        candidate: DigitalDocumentArtifact,
        canonical: DigitalDocumentArtifact,
        by_id: dict,
        document,
        homologation_target_id: str | None,
    ) -> bool:
        current = candidate
        visited: set[UUID] = set()
        for _ in range(len(by_id) + 1):
            if current.id in visited:
                return False
            visited.add(current.id)
            if (
                current.document_id != document.id
                or current.source_content_hash != document.content_hash
            ):
                return False
            if settings.HOMOLOGATION_CERTIFICATE_TARGETS_ONLY and not self._has_expected_homologation_metadata(
                current, homologation_target_id
            ):
                return False
            if current.artifact_type == DigitalDocumentArtifactType.CANONICAL_PDF:
                return current.id == canonical.id
            if (
                current.artifact_type != DigitalDocumentArtifactType.CERTIFIED_PDF
                or current.certified_from_artifact_id is None
            ):
                return False
            parent = by_id.get(current.certified_from_artifact_id)
            if parent is None:
                return False
            current = parent
        return False

    @staticmethod
    def _has_expected_homologation_metadata(
        artifact: DigitalDocumentArtifact, homologation_target_id: str | None
    ) -> bool:
        metadata = artifact.artifact_metadata or {}
        return (
            homologation_target_id is not None
            and bool(metadata.get("homologation_watermark"))
            and metadata.get("homologation_target_id") == homologation_target_id
        )

    @staticmethod
    def _assert_artifact_matches_document(document, canonical, input_artifact) -> None:
        if (
            canonical.document_id != document.id
            or input_artifact.document_id != document.id
            or canonical.source_content_hash != document.content_hash
            or input_artifact.source_content_hash != document.content_hash
        ):
            CertificateSigningSessionService._raise(
                status.HTTP_409_CONFLICT,
                "SIGNING_ARTIFACT_SOURCE_MISMATCH",
                "O documento ou o artefato base foi alterado.",
            )

    def _build_pades_service(self, chain_der: Sequence[bytes]) -> CertificatePadesService:
        if self._pades_factory is not None:
            return self._pades_factory(chain_der)
        if settings.ICP_BRASIL_TRUST_STORE_DIR is None or not settings.SIGNATURE_TSA_URL:
            raise CertificateSigningError("ServiÃ§os de confianÃ§a nÃ£o configurados.")
        validation_context = IcpBrasilTrustStore(
            settings.ICP_BRASIL_TRUST_STORE_DIR
        ).validation_context(
            other_certificates_der=chain_der,
            allow_fetching=False,
            require_revocation=True,
        )
        auth = None
        if settings.SIGNATURE_TSA_USERNAME and settings.SIGNATURE_TSA_PASSWORD:
            auth = (settings.SIGNATURE_TSA_USERNAME, settings.SIGNATURE_TSA_PASSWORD)
        parsed = urlparse(settings.SIGNATURE_TSA_URL)
        allow_local_http = (
            settings.APP_ENV == "homologation"
            and parsed.scheme == "http"
            and parsed.hostname in {"127.0.0.1", "localhost"}
        )
        return CertificatePadesService.with_http_tsa(
            settings.SIGNATURE_TSA_URL,
            validation_context=validation_context,
            auth=auth,
            allow_local_http=allow_local_http,
        )

    def _persist_prepared_state(
        self, signing_session: CertificateSigningSession, prepared: PreparedPadesSignature
    ) -> None:
        pdf_hash = hashlib.sha256(prepared.prepared_pdf).hexdigest()
        relative_path = Path(str(signing_session.id)) / f"prepared-{pdf_hash}.pdf"
        absolute_path = self._resolve_prepared_path(relative_path)
        self._write_private_once(absolute_path, prepared.prepared_pdf, pdf_hash)
        state = {
            "version": 1,
            "prepared_pdf_sha256": pdf_hash,
            "document_digest": self._b64(prepared.document_digest),
            "reserved_region_start": prepared.reserved_region_start,
            "reserved_region_end": prepared.reserved_region_end,
            "signed_attributes": self._b64(prepared.signed_attributes),
            "signing_certificate": self._b64(prepared.signing_certificate),
            "certificate_chain": [self._b64(item) for item in prepared.certificate_chain],
            "signature_algorithm": prepared.signature_algorithm,
            "digest_algorithm": prepared.digest_algorithm,
            "field_name": prepared.field_name,
            "prepared_at": prepared.prepared_at.astimezone(UTC).isoformat(),
        }
        signing_session.prepared_pdf_path = relative_path.as_posix()
        signing_session.prepared_state = state
        signing_session.prepared_state_sha256 = self._state_hmac(state)

    def _restore_prepared_state(
        self, signing_session: CertificateSigningSession
    ) -> PreparedPadesSignature:
        state = signing_session.prepared_state
        if (
            not isinstance(state, dict)
            or not signing_session.prepared_pdf_path
            or not signing_session.prepared_state_sha256
            or not hmac.compare_digest(
                signing_session.prepared_state_sha256, self._state_hmac(state)
            )
        ):
            self._raise(status.HTTP_409_CONFLICT, "PREPARED_STATE_INVALID", "Estado preparado ausente ou invÃ¡lido.")
        path = self._resolve_prepared_path(signing_session.prepared_pdf_path)
        if not path.is_file():
            self._raise(status.HTTP_409_CONFLICT, "PREPARED_STATE_INVALID", "Estado preparado ausente ou invÃ¡lido.")
        prepared_pdf = path.read_bytes()
        if not hmac.compare_digest(
            hashlib.sha256(prepared_pdf).hexdigest(), str(state.get("prepared_pdf_sha256") or "")
        ):
            self._raise(status.HTTP_409_CONFLICT, "PREPARED_STATE_INVALID", "Estado preparado ausente ou invÃ¡lido.")
        try:
            return PreparedPadesSignature(
                prepared_pdf=prepared_pdf,
                document_digest=self._decode_state_b64(state["document_digest"]),
                reserved_region_start=int(state["reserved_region_start"]),
                reserved_region_end=int(state["reserved_region_end"]),
                signed_attributes=self._decode_state_b64(state["signed_attributes"]),
                signing_certificate=self._decode_state_b64(state["signing_certificate"]),
                certificate_chain=tuple(
                    self._decode_state_b64(item) for item in state["certificate_chain"]
                ),
                signature_algorithm=str(state["signature_algorithm"]),
                digest_algorithm=str(state["digest_algorithm"]),
                field_name=str(state["field_name"]),
                prepared_at=datetime.fromisoformat(str(state["prepared_at"])).astimezone(UTC),
            )
        except (KeyError, TypeError, ValueError, binascii.Error) as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "PREPARED_STATE_INVALID", "message": "Estado preparado ausente ou invÃ¡lido."},
            ) from exc

    async def _mark_failed(self, session_id: UUID, *, code: str, safe_detail: str) -> None:
        signing_session = await self._require_session(session_id, for_update=True)
        if signing_session.status == CertificateSigningSessionStatus.COMPLETED:
            return
        await self._fail_locked_session(
            signing_session, code=code, safe_detail=safe_detail
        )

    async def _fail_locked_session(
        self,
        signing_session: CertificateSigningSession,
        *,
        code: str,
        safe_detail: str,
    ) -> None:
        now = datetime.now(UTC)
        signing_session.status = CertificateSigningSessionStatus.FAILED
        signing_session.failure_code = code[:80]
        signing_session.failure_detail = safe_detail[:500]
        signing_session.one_time_token_hash = self._terminal_token_hash(signing_session.id)
        signing_session.token_consumed_at = now
        signing_session.updated_at = now
        signing_session.state_version += 1
        self._cleanup_prepared_state(signing_session)
        await self.db.commit()

    def _expire_session(self, signing_session: CertificateSigningSession, now: datetime) -> None:
        signing_session.status = CertificateSigningSessionStatus.EXPIRED
        signing_session.failure_code = "CERTIFICATE_SESSION_EXPIRED"
        signing_session.failure_detail = "A sessÃ£o expirou antes da conclusÃ£o."
        signing_session.one_time_token_hash = self._terminal_token_hash(signing_session.id)
        signing_session.token_consumed_at = now
        signing_session.updated_at = now
        signing_session.state_version += 1
        self._cleanup_prepared_state(signing_session)

    def _cleanup_prepared_state(self, signing_session: CertificateSigningSession) -> None:
        expected_hash = None
        if isinstance(signing_session.prepared_state, dict):
            expected_hash = signing_session.prepared_state.get("prepared_pdf_sha256")
        cleanup_error = self._discard_prepared_file(
            signing_session.prepared_pdf_path,
            expected_hash,
        )
        if cleanup_error is not None:
            raise RuntimeError("Falha ao limpar o estado PAdES preparado") from cleanup_error
        signing_session.prepared_pdf_path = None
        signing_session.prepared_state = None
        signing_session.prepared_state_sha256 = None

    def _discard_prepared_file(
        self,
        relative_path: str | None,
        expected_sha256: str | None,
    ) -> Exception | None:
        if not relative_path:
            return None
        try:
            path = self._resolve_prepared_path(relative_path)
            if not path.exists():
                return None
            if not path.is_file() or path.is_symlink():
                raise RuntimeError("Caminho preparado nÃ£o Ã© arquivo regular")
            actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
            if not expected_sha256 or not hmac.compare_digest(
                actual_hash, str(expected_sha256)
            ):
                raise RuntimeError("Hash do estado preparado divergente")
            path.unlink()
            try:
                path.parent.rmdir()
            except OSError:
                pass
        except Exception as exc:
            return exc
        return None

    @staticmethod
    def serialize_session(signing_session: CertificateSigningSession) -> dict:
        device = getattr(signing_session, "device", None)
        return {
            "id": signing_session.id,
            "document_id": signing_session.document_id,
            "canonical_artifact_id": signing_session.canonical_artifact_id,
            "input_artifact_id": signing_session.input_artifact_id,
            "device_id": device.public_key_fingerprint if device is not None else None,
            "signer_user_id": signing_session.signer_user_id,
            "status": signing_session.status,
            "expected_content_sha256": signing_session.expected_content_sha256,
            "failure_code": signing_session.failure_code,
            "expires_at": signing_session.expires_at,
            "claimed_at": signing_session.claimed_at,
            "completed_at": signing_session.completed_at,
            "cancelled_at": signing_session.cancelled_at,
            "created_at": signing_session.created_at,
            "updated_at": signing_session.updated_at,
        }

    @staticmethod
    def serialize_device(device: SignatureAgentDevice) -> dict:
        return {
            "id": device.id,
            "device_id": device.public_key_fingerprint,
            "display_name": device.display_name,
            "public_key_fingerprint": device.public_key_fingerprint,
            "status": device.status,
            "paired_at": device.paired_at,
            "last_seen_at": device.last_seen_at,
            "revoked_at": device.revoked_at,
        }

    @staticmethod
    def serialize_pairing(
        pairing: SignatureAgentPairing, device: SignatureAgentDevice | None
    ) -> dict:
        return {
            "id": pairing.id,
            "status": pairing.status,
            "expires_at": pairing.expires_at,
            "completed_at": pairing.completed_at,
            "device_id": device.public_key_fingerprint if device is not None else None,
        }

    def _verify_artifact_file(self, artifact: DigitalDocumentArtifact) -> bytes:
        return self.artifact_service.read_verified_bytes(artifact)

    @staticmethod
    def _issuer_summary(certificate: x509.Certificate) -> str | None:
        values: list[str] = []
        for oid in (NameOID.COMMON_NAME, NameOID.ORGANIZATION_NAME):
            attributes = certificate.issuer.get_attributes_for_oid(oid)
            if attributes:
                normalized = " ".join(str(attributes[0].value).split())
                if normalized and normalized not in values:
                    values.append(normalized[:100])
        summary = " / ".join(values)
        return summary[:220] or None

    @staticmethod
    def _masked_certificate_serial(certificate: x509.Certificate) -> str:
        serial = format(certificate.serial_number, "X")
        return f"***{serial[-8:]}"

    def _protected_cpf_hash(self, cpf: str) -> str:
        return self._secret_hash("certificate-cpf-v1", "identity", normalize_cpf(cpf))

    def _token_hash(self, session_id: UUID, token: str) -> str:
        return self._secret_hash("certificate-session-token-v1", session_id, token)

    def _terminal_token_hash(self, session_id: UUID) -> str:
        return self._token_hash(session_id, secrets.token_urlsafe(48))

    def _pairing_code_hash(self, pairing_id: UUID, code: str) -> str:
        return self._secret_hash("signature-agent-pairing-v1", pairing_id, code)

    @staticmethod
    def _secret_hash(domain: str, context, value: str) -> str:
        secret = (settings.SIGNATURE_EVIDENCE_SECRET or settings.SECRET_KEY).encode("utf-8")
        payload = f"{domain}\0{context}\0{value}".encode("utf-8")
        return hmac.new(secret, payload, hashlib.sha256).hexdigest()

    def _state_hmac(self, state: dict) -> str:
        canonical = json.dumps(
            state, ensure_ascii=True, sort_keys=True, separators=(",", ":")
        )
        return self._secret_hash("prepared-state-v1", "state", canonical)

    @staticmethod
    def _b64(value: bytes) -> str:
        return base64.b64encode(value).decode("ascii")

    @staticmethod
    def _decode_state_b64(value: str) -> bytes:
        return base64.b64decode(value, validate=True)

    @classmethod
    def _decode_base64(cls, value: str, field: str, max_bytes: int) -> bytes:
        try:
            decoded = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_BASE64", "message": f"Campo {field} invÃ¡lido."},
            ) from exc
        if not decoded or len(decoded) > max_bytes:
            cls._raise(status.HTTP_422_UNPROCESSABLE_ENTITY, "INVALID_PAYLOAD_SIZE", f"Campo {field} invÃ¡lido.")
        return decoded

    @staticmethod
    def _prepared_root() -> Path:
        configured = settings.SIGNATURE_PREPARED_STATE_DIR
        if configured is not None:
            return Path(configured).resolve()
        return (DocumentArtifactService._artifact_root() / "_sessions").resolve()

    def _resolve_prepared_path(self, relative_path: Path | str) -> Path:
        root = self._prepared_root()
        candidate = (root / Path(relative_path)).resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Caminho de estado preparado invÃ¡lido",
            ) from exc
        return candidate

    @staticmethod
    def _write_private_once(path: Path, content: bytes, expected_sha256: str) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            if not hmac.compare_digest(hashlib.sha256(path.read_bytes()).hexdigest(), expected_sha256):
                raise CertificateSigningError("ColisÃ£o no estado preparado.")
            return
        temporary = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    @staticmethod
    def _deadline(value: datetime) -> datetime:
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)

    @classmethod
    def _is_expired(cls, signing_session: CertificateSigningSession, now: datetime) -> bool:
        return cls._deadline(signing_session.expires_at) <= now

    @staticmethod
    def _raise(http_status: int, code: str, message: str):
        raise HTTPException(status_code=http_status, detail={"code": code, "message": message})
