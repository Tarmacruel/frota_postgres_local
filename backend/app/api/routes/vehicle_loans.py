from uuid import UUID
from typing import Literal

from fastapi import APIRouter, Depends, File, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.user import User
from app.services.vehicle_loan_presentation import describe_loans, loan_catalog, describe_events
from app.schemas.vehicle_loan import LoanView, LoanEventView, LoanPrintedTermOut
from app.schemas.common import PaginatedResponse
from app.schemas.vehicle_loan import LoanAction, LoanCreate, LoanEventOut, LoanOut, LoanReturnRequest, LoanStatus, LoanUpdate
from app.services.vehicle_loan_service import VehicleLoanService
from app.schemas.vehicle_loan import LoanRegularization, LoanRegularizationConfirm
from app.services.vehicle_loan_regularization import VehicleLoanRegularizationService, regularization_catalog

router = APIRouter(prefix='/api/vehicle-loans', tags=['VehicleLoans'])


@router.get('/regularization/catalog')
async def get_regularization_catalog(db: AsyncSession = Depends(get_db_session),
                                     user: User = Depends(require_permission('vehicle_loans', 'create'))):
    return await regularization_catalog(db, user)


@router.post('/regularization/preview')
async def preview_regularization(data: LoanRegularization, db: AsyncSession = Depends(get_db_session),
                                 user: User = Depends(require_permission('vehicle_loans', 'create'))):
    return await VehicleLoanRegularizationService(db).preview(data, user)


@router.post('/regularization', response_model=LoanView, status_code=201)
async def create_regularization(data: LoanRegularizationConfirm, db: AsyncSession = Depends(get_db_session),
                                user: User = Depends(require_permission('vehicle_loans', 'create'))):
    record = await VehicleLoanRegularizationService(db).create(data, user)
    return (await describe_loans(db, [record]))[0]


@router.get('', response_model=PaginatedResponse[LoanView])
async def list_loans(page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
                     vehicle_id: UUID | None = None, status: LoanStatus | None = None,
                     search: str | None = Query(None, max_length=100), direction: Literal["sent", "received"] | None = None,
                     db: AsyncSession = Depends(get_db_session),
                     user: User = Depends(require_permission('vehicle_loans', 'view'))):
    result = await VehicleLoanService(db).list(user, page=page, limit=limit, vehicle_id=vehicle_id, status=status, search=search, direction=direction)
    result['data'] = await describe_loans(db, result['data'])
    return result


@router.post('', response_model=LoanView, status_code=201)
async def create_loan(data: LoanCreate, db: AsyncSession = Depends(get_db_session),
                      user: User = Depends(require_permission('vehicle_loans', 'create'))):
    return (await describe_loans(db, [await VehicleLoanService(db).create(data, user)]))[0]


@router.get('/catalog')
async def get_catalog(db: AsyncSession = Depends(get_db_session),
                      user: User = Depends(require_permission('vehicle_loans', 'view'))):
    return await loan_catalog(db, user)


@router.get('/pending-summary')
async def get_pending_summary(db: AsyncSession = Depends(get_db_session),
                              user: User = Depends(require_permission('vehicle_loans', 'view'))):
    return await VehicleLoanService(db).pending_summary(user)


@router.get('/{loan_id}', response_model=LoanView)
async def get_loan(loan_id: UUID, db: AsyncSession = Depends(get_db_session),
                   user: User = Depends(require_permission('vehicle_loans', 'view'))):
    return (await describe_loans(db, [await VehicleLoanService(db).get(loan_id, user)]))[0]


@router.get('/{loan_id}/events', response_model=list[LoanEventView])
async def get_loan_events(loan_id: UUID, db: AsyncSession = Depends(get_db_session),
                          user: User = Depends(require_permission('vehicle_loans', 'view'))):
    return await describe_events(db, await VehicleLoanService(db).events(loan_id, user))


@router.get('/{loan_id}/context')
async def get_loan_context(loan_id: UUID, db: AsyncSession = Depends(get_db_session),
                           user: User = Depends(require_permission('vehicle_loans', 'view'))):
    return await VehicleLoanService(db).context(loan_id, user)


@router.get('/{loan_id}/documents')
async def get_loan_documents(loan_id: UUID, db: AsyncSession = Depends(get_db_session),
                             user: User = Depends(require_permission('vehicle_loans', 'view'))):
    from app.services.vehicle_loan_document_service import list_documents
    return await list_documents(db, loan_id, user)


