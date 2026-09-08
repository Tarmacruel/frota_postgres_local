from __future__ import annotations

import hashlib
import hmac
import json
import re
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_ready
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.document_signature import (
    DigitalDocumentCreate,
    DigitalDocumentOut,
    CertificateClaimInput,
    CertificateClaimOut,
    CertificateSigningSessionCreateInput,
    CertificateSigningSessionCreateOut,
    CertificateSigningSessionOut,
    CompleteCertificateSignatureInput,
    CompleteCertificateSignatureOut,
    DocumentValidationSummaryOut,
    DocumentSignInput,
    DocumentSignatureRequestOut,
    JointSignatureRequestInput,
    SignatureAgentDeviceOut,
    SignatureAgentPairingCompleteInput,
    SignatureAgentPairingCreateOut,
    SignatureAgentPairingOut,
)
from app.core.config import settings
from app.models.document_signature import DigitalDocumentArtifactType
from app.services.audit_service import AuditService
from app.services.document_artifact_service import DocumentArtifactService
from app.services.document_signature_service import DocumentSignatureService
from app.services.certificate_signing_session_service import CertificateSigningSessionService

router = APIRouter(prefix="/api/document-signatures", tags=["DocumentSignatures"])
artifact_router = APIRouter(prefix="/api", tags=["DocumentArtifacts"])


