from __future__ import annotations

from uuid import UUID

from datetime import date

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.payment_process import PaymentContractStatus, PaymentProcessKind, PaymentProcessStage
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.payment_process import (
    PaymentContractAmendmentCreate,
    PaymentContractCreate,
    PaymentContractManagementOut,
    PaymentContractManagementSummaryOut,
    PaymentContractOut,
    PaymentContractUpdate,
    PaymentDashboardOut,
    PaymentProcessChecklistUpdate,
    PaymentProcessCreate,
    PaymentProcessDelete,
    PaymentProcessImportOut,
    PaymentProcessListResponse,
    PaymentProcessOut,
    PaymentProcessStageUpdate,
    PaymentProcessUpdate,
    PaymentSupplierCreate,
    PaymentSupplierOut,
    PaymentSupplierUpdate,
)
from app.services.payment_process_service import XLSX_MEDIA_TYPE, PaymentProcessService

router = APIRouter(prefix="/api/payment-processes", tags=["PaymentProcesses"])
supplier_router = APIRouter(prefix="/api/payment-suppliers", tags=["PaymentSuppliers"])
contract_router = APIRouter(prefix="/api/payment-contracts", tags=["PaymentContracts"])


@router.get("", response_model=PaymentProcessListResponse)
async def list_payment_processes(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=200),
    kind: PaymentProcessKind | None = Query(default=None),
    stage: PaymentProcessStage | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status", max_length=80),
    organization_id: UUID | None = Query(default=None),
    supplier_id: UUID | None = Query(default=None),
    contract_id: UUID | None = Query(default=None),
    competence_month: date | None = Query(default=None),
    due_from: date | None = Query(default=None),
    due_to: date | None = Query(default=None),
    search: str | None = Query(default=None, max_length=160),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).list(
        page=page,
        limit=limit,
        current_user=current_user,
        kind=kind,
        stage=stage,
        status_filter=status_filter,
        organization_id=organization_id,
        supplier_id=supplier_id,
        contract_id=contract_id,
        competence_month=competence_month,
        due_from=due_from,
        due_to=due_to,
        search=search,
    )


@router.get("/dashboard", response_model=PaymentDashboardOut)
async def payment_process_dashboard(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).dashboard(current_user=current_user)


@router.post("", response_model=PaymentProcessOut, status_code=status.HTTP_201_CREATED)
async def create_payment_process(
    data: PaymentProcessCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).create(data, current_user)


@router.post("/import", response_model=PaymentProcessImportOut)
async def import_payment_processes(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).import_xlsx(file, current_user)


@router.get("/template")
async def download_payment_process_template(
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("payment_processes", "view")),
):
    filename, content = PaymentProcessService(db).template_xlsx()
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export")
async def export_payment_processes(
    kind: PaymentProcessKind | None = Query(default=None),
    stage: PaymentProcessStage | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status", max_length=80),
    organization_id: UUID | None = Query(default=None),
    supplier_id: UUID | None = Query(default=None),
    contract_id: UUID | None = Query(default=None),
    competence_month: date | None = Query(default=None),
    due_from: date | None = Query(default=None),
    due_to: date | None = Query(default=None),
    search: str | None = Query(default=None, max_length=160),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "view")),
):
    filename, content = await PaymentProcessService(db).export_xlsx(
        current_user=current_user,
        kind=kind,
        stage=stage,
        status_filter=status_filter,
        organization_id=organization_id,
        supplier_id=supplier_id,
        contract_id=contract_id,
        competence_month=competence_month,
        due_from=due_from,
        due_to=due_to,
        search=search,
    )
    return Response(
        content=content,
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{process_id}", response_model=PaymentProcessOut)
async def get_payment_process(
    process_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).get(process_id, current_user=current_user)


@router.put("/{process_id}", response_model=PaymentProcessOut)
async def update_payment_process(
    process_id: UUID,
    data: PaymentProcessUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).update(process_id, data, current_user)


@router.delete("/{process_id}", response_model=MessageOut)
async def delete_payment_process(
    process_id: UUID,
    data: PaymentProcessDelete,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "delete")),
):
    return await PaymentProcessService(db).delete(process_id, data, current_user)