@router.get('/{loan_id}/printed-terms', response_model=list[LoanPrintedTermOut])
async def list_printed_terms(loan_id: UUID, db: AsyncSession = Depends(get_db_session),
                             user: User = Depends(require_permission('vehicle_loans', 'view'))):
    from app.services.vehicle_loan_printed_term_service import VehicleLoanPrintedTermService
    return await VehicleLoanPrintedTermService(db).list(loan_id, user)


@router.post('/{loan_id}/printed-terms', response_model=LoanPrintedTermOut, status_code=201)
async def upload_printed_term(loan_id: UUID, file: UploadFile = File(...),
                              db: AsyncSession = Depends(get_db_session),
                              user: User = Depends(require_permission('vehicle_loans', 'edit'))):
    from app.services.vehicle_loan_printed_term_service import VehicleLoanPrintedTermService
    return await VehicleLoanPrintedTermService(db).upload(loan_id, file, user)


@router.get('/{loan_id}/printed-terms/{term_id}/file')
async def download_printed_term(loan_id: UUID, term_id: UUID, db: AsyncSession = Depends(get_db_session),
                                user: User = Depends(require_permission('vehicle_loans', 'view'))):
    from fastapi.responses import FileResponse
    from app.services.vehicle_loan_printed_term_service import VehicleLoanPrintedTermService
    term, path = await VehicleLoanPrintedTermService(db).get(loan_id, term_id, user)
    return FileResponse(path, media_type=term.mime_type, filename=f'termo-impresso-{term.id}{path.suffix}',
        headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@router.get('/{loan_id}/documents/{document_id}/pdf')
async def download_loan_term(loan_id: UUID, document_id: UUID, db: AsyncSession = Depends(get_db_session),
                             user: User = Depends(require_permission('vehicle_loans', 'view'))):
    from fastapi import HTTPException, Response
    from app.services.document_signature_service import DocumentSignatureService
    from app.services.vehicle_loan_document_service import LOAN_DOCUMENT_TYPES
    from app.services.vehicle_loan_pdf_service import VehicleLoanPdfService
    from app.services.audit_service import AuditService
    await VehicleLoanService(db).get(loan_id, user)
    document = await DocumentSignatureService(db).get_authorized_document(document_id, user, require_evidence_access=True)
    if document.source_id != loan_id or document.document_type not in LOAN_DOCUMENT_TYPES:
        raise HTTPException(404, 'Termo não encontrado')
    content = VehicleLoanPdfService.build(document.snapshot, content_hash=document.content_hash,
        signatures=document.signatures, document_id=document.id)
    await AuditService(db).record(actor=user, action='DOWNLOAD_LOAN_TERM', entity_type='DIGITAL_DOCUMENT',
        entity_id=document.id, entity_label=document.title, details={'content_hash': document.content_hash})
    await db.commit()
    return Response(content, media_type='application/pdf', headers={'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff', 'Content-Disposition': f'attachment; filename="termo-{document.id}.pdf"'})


@router.put('/{loan_id}', response_model=LoanView)
async def update_loan(loan_id: UUID, data: LoanUpdate, db: AsyncSession = Depends(get_db_session),
                      user: User = Depends(require_permission('vehicle_loans', 'edit'))):
    return (await describe_loans(db, [await VehicleLoanService(db).update(loan_id, data, user)]))[0]


@router.post('/{loan_id}/request-return', response_model=LoanView)
async def request_return(loan_id: UUID, data: LoanReturnRequest, db: AsyncSession = Depends(get_db_session),
                         user: User = Depends(require_permission('vehicle_loans', 'edit'))):
    return (await describe_loans(db, [await VehicleLoanService(db).transition(loan_id, 'request-return', data, user)]))[0]


def action_endpoint(operation):
    async def endpoint(loan_id: UUID, data: LoanAction, db: AsyncSession = Depends(get_db_session),
                       user: User = Depends(require_permission('vehicle_loans', 'edit'))):
        return (await describe_loans(db, [await VehicleLoanService(db).transition(loan_id, operation, data, user)]))[0]
    endpoint.__name__ = operation.replace('-', '_') + '_vehicle_loan'
    return endpoint


for operation in ('submit', 'accept', 'reject', 'cancel', 'accept-return', 'reject-return', 'cancel-return'):
    router.add_api_route('/{loan_id}/' + operation, action_endpoint(operation), methods=['POST'], response_model=LoanView)
