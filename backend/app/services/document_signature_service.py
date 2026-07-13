from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.core.config import settings
from app.core.cpf import hash_cpf, mask_cpf
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.core.possession_responsibility import (
    RESPONSIBILITY_ACCEPTANCE_SCOPE,
    RESPONSIBILITY_ACCEPTANCE_TEXT,
    RESPONSIBILITY_ACCEPTANCE_VERSION,
    RESPONSIBILITY_TERM_MODEL_VERSION,
)
from app.core.security import verify_password
from app.models.document_signature import (
    DigitalDocument,
    DigitalDocumentStatus,
    DigitalDocumentType,
    DocumentSignature,
    DocumentSignatureRequest,
    DocumentSignatureRequestStatus,
)
from app.models.fuel_supply_order import FuelSupplyOrder
from app.models.possession import VehiclePossession
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.repositories.fuel_station_repository import FuelStationRepository
from app.repositories.fuel_supply_order_repository import FuelSupplyOrderRepository
from app.repositories.possession_repository import PossessionRepository
from app.repositories.user_repository import UserRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.document_signature import DigitalDocumentCreate, DocumentSignInput, JointSignatureRequestInput
from app.services.audit_service import AuditService


SOURCE_POSSESSION = "POSSESSION"
SOURCE_FUEL_SUPPLY_ORDER = "FUEL_SUPPLY_ORDER"
UNSIGNED_STATUS = "UNSIGNED"
PUBLIC_LOAN_TERM_PATH_PREFIX = "/validar/termo-emprestimo"
PUBLIC_RETURN_TERM_PATH_PREFIX = "/validar/termo-devolucao"
PUBLIC_FUEL_ORDER_PATH_PREFIX = "/validar/ordem-abastecimento"


