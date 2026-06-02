from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.master_data import (
    AllocationCreate,
    AllocationOut,
    AllocationUpdate,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
    MasterDataCatalogOut,
    OrganizationCreate,
    OrganizationOut,
    OrganizationUpdate,
)
from app.services.master_data_service import MasterDataService

router = APIRouter(prefix="/api/master-data", tags=["MasterData"])


@router.get("/catalog", response_model=MasterDataCatalogOut)
async def get_catalog(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "view")),
):
    return await MasterDataService(db).get_catalog(current_user=current_user)


@router.get("/organizations", response_model=list[OrganizationOut])
async def list_organizations(
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "view")),
):
    return await MasterDataService(db).list_organizations(current_user=current_user)


@router.post("/organizations", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
async def create_organization(
    data: OrganizationCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "create")),
):
    return await MasterDataService(db).create_organization(data, current_user)


@router.put("/organizations/{organization_id}", response_model=OrganizationOut)
async def update_organization(
    organization_id: UUID,
    data: OrganizationUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "edit")),
):
    return await MasterDataService(db).update_organization(organization_id, data, current_user)


@router.delete("/organizations/{organization_id}", response_model=MessageOut)
async def delete_organization(
    organization_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "delete")),
):
    await MasterDataService(db).delete_organization(organization_id, current_user)
    return {"message": "Removido"}


@router.get("/departments", response_model=list[DepartmentOut])
async def list_departments(
    organization_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "view")),
):
    return await MasterDataService(db).list_departments(organization_id=organization_id, current_user=current_user)


@router.post("/departments", response_model=DepartmentOut, status_code=status.HTTP_201_CREATED)
async def create_department(
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "create")),
):
    return await MasterDataService(db).create_department(data, current_user)


@router.put("/departments/{department_id}", response_model=DepartmentOut)
async def update_department(
    department_id: UUID,
    data: DepartmentUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "edit")),
):
    return await MasterDataService(db).update_department(department_id, data, current_user)


@router.delete("/departments/{department_id}", response_model=MessageOut)
async def delete_department(
    department_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "delete")),
):
    await MasterDataService(db).delete_department(department_id, current_user)
    return {"message": "Removido"}


@router.get("/allocations", response_model=list[AllocationOut])
async def list_allocations(
    organization_id: UUID | None = Query(default=None),
    department_id: UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "view")),
):
    return await MasterDataService(db).list_allocations(organization_id=organization_id, department_id=department_id, current_user=current_user)


@router.post("/allocations", response_model=AllocationOut, status_code=status.HTTP_201_CREATED)
async def create_allocation(
    data: AllocationCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "create")),
):
    return await MasterDataService(db).create_allocation(data, current_user)


@router.put("/allocations/{allocation_id}", response_model=AllocationOut)
async def update_allocation(
    allocation_id: UUID,
    data: AllocationUpdate,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "edit")),
):
    return await MasterDataService(db).update_allocation(allocation_id, data, current_user)


@router.delete("/allocations/{allocation_id}", response_model=MessageOut)
async def delete_allocation(
    allocation_id: UUID,
    db: AsyncSession = Depends(get_db_session),
    current_user: User = Depends(require_permission("master_data", "delete")),
):
    await MasterDataService(db).delete_allocation(allocation_id, current_user)
    return {"message": "Removido"}