@router.post("/{process_id}/stage", response_model=PaymentProcessOut)
async def update_payment_process_stage(
    process_id: UUID,
    data: PaymentProcessStageUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).change_stage(process_id, data, current_user)


@router.put("/{process_id}/checklist", response_model=PaymentProcessOut)
async def update_payment_process_checklist(
    process_id: UUID,
    data: PaymentProcessChecklistUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).update_checklist(process_id, data, current_user)


@supplier_router.get("", response_model=list[PaymentSupplierOut])
async def list_payment_suppliers(
    search: str | None = Query(default=None, max_length=160),
    active_only: bool = Query(default=False),
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).list_suppliers(search=search, active_only=active_only)


@supplier_router.get("/{supplier_id}", response_model=PaymentSupplierOut)
async def get_payment_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).get_supplier(supplier_id)


@supplier_router.post("", response_model=PaymentSupplierOut, status_code=status.HTTP_201_CREATED)
async def create_payment_supplier(
    data: PaymentSupplierCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).create_supplier(data, current_user)


@supplier_router.put("/{supplier_id}", response_model=PaymentSupplierOut)
async def update_payment_supplier(
    supplier_id: UUID,
    data: PaymentSupplierUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).update_supplier(supplier_id, data, current_user)


@supplier_router.delete("/{supplier_id}", response_model=MessageOut)
async def delete_payment_supplier(
    supplier_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).delete_supplier(supplier_id, current_user)


@contract_router.get("", response_model=list[PaymentContractOut])
async def list_payment_contracts(
    supplier_id: UUID | None = Query(default=None),
    status_filter: PaymentContractStatus | None = Query(default=None, alias="status"),
    kind: PaymentProcessKind | None = Query(default=None),
    search: str | None = Query(default=None, max_length=160),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).list_contracts(current_user=current_user, supplier_id=supplier_id, status_filter=status_filter, kind=kind, search=search)


@contract_router.get("/management-summary", response_model=PaymentContractManagementSummaryOut)
async def payment_contract_management_summary(
    horizon_months: int = Query(default=6, ge=3, le=12),
    supplier_id: UUID | None = Query(default=None),
    status_filter: PaymentContractStatus | None = Query(default=None, alias="status"),
    kind: PaymentProcessKind | None = Query(default=None),
    search: str | None = Query(default=None, max_length=160),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).contract_management_summary(
        current_user=current_user,
        horizon_months=horizon_months,
        supplier_id=supplier_id,
        status_filter=status_filter,
        kind=kind,
        search=search,
    )


@contract_router.get("/{contract_id}", response_model=PaymentContractOut)
async def get_payment_contract(
    contract_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).get_contract(contract_id)


@contract_router.get("/{contract_id}/management", response_model=PaymentContractManagementOut)
async def get_payment_contract_management(
    contract_id: UUID,
    horizon_months: int = Query(default=6, ge=3, le=12),
    db: AsyncSession = Depends(get_db_session),
    _current_user: User = Depends(require_permission("payment_processes", "view")),
):
    return await PaymentProcessService(db).contract_management(contract_id, horizon_months=horizon_months)


@contract_router.post("", response_model=PaymentContractOut, status_code=status.HTTP_201_CREATED)
async def create_payment_contract(
    data: PaymentContractCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).create_contract(data, current_user)


@contract_router.put("/{contract_id}", response_model=PaymentContractOut)
async def update_payment_contract(
    contract_id: UUID,
    data: PaymentContractUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).update_contract(contract_id, data, current_user)


@contract_router.delete("/{contract_id}", response_model=MessageOut)
async def delete_payment_contract(
    contract_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).delete_contract(contract_id, current_user)


@contract_router.post("/{contract_id}/amendments", response_model=PaymentContractOut, status_code=status.HTTP_201_CREATED)
async def create_payment_contract_amendment(
    contract_id: UUID,
    data: PaymentContractAmendmentCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("payment_processes", "edit")),
):
    return await PaymentProcessService(db).create_contract_amendment(contract_id, data, current_user)
