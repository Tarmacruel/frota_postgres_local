"""Freeze effective handoffs in the existing digital-document evidence store."""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select

from app.core.config import settings
from app.models.document_signature import DigitalDocument, DigitalDocumentType, DocumentSignatureRequest
from app.models.user import User, UserRole
from app.services.vehicle_loan_presentation import describe_loans
from app.services.vehicle_loan_service import VehicleLoanService

LOAN_DOCUMENT_TYPES = frozenset((DigitalDocumentType.VEHICLE_LOAN_DELIVERY_TERM, DigitalDocumentType.VEHICLE_LOAN_RETURN_TERM))
SOURCE = 'VEHICLE_LOAN'
DECLARATION = ('Os representantes identificados confirmam os dados e as condições registrados nesta operação entre secretarias. '
               'A secretaria de origem permanece como proprietária no cadastro. A responsabilidade operacional acompanha '
               'a entrega e a devolução efetivamente aceitas no sistema. A previsão de prazo não encerra o empréstimo automaticamente.')


def representative(document, user):
    return next((item for item in document.snapshot.get('representatives', []) if item['user_id'] == str(user.id)), None)


def may_sign(document, user):
    item = representative(document, user)
    return bool(item and (user.role == UserRole.ADMIN or (user.role == UserRole.PRODUCAO
                and str(user.organization_id) == item['organization_id'])))


async def create_handoff_document(db, loan, actor, *, returning=False):
    """Called inside the handoff transaction, after vehicle -> loan locks; never commits."""
    from app.services.document_signature_service import DocumentSignatureService
    from app.services.document_artifact_service import DocumentArtifactService
    signatures = DocumentSignatureService(db)
    kind = DigitalDocumentType.VEHICLE_LOAN_RETURN_TERM if returning else DigitalDocumentType.VEHICLE_LOAN_DELIVERY_TERM
    if await signatures._get_active_document(kind, loan.id):
        raise HTTPException(409, 'Já existe termo para esta operação')
    sender_id = loan.return_submitted_by_user_id if returning else loan.submitted_by_user_id
    sender = await db.get(User, sender_id)
    if sender is None or sender.id == actor.id:
        raise HTTPException(409, 'Revise os representantes da operação')
    view = (await describe_loans(db, [loan]))[0]
    sides = ('recipient', 'origin') if returning else ('origin', 'recipient')
    reps = [{'user_id': str(user.id), 'name': user.name,
             'organization_id': str(getattr(loan, side + '_organization_id')),
             'organization_name': view[side + '_organization_name'],
             'role': 'Entregante' if index == 0 else 'Recebedor'}
            for index, (user, side) in enumerate(zip((sender, actor), sides))]
    title = 'Termo de devolução entre secretarias' if returning else 'Termo de empréstimo entre secretarias'
    snapshot = jsonable_encoder({'schema_version': 'vehicle-loan-term.v1', 'document_type': kind,
        'title': title, 'loan': view, 'representatives': reps, 'declaration': DECLARATION,
        'effective_at': loan.returned_at if returning else loan.started_at,
        'test_environment': settings.APP_ENV != 'production'})
    context = signatures._build_context_payload(snapshot=snapshot, source_type=SOURCE,
        organization_id=loan.origin_organization_id, title=title, public_validation_code=None, public_validation_path=None)
    now = datetime.now(timezone.utc)
    document = DigitalDocument(document_type=kind, source_id=loan.id, **context,
        status='PENDING', required_signatures=2, created_by_user_id=actor.id, created_at=now, updated_at=now,
        signatures=[], signature_requests=[], artifacts=[])
    for item in reps:
        document.signature_requests.append(DocumentSignatureRequest(requested_by_user_id=actor.id,
            requested_signer_user_id=UUID(item['user_id']), status='PENDING',
            message='Assinatura do termo da operação confirmada entre secretarias.', created_at=now, updated_at=now))
    db.add(document)
    await db.flush()
    if settings.CANONICAL_DOCUMENT_ARTIFACTS_ENABLED:
        await DocumentArtifactService(db).ensure_canonical_artifact(document, current_user=actor)
    await signatures._record_audit(actor, action='CREATE', document=document,
        details={'event': 'CREATE_LOAN_TERM', 'content_hash': document.content_hash, 'loan_version': loan.version})
    return document


async def list_documents(db, loan_id, user):
    from app.services.document_signature_service import DocumentSignatureService
    await VehicleLoanService(db).get(loan_id, user)
    ids = (await db.scalars(select(DigitalDocument.id).where(DigitalDocument.source_type == SOURCE,
        DigitalDocument.source_id == loan_id).order_by(DigitalDocument.created_at, DigitalDocument.id))).all()
    service = DocumentSignatureService(db)
    return [await service.get_document(document_id, user) for document_id in ids]
