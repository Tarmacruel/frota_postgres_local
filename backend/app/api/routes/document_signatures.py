from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_ready
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.document_signature import (
    DigitalDocumentCreate,
    DigitalDocumentOut,
    DocumentSignInput,
    DocumentSignatureRequestOut,
    JointSignatureRequestInput,
)
from app.services.document_signature_service import DocumentSignatureService

router = APIRouter(prefix="/api/document-signatures", tags=["DocumentSignatures"])


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