class DocumentSignatureService:
    def __init__(self, db: AsyncSession | None):
        self.db = db
        self.audit = AuditService(db) if db is not None else None
        self.users = UserRepository(db) if db is not None else None
        self.possessions = PossessionRepository(db) if db is not None else None
        self.orders = FuelSupplyOrderRepository(db) if db is not None else None
        self.vehicles = VehicleRepository(db) if db is not None else None
        self.fuel_stations = FuelStationRepository(db) if db is not None else None

    async def create_document(self, data: DigitalDocumentCreate, current_user: User) -> dict:
        self._ensure_ready()
        self._ensure_module_permission(current_user, data.document_type, "edit")
        self._ensure_possession_term_mutation_allowed(current_user, data.document_type)
        context = await self._build_document_context(data.document_type, data.source_id, current_user=current_user)
        await self._lock_source(data.document_type, data.source_id)
        context = await self._build_document_context(
            data.document_type,
            data.source_id,
            current_user=current_user,
            refresh_source=True,
        )
        now = datetime.now(timezone.utc)

        existing = await self._get_active_document(data.document_type, data.source_id, for_update=True)
        if existing and existing.content_hash == context["content_hash"]:
            return self._serialize_document(existing)

        if existing:
            await self._supersede_document(existing, current_user=current_user, reason="SOURCE_CHANGED", now=now)

        document = DigitalDocument(
            document_type=data.document_type,
            source_type=context["source_type"],
            source_id=data.source_id,
            organization_id=context["organization_id"],
            title=context["title"],
            public_validation_code=context["public_validation_code"],
            public_validation_path=context["public_validation_path"],
            content_hash=context["content_hash"],
            evidence_hmac=context["evidence_hmac"],
            snapshot=context["snapshot"],
            status=DigitalDocumentStatus.PENDING,
            required_signatures=1,
            created_by_user_id=current_user.id,
            created_at=now,
            updated_at=now,
        )
        self.db.add(document)

        try:
            await self.db.flush()
            await self.db.refresh(document)
            await self._record_audit(
                current_user,
                action="CREATE",
                document=document,
                details={
                    "event": "CREATE_DIGITAL_DOCUMENT",
                    "document_type": document.document_type,
                    "source_type": document.source_type,
                    "source_id": str(document.source_id),
                    "content_hash": document.content_hash,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível criar o documento digital") from exc

        created = await self._get_document(document.id)
        return self._serialize_document(created or document)

    async def get_document(self, document_id: UUID, current_user: User) -> dict:
        self._ensure_ready()
        document = await self._require_document(document_id)
        self._ensure_module_permission(current_user, document.document_type, "view")
        await self._ensure_document_visible(document, current_user)
        include_restricted = current_user.role in {UserRole.ADMIN, UserRole.PRODUCAO}
        payload = self._serialize_document(
            document,
            include_snapshot=include_restricted,
            include_evidence=include_restricted,
        )
        if include_restricted:
            return payload
        return self.sanitize_summary_for_restricted_view(payload)

    async def sign_document(self, document_id: UUID, data: DocumentSignInput, current_user: User) -> dict:
        self._ensure_ready()
        document = await self._require_document(document_id)
        self._ensure_module_permission(current_user, document.document_type, "edit")
        await self._ensure_document_visible(document, current_user)
        self._ensure_possession_term_mutation_allowed(current_user, document.document_type)
        await self._lock_source(document.document_type, document.source_id)
        document = await self._require_document(document_id, for_update=True)
        self._ensure_module_permission(current_user, document.document_type, "edit")
        await self._ensure_document_visible(
            document,
            current_user,
            refresh_source=True,
            supersede_stale=True,
        )
        self._ensure_possession_term_mutation_allowed(current_user, document.document_type)

        if document.status in {DigitalDocumentStatus.SUPERSEDED, DigitalDocumentStatus.CANCELLED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Documento não está mais disponível para assinatura")
        if current_user.must_change_password:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Troca de senha obrigatória antes de assinar")
        if not current_user.cpf:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Informe seu CPF antes de assinar")
        if not verify_password(data.current_password, current_user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Senha atual incorreta")
        if any(signature.signer_user_id == current_user.id for signature in document.signatures):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Usuário já assinou este documento")
        if not self._can_user_sign_document(document, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário não está autorizado a assinar este documento")

        now = datetime.now(timezone.utc)
        signature = DocumentSignature(
            signer_user_id=current_user.id,
            signer_name=current_user.name,
            signer_email=current_user.email,
            signer_role=current_user.role.value if current_user.role else None,
            signer_organization_id=current_user.organization_id,
            signer_organization_name=current_user.organization_name,
            signer_cpf_masked=mask_cpf(current_user.cpf),
            signer_cpf_hash=hash_cpf(current_user.cpf),
            content_hash=document.content_hash,
            signature_fingerprint=self._build_signature_fingerprint(document, current_user, now),
            signed_at=now,
        )
        document.signatures.append(signature)

        for request in document.signature_requests:
            if request.status == DocumentSignatureRequestStatus.PENDING and request.requested_signer_user_id == current_user.id:
                request.status = DocumentSignatureRequestStatus.SIGNED
                request.responded_at = now
                request.updated_at = now

        try:
            await self.db.flush()
            await self._refresh_document_status(document, now=now)
            await self._record_audit(
                current_user,
                action="SIGN",
                document=document,
                details={
                    "event": "SIGN_DIGITAL_DOCUMENT",
                    "document_type": document.document_type,
                    "source_type": document.source_type,
                    "source_id": str(document.source_id),
                    "content_hash": document.content_hash,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A assinatura já foi registrada ou o documento foi atualizado",
            ) from exc

        updated = await self._require_document(document.id)
        return self._serialize_document(updated)

    async def request_joint_signature(self, document_id: UUID, data: JointSignatureRequestInput, current_user: User) -> dict:
        self._ensure_ready()
        document = await self._require_document(document_id)
        self._ensure_module_permission(current_user, document.document_type, "edit")
        self._ensure_possession_term_mutation_allowed(current_user, document.document_type)
        await self._ensure_document_visible(document, current_user)
        await self._lock_source(document.document_type, document.source_id)
        document = await self._require_document(document_id, for_update=True)
        self._ensure_module_permission(current_user, document.document_type, "edit")
        self._ensure_possession_term_mutation_allowed(current_user, document.document_type)
        await self._ensure_document_visible(
            document,
            current_user,
            refresh_source=True,
            supersede_stale=True,
        )
        if document.status in {DigitalDocumentStatus.SUPERSEDED, DigitalDocumentStatus.CANCELLED}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Documento não está disponível para coassinatura")
        if data.requested_signer_user_id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selecione outro servidor para coassinar")
        if any(signature.signer_user_id == data.requested_signer_user_id for signature in document.signatures):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Servidor selecionado já assinou este documento")
        if any(
            request.status == DocumentSignatureRequestStatus.PENDING
            and request.requested_signer_user_id == data.requested_signer_user_id
            for request in document.signature_requests
        ):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe solicitação pendente para este servidor")

        signer = await self.users.get_by_id(data.requested_signer_user_id)
        if not signer:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Servidor selecionado não encontrado")
        self._ensure_signer_can_be_requested(current_user=current_user, requested_signer=signer)
        self._ensure_module_permission(signer, document.document_type, "edit")
        self._ensure_possession_term_mutation_allowed(signer, document.document_type)
        await self._ensure_document_visible(document, signer, refresh_source=True)

        now = datetime.now(timezone.utc)
        request = DocumentSignatureRequest(
            requested_by_user_id=current_user.id,
            requested_signer_user_id=signer.id,
            status=DocumentSignatureRequestStatus.PENDING,
            message=data.message,
            created_at=now,
            updated_at=now,
        )
        document.signature_requests.append(request)
        await self._refresh_document_status(document, now=now)

        await self._record_audit(
            current_user,
            action="REQUEST_SIGNATURE",
            document=document,
            details={
                "event": "REQUEST_JOINT_SIGNATURE",
                "requested_signer_user_id": str(signer.id),
                "requested_signer_name": signer.name,
                "document_type": document.document_type,
                "content_hash": document.content_hash,
            },
        )
        await self.db.flush()
        await self.db.commit()

        updated = await self._require_document(document.id)
        return self._serialize_document(updated)

    async def list_pending(self, current_user: User) -> list[dict]:
        self._ensure_ready()
        result = await self.db.execute(
            select(DocumentSignatureRequest)
            .options(
                joinedload(DocumentSignatureRequest.document).selectinload(DigitalDocument.signatures),
                joinedload(DocumentSignatureRequest.document).selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requester),
                joinedload(DocumentSignatureRequest.document).selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requested_signer),
                joinedload(DocumentSignatureRequest.requester),
                joinedload(DocumentSignatureRequest.requested_signer),
            )
            .where(
                DocumentSignatureRequest.requested_signer_user_id == current_user.id,
                DocumentSignatureRequest.status == DocumentSignatureRequestStatus.PENDING,
            )
            .order_by(DocumentSignatureRequest.created_at.desc())
        )
        requests = list(result.scalars().unique().all())
        payloads = []
        for request in requests:
            if not request.document or request.document.status != DigitalDocumentStatus.PENDING:
                continue
            try:
                self._ensure_module_permission(current_user, request.document.document_type, "edit")
                self._ensure_possession_term_mutation_allowed(current_user, request.document.document_type)
                await self._ensure_document_visible(request.document, current_user)
            except HTTPException:
                continue
            payloads.append(
                {
                    "id": request.id,
                    "requested_by_name": request.requester.name if request.requester else None,
                    "status": request.status,
                    "message": request.message,
                    "created_at": request.created_at,
                    "document": {
                        "document_id": request.document.id,
                        "document_type": request.document.document_type,
                        "title": request.document.title,
                        "status": request.document.status,
                        "content_hash_short": request.document.content_hash[:12],
                    },
                }
            )
        return payloads

    async def decline_request(self, request_id: UUID, current_user: User) -> dict:
        self._ensure_ready()
        initial_request = await self._require_request(request_id)
        if not initial_request.document:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento digital não encontrado")
        self._ensure_module_permission(current_user, initial_request.document.document_type, "edit")
        self._ensure_possession_term_mutation_allowed(current_user, initial_request.document.document_type)
        await self._ensure_document_visible(initial_request.document, current_user)
        if initial_request.requested_signer_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solicitação não pertence ao usuário atual")
        if initial_request.status != DocumentSignatureRequestStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solicitação não está pendente")
        await self._lock_source(initial_request.document.document_type, initial_request.document.source_id)
        await self._lock_document(initial_request.document.id)
        await self._lock_request(request_id)
        request = await self._require_request(request_id, populate_existing=True)
        if request.document:
            self._ensure_module_permission(current_user, request.document.document_type, "edit")
            self._ensure_possession_term_mutation_allowed(current_user, request.document.document_type)
            await self._ensure_document_visible(
                request.document,
                current_user,
                refresh_source=True,
                supersede_stale=True,
            )
        if request.requested_signer_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solicitação não pertence ao usuário atual")
        if request.status != DocumentSignatureRequestStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solicitação não está pendente")

        now = datetime.now(timezone.utc)
        request.status = DocumentSignatureRequestStatus.DECLINED
        request.responded_at = now
        request.updated_at = now
        if request.document:
            await self._refresh_document_status(request.document, now=now)
            await self._record_audit(
                current_user,
                action="DECLINE_SIGNATURE",
                document=request.document,
                details={
                    "event": "DECLINE_JOINT_SIGNATURE",
                    "request_id": str(request.id),
                    "content_hash": request.document.content_hash,
                },
            )
        await self.db.flush()
        await self.db.commit()
        return self._serialize_request(request)

    async def cancel_request(self, request_id: UUID, current_user: User) -> dict:
        self._ensure_ready()
        initial_request = await self._require_request(request_id)
        if not initial_request.document:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento digital não encontrado")
        self._ensure_module_permission(current_user, initial_request.document.document_type, "edit")
        self._ensure_possession_term_mutation_allowed(current_user, initial_request.document.document_type)
        await self._ensure_document_visible(initial_request.document, current_user)
        if initial_request.status != DocumentSignatureRequestStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solicitação não está pendente")
        if current_user.role != UserRole.ADMIN and initial_request.requested_by_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas o solicitante ou administrador pode cancelar")
        await self._lock_source(initial_request.document.document_type, initial_request.document.source_id)
        await self._lock_document(initial_request.document.id)
        await self._lock_request(request_id)
        request = await self._require_request(request_id, populate_existing=True)
        if request.document:
            self._ensure_module_permission(current_user, request.document.document_type, "edit")
            self._ensure_possession_term_mutation_allowed(current_user, request.document.document_type)
        if request.status != DocumentSignatureRequestStatus.PENDING:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Solicitação não está pendente")
        if current_user.role != UserRole.ADMIN and request.requested_by_user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas o solicitante ou administrador pode cancelar")
        if request.document:
            await self._ensure_document_visible(
                request.document,
                current_user,
                refresh_source=True,
                supersede_stale=True,
            )

        now = datetime.now(timezone.utc)
        request.status = DocumentSignatureRequestStatus.CANCELLED
        request.responded_at = now
        request.updated_at = now
        if request.document:
            await self._refresh_document_status(request.document, now=now)
            await self._record_audit(
                current_user,
                action="CANCEL_SIGNATURE_REQUEST",
                document=request.document,
                details={
                    "event": "CANCEL_JOINT_SIGNATURE_REQUEST",
                    "request_id": str(request.id),
                    "content_hash": request.document.content_hash,
                },
            )
        await self.db.flush()
        await self.db.commit()
        return self._serialize_request(request)

    async def get_summary_for_source(self, document_type: str, source_id: UUID | None) -> dict:
        if self.db is None or source_id is None:
            return self._unsigned_summary(document_type, source_id)
        document = await self._get_active_document(document_type, source_id)
        if not document:
            return self._unsigned_summary(document_type, source_id)
        return self._serialize_document(document, include_snapshot=False, include_evidence=False)

    async def lock_source_for_consistent_read(
        self,
        document_type: str,
        source_id: UUID,
        *,
        current_user: User,
    ) -> None:
        """Authorize and lock a source before composing an official document."""
        self._ensure_module_permission(current_user, document_type, "view")
        await self._build_document_context(document_type, source_id, current_user=current_user)
        await self._lock_source(document_type, source_id)

    async def get_validated_summary_for_source(
        self,
        document_type: str,
        source_id: UUID | None,
        *,
        current_user: User,
        supersede_stale: bool = True,
        source_is_locked: bool = False,
    ) -> dict:
        """Return a signature only when it still matches the canonical source snapshot."""
        if self.db is None or source_id is None:
            return self._unsigned_summary(document_type, source_id)
        self._ensure_module_permission(current_user, document_type, "view")
        context = None
        if supersede_stale or source_is_locked:
            if not source_is_locked:
                # The first context is an authorization/existence precheck only.
                await self._build_document_context(document_type, source_id, current_user=current_user)
                await self._lock_source(document_type, source_id)
            context = await self._build_document_context(
                document_type,
                source_id,
                current_user=current_user,
                refresh_source=True,
            )
        document = await self._get_active_document(
            document_type,
            source_id,
            for_update=supersede_stale or source_is_locked,
        )
        if not document:
            return self._unsigned_summary(document_type, source_id)
        if context is None:
            context = await self._build_document_context(document_type, source_id, current_user=current_user)
        if document.content_hash != context["content_hash"]:
            if supersede_stale:
                await self._supersede_document(
                    document,
                    current_user=current_user,
                    reason="SOURCE_CHANGED",
                    now=datetime.now(timezone.utc),
                )
                await self.db.flush()
            return self._unsigned_summary(document_type, source_id)
        return self._serialize_document(document, include_snapshot=True, include_evidence=False)

    async def mark_source_documents_superseded(
        self,
        *,
        source_type: str,
        source_id: UUID,
        document_types: list[str] | None = None,
        current_user: User,
        reason: str,
    ) -> None:
        if self.db is None or not hasattr(self.db, "execute"):
            return
        stmt = select(DigitalDocument).options(selectinload(DigitalDocument.signature_requests)).where(
            DigitalDocument.source_type == source_type,
            DigitalDocument.source_id == source_id,
            DigitalDocument.status.in_([DigitalDocumentStatus.PENDING, DigitalDocumentStatus.COMPLETED]),
        )
        if document_types:
            stmt = stmt.where(DigitalDocument.document_type.in_(document_types))
        result = await self.db.execute(stmt)
        documents = list(result.scalars().unique().all())
        now = datetime.now(timezone.utc)
        for document in documents:
            await self._supersede_document(document, current_user=current_user, reason=reason, now=now)

    def build_hash_for_snapshot(self, snapshot: dict) -> str:
        return hashlib.sha256(self._canonical_json(snapshot).encode("utf-8")).hexdigest()

    async def _build_document_context(
        self,
        document_type: str,
        source_id: UUID,
        *,
        current_user: User,
        refresh_source: bool = False,
    ) -> dict:
        normalized_type = document_type.strip().upper()
        if normalized_type == DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM:
            return await self._build_possession_responsibility_context(
                source_id,
                current_user=current_user,
                refresh_source=refresh_source,
            )
        if normalized_type in {DigitalDocumentType.POSSESSION_LOAN_TERM, DigitalDocumentType.POSSESSION_RETURN_TERM}:
            return await self._build_possession_context(
                normalized_type,
                source_id,
                current_user=current_user,
                refresh_source=refresh_source,
            )
        if normalized_type == DigitalDocumentType.FUEL_SUPPLY_ORDER:
            return await self._build_order_context(
                source_id,
                current_user=current_user,
                refresh_source=refresh_source,
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de documento não suportado")

    async def _build_possession_responsibility_context(
        self,
        source_id: UUID,
        *,
        current_user: User,
        refresh_source: bool = False,
    ) -> dict:
        """Build the stable delivery/acceptance scope signed by the current term.

        Trips and the append-only return confirmation are intentionally outside this
        snapshot: they are later events incorporated into the same official term and
        must not force the delivery acknowledgement to be signed again.
        """
        record = await self.possessions.get_term_graph(
            source_id,
            populate_existing=refresh_source,
        )
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")
        await self._ensure_vehicle_visible_to_user(record.vehicle_id, current_user)

        title = f"Termo de Posse e Responsabilidade nº {record.public_number}"
        organization_id = getattr(record.driver, "organization_id", None) or getattr(current_user, "organization_id", None)
        evidence = sorted(
            (
                {
                    "id": str(photo.id),
                    "mime_type": photo.photo_mime_type,
                    "size_bytes": photo.photo_size_bytes,
                    "captured_at": photo.photo_captured_at,
                    "created_at": photo.created_at,
                }
                for photo in record.photos
            ),
            key=lambda item: (str(item["created_at"]), item["id"]),
        )
        snapshot = {
            "schema_version": "possession-responsibility-acceptance.v1",
            "document_model_version": RESPONSIBILITY_TERM_MODEL_VERSION,
            "document_type": DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            "source_type": SOURCE_POSSESSION,
            "source_id": str(record.id),
            "term_number": record.public_number,
            "scope": RESPONSIBILITY_ACCEPTANCE_SCOPE,
            "acceptance": {
                "version": RESPONSIBILITY_ACCEPTANCE_VERSION,
                "text": RESPONSIBILITY_ACCEPTANCE_TEXT,
            },
            "title": title,
            "vehicle": {
                "id": str(record.vehicle_id),
                "plate": record.vehicle.plate if record.vehicle else None,
                "brand": record.vehicle.brand if record.vehicle else None,
                "model": record.vehicle.model if record.vehicle else None,
            },
            "responsible_driver": {
                "id": str(record.driver_id) if record.driver_id else None,
                "name": record.driver_name,
                "document_masked": self._mask_document(record.driver_document),
                "document_sha256": self._hash_optional_value(record.driver_document),
                "contact_sha256": self._hash_optional_value(record.driver_contact),
            },
            "delivery": {
                "delivered_at": record.start_date,
                "odometer_km": self._canonical_decimal(record.start_odometer_km),
                "observation": record.observation,
                "evidence": evidence,
            },
        }
        return self._build_context_payload(
            snapshot=snapshot,
            source_type=SOURCE_POSSESSION,
            organization_id=organization_id,
            title=title,
            public_validation_code=None,
            public_validation_path=None,
        )

    async def _build_possession_context(
        self,
        document_type: str,
        source_id: UUID,
        *,
        current_user: User,
        refresh_source: bool = False,
    ) -> dict:
        record = await self.possessions.get_by_id(
            source_id,
            populate_existing=refresh_source,
        )
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de posse não encontrado")
        await self._ensure_vehicle_visible_to_user(record.vehicle_id, current_user)

        is_return = document_type == DigitalDocumentType.POSSESSION_RETURN_TERM
        if is_return and record.end_date is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Termo de devolução ainda não está disponível")

        validation_code = record.return_term_validation_code if is_return else record.loan_term_validation_code
        public_path = self._build_possession_public_path(validation_code, term_type="return" if is_return else "loan")
        title = f"Termo de {'devolução' if is_return else 'empréstimo'} - {record.vehicle.plate if record.vehicle else record.vehicle_id}"
        organization_id = getattr(record.driver, "organization_id", None) or getattr(current_user, "organization_id", None)

        snapshot = {
            "document_type": document_type,
            "source_type": SOURCE_POSSESSION,
            "source_id": str(record.id),
            "term_type": "return" if is_return else "loan",
            "title": title,
            "validation_code": validation_code,
            "public_validation_path": public_path,
            "vehicle": {
                "id": str(record.vehicle_id),
                "plate": record.vehicle.plate if record.vehicle else None,
                "brand": record.vehicle.brand if record.vehicle else None,
                "model": record.vehicle.model if record.vehicle else None,
            },
            "driver": {
                "id": str(record.driver_id) if record.driver_id else None,
                "name": record.driver_name,
                "document_masked": self._mask_document(record.driver_document),
                "document_sha256": self._hash_optional_value(record.driver_document),
                "contact_sha256": self._hash_optional_value(record.driver_contact),
            },
            "start_date": record.start_date,
            "start_odometer_km": record.start_odometer_km,
            "observation": record.observation,
            "created_at": record.created_at,
        }
        if is_return:
            snapshot.update(
                {
                    "end_date": record.end_date,
                    "end_odometer_km": record.end_odometer_km,
                    "kilometers_driven": self._calculate_kilometers_driven(record.start_odometer_km, record.end_odometer_km),
                }
            )

        return self._build_context_payload(
            snapshot=snapshot,
            source_type=SOURCE_POSSESSION,
            organization_id=organization_id,
            title=title,
            public_validation_code=validation_code,
            public_validation_path=public_path,
        )

    async def _build_order_context(
        self,
        source_id: UUID,
        *,
        current_user: User,
        refresh_source: bool = False,
    ) -> dict:
        order = await self.orders.get_by_id(
            source_id,
            populate_existing=refresh_source,
        )
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")
        await self._ensure_order_visible_to_user(order, current_user)
        if current_user.role == UserRole.POSTO:
            await self._ensure_station_access(current_user=current_user, order=order)

        public_path = f"{PUBLIC_FUEL_ORDER_PATH_PREFIX}/{order.validation_code}"
        title = f"Ordem de abastecimento {self._build_order_number(order)}"
        snapshot = {
            "document_type": DigitalDocumentType.FUEL_SUPPLY_ORDER,
            "source_type": SOURCE_FUEL_SUPPLY_ORDER,
            "source_id": str(order.id),
            "title": title,
            "request_number": self._build_order_number(order),
            "validation_code": order.validation_code,
            "public_validation_path": public_path,
            "status": order.status.value if hasattr(order.status, "value") else order.status,
            "vehicle": {
                "id": str(order.vehicle_id),
                "plate": order.vehicle.plate if order.vehicle else None,
                "brand": order.vehicle.brand if order.vehicle else None,
                "model": order.vehicle.model if order.vehicle else None,
            },
            "organization": {
                "id": str(order.organization_id) if order.organization_id else None,
                "name": order.organization.name if order.organization else None,
            },
            "fuel_station": {
                "id": str(order.fuel_station_id) if order.fuel_station_id else None,
                "name": order.fuel_station_ref.name if order.fuel_station_ref else None,
                "cnpj": order.fuel_station_ref.cnpj if order.fuel_station_ref else None,
            },
            "created_by_name": order.creator.name if order.creator else None,
            "confirmed_by_name": order.confirmer.name if order.confirmer else None,
            "requested_liters": float(order.requested_liters) if order.requested_liters is not None else None,
            "notes": order.notes,
            "expires_at": order.expires_at,
            "confirmed_at": order.confirmed_at,
            "created_at": order.created_at,
        }

        return self._build_context_payload(
            snapshot=snapshot,
            source_type=SOURCE_FUEL_SUPPLY_ORDER,
            organization_id=order.organization_id,
            title=title,
            public_validation_code=order.validation_code,
            public_validation_path=public_path,
        )

    def _build_context_payload(
        self,
        *,
        snapshot: dict,
        source_type: str,
        organization_id: UUID | None,
        title: str,
        public_validation_code: str | None,
        public_validation_path: str | None,
    ) -> dict:
        encoded_snapshot = jsonable_encoder(snapshot)
        content_hash = self.build_hash_for_snapshot(encoded_snapshot)
        return {
            "source_type": source_type,
            "organization_id": organization_id,
            "title": title,
            "public_validation_code": public_validation_code,
            "public_validation_path": public_validation_path,
            "snapshot": encoded_snapshot,
            "content_hash": content_hash,
            "evidence_hmac": self._build_evidence_hmac(source_type, public_validation_code, content_hash),
        }

    async def _ensure_vehicle_visible_to_user(self, vehicle_id: UUID, current_user: User) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
            return
        if not await self.vehicles.is_vehicle_in_organization(vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")

    async def _ensure_order_visible_to_user(self, order: FuelSupplyOrder, current_user: User) -> None:
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ordem de abastecimento não encontrada")
            return
        if order.organization_id == organization_id:
            return
        await self._ensure_vehicle_visible_to_user(order.vehicle_id, current_user)

    async def _ensure_station_access(self, *, current_user: User, order: FuelSupplyOrder) -> None:
        if not order.fuel_station_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ordem sem posto vinculado")
        has_access = await self.fuel_stations.has_active_user_link(user_id=current_user.id, fuel_station_id=order.fuel_station_id)
        if not has_access:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário não possui vínculo ativo com o posto da ordem")

    async def _ensure_document_visible(
        self,
        document: DigitalDocument,
        current_user: User,
        *,
        refresh_source: bool = False,
        supersede_stale: bool = False,
    ) -> None:
        if document.source_type == SOURCE_POSSESSION:
            context = await self._build_document_context(
                document.document_type,
                document.source_id,
                current_user=current_user,
                refresh_source=refresh_source,
            )
        elif document.source_type == SOURCE_FUEL_SUPPLY_ORDER:
            context = await self._build_document_context(
                document.document_type,
                document.source_id,
                current_user=current_user,
                refresh_source=refresh_source,
            )
        else:
            context = None
        if context and document.status in {DigitalDocumentStatus.PENDING, DigitalDocumentStatus.COMPLETED}:
            if document.content_hash != context["content_hash"]:
                if supersede_stale:
                    await self._supersede_document(
                        document,
                        current_user=current_user,
                        reason="SOURCE_CHANGED",
                        now=datetime.now(timezone.utc),
                    )
                    await self.db.flush()
                    await self.db.commit()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "DIGITAL_DOCUMENT_SOURCE_CHANGED",
                        "message": "O conteúdo do documento foi atualizado e precisa ser emitido novamente.",
                    },
                )

    def _ensure_module_permission(self, user: User, document_type: str, action: str) -> None:
        module = self._permission_module_for_document_type(document_type)
        field = f"can_{action}"
        if not bool(user.permissions.get(module, {}).get(field)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permissão insuficiente para o documento")

    def _ensure_possession_term_mutation_allowed(self, user: User, document_type: str) -> None:
        if document_type not in {
            DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            DigitalDocumentType.POSSESSION_LOAN_TERM,
            DigitalDocumentType.POSSESSION_RETURN_TERM,
        }:
            return
        if user.role not in {UserRole.ADMIN, UserRole.PRODUCAO}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Perfil autorizado apenas para consulta do termo de posse",
            )

    def _can_user_sign_document(self, document: DigitalDocument, current_user: User) -> bool:
        if current_user.role == UserRole.ADMIN:
            return True
        if document.created_by_user_id == current_user.id:
            return True
        return any(
            request.status == DocumentSignatureRequestStatus.PENDING and request.requested_signer_user_id == current_user.id
            for request in document.signature_requests
        )

    def _ensure_signer_can_be_requested(self, *, current_user: User, requested_signer: User) -> None:
        if requested_signer.must_change_password:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Servidor selecionado precisa regularizar a senha antes de assinar")
        if not requested_signer.cpf:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Servidor selecionado precisa informar o CPF antes de assinar")
        if current_user.role == UserRole.ADMIN:
            return
        current_org = getattr(current_user, "organization_id", None)
        if current_org is None or requested_signer.organization_id != current_org:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Servidor deve pertencer à mesma secretaria")

    async def _supersede_document(self, document: DigitalDocument, *, current_user: User, reason: str, now: datetime) -> None:
        document.status = DigitalDocumentStatus.SUPERSEDED
        document.superseded_at = now
        document.updated_at = now
        for request in document.signature_requests:
            if request.status == DocumentSignatureRequestStatus.PENDING:
                request.status = DocumentSignatureRequestStatus.SUPERSEDED
                request.responded_at = now
                request.updated_at = now
        await self._record_audit(
            current_user,
            action="SUPERSEDE",
            document=document,
            details={
                "event": "SUPERSEDE_DIGITAL_DOCUMENT",
                "reason": reason,
                "document_type": document.document_type,
                "source_type": document.source_type,
                "source_id": str(document.source_id),
                "content_hash": document.content_hash,
            },
        )

    async def _refresh_document_status(self, document: DigitalDocument, *, now: datetime) -> None:
        joint_requests = [
            request
            for request in document.signature_requests
            if request.status in {
                DocumentSignatureRequestStatus.PENDING,
                DocumentSignatureRequestStatus.SIGNED,
            }
        ]
        pending_count = sum(
            1 for request in joint_requests if request.status == DocumentSignatureRequestStatus.PENDING
        )
        signed_count = len(document.signatures)
        creator_signed = bool(
            document.created_by_user_id
            and any(signature.signer_user_id == document.created_by_user_id for signature in document.signatures)
        )
        signed_request_ids = {
            getattr(request, "requested_signer_user_id", None)
            for request in joint_requests
            if request.status == DocumentSignatureRequestStatus.SIGNED
        }
        signed_request_ids.discard(None)
        signer_ids = {getattr(signature, "signer_user_id", None) for signature in document.signatures}
        all_joint_signatures_present = signed_request_ids.issubset(signer_ids)
        document.required_signatures = 1 + len(joint_requests)

        if joint_requests:
            is_complete = creator_signed and pending_count == 0 and all_joint_signatures_present
        else:
            is_complete = signed_count >= 1

        if is_complete:
            document.status = DigitalDocumentStatus.COMPLETED
            document.completed_at = document.completed_at or now
        else:
            document.status = DigitalDocumentStatus.PENDING
            document.completed_at = None
        document.updated_at = now

    async def _lock_source(self, document_type: str, source_id: UUID) -> None:
        if document_type in {
            DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            DigitalDocumentType.POSSESSION_LOAN_TERM,
            DigitalDocumentType.POSSESSION_RETURN_TERM,
        }:
            source_model = VehiclePossession
        else:
            source_model = FuelSupplyOrder
        result = await self.db.execute(
            select(source_model.vehicle_id).where(source_model.id == source_id)
        )
        vehicle_id = result.scalar_one_or_none()
        if vehicle_id is not None:
            await self.db.execute(
                select(Vehicle.id).where(Vehicle.id == vehicle_id).with_for_update()
            )
        await self.db.execute(
            select(source_model.id)
            .where(source_model.id == source_id)
            .with_for_update()
        )

    async def _lock_document(self, document_id: UUID) -> None:
        await self.db.execute(
            select(DigitalDocument.id)
            .where(DigitalDocument.id == document_id)
            .with_for_update()
        )

    async def _lock_request(self, request_id: UUID) -> None:
        await self.db.execute(
            select(DocumentSignatureRequest.id)
            .where(DocumentSignatureRequest.id == request_id)
            .with_for_update()
        )

    async def _get_active_document(
        self,
        document_type: str,
        source_id: UUID,
        *,
        for_update: bool = False,
    ) -> DigitalDocument | None:
        statement = (
            select(DigitalDocument)
            .options(
                selectinload(DigitalDocument.signatures),
                selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requester),
                selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requested_signer),
            )
            .where(
                DigitalDocument.document_type == document_type,
                DigitalDocument.source_id == source_id,
                DigitalDocument.status.in_([DigitalDocumentStatus.PENDING, DigitalDocumentStatus.COMPLETED]),
            )
            .order_by(DigitalDocument.created_at.desc())
        )
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        result = await self.db.execute(statement)
        return result.scalars().unique().first()

    async def _get_document(self, document_id: UUID, *, for_update: bool = False) -> DigitalDocument | None:
        statement = (
            select(DigitalDocument)
            .options(
                selectinload(DigitalDocument.signatures),
                selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requester),
                selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requested_signer),
            )
            .where(DigitalDocument.id == document_id)
        )
        if for_update:
            statement = statement.with_for_update().execution_options(populate_existing=True)
        result = await self.db.execute(statement)
        return result.scalars().unique().first()

    async def _require_document(self, document_id: UUID, *, for_update: bool = False) -> DigitalDocument:
        document = await self._get_document(document_id, for_update=for_update)
        if not document:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento digital não encontrado")
        return document

    async def _require_request(
        self,
        request_id: UUID,
        *,
        populate_existing: bool = False,
    ) -> DocumentSignatureRequest:
        statement = (
            select(DocumentSignatureRequest)
            .options(
                joinedload(DocumentSignatureRequest.document).selectinload(DigitalDocument.signatures),
                joinedload(DocumentSignatureRequest.document).selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requester),
                joinedload(DocumentSignatureRequest.document).selectinload(DigitalDocument.signature_requests).joinedload(DocumentSignatureRequest.requested_signer),
                joinedload(DocumentSignatureRequest.requester),
                joinedload(DocumentSignatureRequest.requested_signer),
            )
            .where(DocumentSignatureRequest.id == request_id)
        )
        if populate_existing:
            statement = statement.execution_options(populate_existing=True)
        result = await self.db.execute(statement)
        request = result.scalars().unique().first()
        if not request:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Solicitação de assinatura não encontrada")
        return request

    async def _record_audit(self, actor: User, *, action: str, document: DigitalDocument, details: dict) -> None:
        if self.audit is None:
            return
        await self.audit.record(
            actor=actor,
            action=action,
            entity_type="DIGITAL_DOCUMENT",
            entity_id=document.id,
            entity_label=document.title,
            details=details,
        )

    def _serialize_document(
        self,
        document: DigitalDocument,
        *,
        include_snapshot: bool = True,
        include_evidence: bool = True,
    ) -> dict:
        pending_count = sum(1 for request in document.signature_requests if request.status == DocumentSignatureRequestStatus.PENDING)
        declined_count = sum(1 for request in document.signature_requests if request.status == DocumentSignatureRequestStatus.DECLINED)
        payload = {
            "document_id": document.id,
            "document_type": document.document_type,
            "source_id": document.source_id,
            "status": document.status,
            "title": document.title,
            "content_hash": document.content_hash,
            "content_hash_short": document.content_hash[:12],
            "public_validation_code": document.public_validation_code,
            "public_validation_path": document.public_validation_path,
            "required_signatures": document.required_signatures,
            "signed_count": len(document.signatures),
            "pending_count": pending_count,
            "declined_count": declined_count,
            "is_complete": document.status == DigitalDocumentStatus.COMPLETED,
            "signatures": [self._serialize_signature(signature) for signature in document.signatures],
            "requests": [self._serialize_request(request) for request in document.signature_requests],
            "created_by_user_id": document.created_by_user_id,
            "created_at": document.created_at,
            "updated_at": document.updated_at,
            "completed_at": document.completed_at,
            "superseded_at": document.superseded_at,
        }
        if include_evidence:
            payload["evidence_hmac"] = document.evidence_hmac
        if include_snapshot:
            payload["snapshot"] = document.snapshot
        return payload

    @staticmethod
    def sanitize_summary_for_restricted_view(summary: dict) -> dict:
        """Project a document summary without people, internal IDs or integrity metadata."""
        return {
            "document_id": None,
            "document_type": summary.get("document_type"),
            "source_id": None,
            "status": summary.get("status", UNSIGNED_STATUS),
            "title": summary.get("title"),
            "content_hash": None,
            "content_hash_short": None,
            "public_validation_code": None,
            "public_validation_path": None,
            "required_signatures": summary.get("required_signatures", 1),
            "signed_count": summary.get("signed_count", 0),
            "pending_count": summary.get("pending_count", 0),
            "declined_count": summary.get("declined_count", 0),
            "is_complete": bool(summary.get("is_complete")),
            "signatures": [],
            "requests": [],
        }

    @staticmethod
    def sanitize_summary_for_legacy_public_view(summary: dict) -> dict:
        """Preserve historical public validation without exposing contact or request data."""
        payload = {
            **summary,
            "signatures": [
                {
                    key: value
                    for key, value in signature.items()
                    if key in {
                        "id",
                        "signer_name",
                        "signer_role",
                        "content_hash",
                        "signature_fingerprint",
                        "signed_at",
                    }
                }
                for signature in summary.get("signatures", [])
            ],
            "requests": [],
        }
        payload.pop("snapshot", None)
        payload.pop("evidence_hmac", None)
        payload.pop("created_by_user_id", None)
        return payload

    def _serialize_signature(self, signature: DocumentSignature) -> dict:
        return {
            "id": signature.id,
            "signer_user_id": signature.signer_user_id,
            "signer_name": signature.signer_name,
            "signer_email": signature.signer_email,
            "signer_role": signature.signer_role,
            "signer_organization_name": signature.signer_organization_name,
            "signer_cpf_masked": signature.signer_cpf_masked,
            "content_hash": signature.content_hash,
            "signature_fingerprint": signature.signature_fingerprint,
            "signed_at": signature.signed_at,
        }

    def _serialize_request(self, request: DocumentSignatureRequest) -> dict:
        return {
            "id": request.id,
            "requested_by_user_id": request.requested_by_user_id,
            "requested_by_name": request.requester.name if request.requester else None,
            "requested_signer_user_id": request.requested_signer_user_id,
            "requested_signer_name": request.requested_signer.name if request.requested_signer else None,
            "requested_signer_email": request.requested_signer.email if request.requested_signer else None,
            "status": request.status,
            "message": request.message,
            "responded_at": request.responded_at,
            "created_at": request.created_at,
            "updated_at": request.updated_at,
        }

    def _unsigned_summary(self, document_type: str, source_id: UUID | None) -> dict:
        return {
            "document_id": None,
            "document_type": document_type,
            "source_id": source_id,
            "status": UNSIGNED_STATUS,
            "title": None,
            "content_hash": None,
            "content_hash_short": None,
            "public_validation_code": None,
            "public_validation_path": None,
            "required_signatures": 1,
            "signed_count": 0,
            "pending_count": 0,
            "declined_count": 0,
            "is_complete": False,
            "signatures": [],
            "requests": [],
        }

    def _build_signature_fingerprint(self, document: DigitalDocument, signer: User, signed_at: datetime) -> str:
        payload = {
            "document_id": str(document.id),
            "content_hash": document.content_hash,
            "signer_user_id": str(signer.id),
            "signer_cpf_hash": hash_cpf(signer.cpf),
            "signed_at": signed_at.isoformat(),
        }
        return self._hmac_json(payload)

    def _build_evidence_hmac(self, source_type: str, validation_code: str | None, content_hash: str) -> str:
        return self._hmac_json({"source_type": source_type, "validation_code": validation_code, "content_hash": content_hash})

    def _hmac_json(self, payload: dict) -> str:
        secret = (settings.SIGNATURE_EVIDENCE_SECRET or settings.SECRET_KEY).encode("utf-8")
        return hmac.new(secret, self._canonical_json(payload).encode("utf-8"), hashlib.sha256).hexdigest()

    def _canonical_json(self, payload: dict) -> str:
        return json.dumps(jsonable_encoder(payload), ensure_ascii=False, sort_keys=True, separators=(",", ":"))

    def _hash_optional_value(self, value: str | None) -> str | None:
        if not value:
            return None
        normalized = " ".join(str(value).split()).strip().lower()
        return hashlib.sha256(normalized.encode("utf-8")).hexdigest()

    def _mask_document(self, value: str | None) -> str | None:
        if not value:
            return None
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) <= 4:
            return "***"
        return f"{digits[:3]}.***.***-{digits[-2:]}"

    def _calculate_kilometers_driven(self, start_odometer_km: float | None, end_odometer_km: float | None) -> float | None:
        if start_odometer_km is None or end_odometer_km is None:
            return None
        if end_odometer_km < start_odometer_km:
            return None
        return round(float(end_odometer_km - start_odometer_km), 2)

    @staticmethod
    def _canonical_decimal(value) -> str | None:
        if value is None:
            return None
        return format(Decimal(str(value)), "f")

    def _build_possession_public_path(self, validation_code: str | None, *, term_type: str) -> str | None:
        if not validation_code:
            return None
        prefix = PUBLIC_RETURN_TERM_PATH_PREFIX if term_type == "return" else PUBLIC_LOAN_TERM_PATH_PREFIX
        return f"{prefix}/{validation_code}"

    def _build_order_number(self, order: FuelSupplyOrder) -> str:
        return f"AB-{str(order.id).split('-')[0].upper()}"

    def _permission_module_for_document_type(self, document_type: str) -> str:
        if document_type in {
            DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            DigitalDocumentType.POSSESSION_LOAN_TERM,
            DigitalDocumentType.POSSESSION_RETURN_TERM,
        }:
            return "possession"
        if document_type == DigitalDocumentType.FUEL_SUPPLY_ORDER:
            return "fuel_supply_orders"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tipo de documento não suportado")

    def _ensure_ready(self) -> None:
        if self.db is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Serviço de assinatura indisponível")