@router.get("/pending")
async def list_pending_signature_requests(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await DocumentSignatureService(db).list_pending(current_user)


@router.post("/documents", response_model=DigitalDocumentOut)
async def create_digital_document(
    data: DigitalDocumentCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await DocumentSignatureService(db).create_document(data, current_user)


@router.get("/documents/{document_id}", response_model=DigitalDocumentOut)
async def get_digital_document(
    document_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await DocumentSignatureService(db).get_document(document_id, current_user)


@artifact_router.get("/documents/{document_id}/artifacts/{artifact_kind}")
@router.get("/documents/{document_id}/artifacts/{artifact_kind}", include_in_schema=False)
async def download_document_artifact(
    document_id: UUID,
    artifact_kind: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    document = await DocumentSignatureService(db).get_authorized_document(
        document_id,
        current_user,
        require_evidence_access=True,
    )
    artifact_types = {
        "canonical": DigitalDocumentArtifactType.CANONICAL_PDF,
        "certified": DigitalDocumentArtifactType.CERTIFIED_PDF,
    }
    normalized_kind = artifact_kind.strip().lower()
    artifact_type = artifact_types.get(normalized_kind)
    if artifact_type is None:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Artefato não encontrado")
    artifact, absolute_path = await DocumentArtifactService(db).get_artifact_for_download(
        document_id=document.id,
        artifact_type=artifact_type,
    )
    await AuditService(db).record(
        actor=current_user,
        action="DOWNLOAD_DOCUMENT_ARTIFACT",
        entity_type="DIGITAL_DOCUMENT",
        entity_id=document.id,
        entity_label=document.title,
        details={
            "artifact_id": str(artifact.id),
            "artifact_type": artifact.artifact_type,
            "content_sha256": artifact.content_sha256,
        },
    )
    await db.commit()
    filename_prefix = "canonico" if normalized_kind == "canonical" else "certificado"
    return FileResponse(
        absolute_path,
        media_type=artifact.media_type,
        filename=f"documento-{filename_prefix}-{document.id}.pdf",
        headers={
            "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "X-Document-Content-SHA256": artifact.content_sha256,
        },
    )


@artifact_router.get(
    "/documents/{document_id}/validation",
    response_model=DocumentValidationSummaryOut,
)
@router.get(
    "/documents/{document_id}/validation",
    response_model=DocumentValidationSummaryOut,
    include_in_schema=False,
)
async def get_document_validation(
    document_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    document = await DocumentSignatureService(db).get_authorized_document(
        document_id,
        current_user,
    )
    return await DocumentArtifactService(db).build_validation_summary(document)


@artifact_router.post(
    "/documents/{document_id}/certificate-sessions",
    response_model=CertificateSigningSessionCreateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_certificate_signing_session(
    document_id: UUID,
    data: CertificateSigningSessionCreateInput,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await CertificateSigningSessionService(db).create_session(
        document_id=document_id,
        data=data,
        current_user=current_user,
    )


@artifact_router.get(
    "/certificate-sessions/{session_id}",
    response_model=CertificateSigningSessionOut,
)
async def get_certificate_signing_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await CertificateSigningSessionService(db).get_session(session_id, current_user)


@artifact_router.delete(
    "/certificate-sessions/{session_id}",
    response_model=CertificateSigningSessionOut,
)
async def cancel_certificate_signing_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await CertificateSigningSessionService(db).cancel_session(session_id, current_user)


@router.post(
    "/certificate-sessions/{session_id}/claim",
    response_model=CertificateClaimOut,
)
async def claim_certificate_signing_session(
    session_id: UUID,
    data: CertificateClaimInput,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    return await CertificateSigningSessionService(db).claim(
        session_id=session_id,
        data=data,
        raw_body=await request.body(),
        request_path=request.url.path,
        headers=request.headers,
    )


@router.post(
    "/certificate-sessions/{session_id}/complete",
    response_model=CompleteCertificateSignatureOut,
)
async def complete_certificate_signing_session(
    session_id: UUID,
    data: CompleteCertificateSignatureInput,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    return await CertificateSigningSessionService(db).complete(
        session_id=session_id,
        data=data,
        raw_body=await request.body(),
        request_path=request.url.path,
        headers=request.headers,
    )


@artifact_router.post(
    "/signature-agent/pairings",
    response_model=SignatureAgentPairingCreateOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_signature_agent_pairing(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await CertificateSigningSessionService(db).create_pairing(current_user)


@artifact_router.get(
    "/signature-agent/pairings/{pairing_id}",
    response_model=SignatureAgentPairingOut,
)
async def get_signature_agent_pairing(
    pairing_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await CertificateSigningSessionService(db).get_pairing(pairing_id, current_user)


@router.post("/agent/pairings/{pairing_id}/complete")
async def complete_signature_agent_pairing(
    pairing_id: UUID,
    data: SignatureAgentPairingCompleteInput,
    request: Request,
    db: AsyncSession = Depends(get_db_session),
):
    return await CertificateSigningSessionService(db).complete_pairing(
        pairing_id=pairing_id,
        data=data,
        raw_body=await request.body(),
        request_path=request.url.path,
        headers=request.headers,
    )


@artifact_router.get(
    "/signature-agent/devices",
    response_model=list[SignatureAgentDeviceOut],
)
async def list_signature_agent_devices(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await CertificateSigningSessionService(db).list_devices(current_user)


@artifact_router.delete(
    "/signature-agent/devices/{device_id}",
    response_model=SignatureAgentDeviceOut,
)
async def revoke_signature_agent_device(
    device_id: str,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    if re.fullmatch(r"[0-9a-fA-F]{64}", device_id) is None:
        raise HTTPException(status_code=404, detail="Dispositivo nÃ£o encontrado")
    return await CertificateSigningSessionService(db).revoke_device(device_id, current_user)


def _load_signature_agent_release() -> tuple[Path, dict]:
    if not settings.SIGNATURE_AGENT_ENABLED:
        raise HTTPException(status_code=404, detail="Agente de assinatura nÃ£o habilitado")
    root = Path(settings.SIGNATURE_AGENT_ARTIFACT_DIR).resolve()
    executable = (root / "FrotaSigner-HML.exe").resolve()
    manifest_path = (root / "manifest.json").resolve()
    if executable.parent != root or manifest_path.parent != root:
        raise HTTPException(status_code=500, detail="ConfiguraÃ§Ã£o do agente invÃ¡lida")
    if not executable.is_file() or not manifest_path.is_file():
        raise HTTPException(status_code=503, detail="Agente de assinatura ainda nÃ£o publicado")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=503, detail="Manifesto do agente invÃ¡lido") from exc
    expected_hash = str(manifest.get("sha256") or "").lower()
    if manifest.get("file") != executable.name or re.fullmatch(r"[0-9a-f]{64}", expected_hash) is None:
        raise HTTPException(status_code=503, detail="Manifesto do agente invÃ¡lido")
    actual_hash = hashlib.sha256(executable.read_bytes()).hexdigest()
    if not hmac.compare_digest(actual_hash, expected_hash):
        raise HTTPException(status_code=409, detail="Integridade do agente nÃ£o confirmada")
    return executable, {
        "file": executable.name,
        "sha256": actual_hash,
        "size_bytes": executable.stat().st_size,
        "authenticode": str(manifest.get("authenticode") or "Unknown")[:40],
        "generated_at": manifest.get("generatedAt"),
        "download_url": "/api/signature-agent/download",
    }


@artifact_router.get("/signature-agent/manifest")
async def get_signature_agent_manifest(
    current_user: User = Depends(get_current_user_ready),
):
    _ = current_user
    _, manifest = _load_signature_agent_release()
    return manifest


@artifact_router.get("/signature-agent/download")
async def download_signature_agent(
    current_user: User = Depends(get_current_user_ready),
):
    _ = current_user
    executable, manifest = _load_signature_agent_release()
    return FileResponse(
        executable,
        media_type="application/vnd.microsoft.portable-executable",
        filename=executable.name,
        headers={
            "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
            "X-Artifact-SHA256": manifest["sha256"],
        },
    )


@router.post("/documents/{document_id}/sign", response_model=DigitalDocumentOut)
async def sign_digital_document(
    document_id: UUID,
    data: DocumentSignInput,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await DocumentSignatureService(db).sign_document(document_id, data, current_user)


@router.post("/documents/{document_id}/requests", response_model=DigitalDocumentOut)
async def request_joint_signature(
    document_id: UUID,
    data: JointSignatureRequestInput,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await DocumentSignatureService(db).request_joint_signature(document_id, data, current_user)


@router.post("/requests/{request_id}/decline", response_model=DocumentSignatureRequestOut)
async def decline_signature_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await DocumentSignatureService(db).decline_request(request_id, current_user)


@router.delete("/requests/{request_id}", response_model=DocumentSignatureRequestOut)
async def cancel_signature_request(
    request_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(get_current_user_ready),
):
    return await DocumentSignatureService(db).cancel_request(request_id, current_user)
