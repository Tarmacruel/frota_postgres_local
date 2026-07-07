from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.organization_scope import ensure_organization_access, production_scope_is_empty
from app.models.driver import Driver
from app.models.user import User
from app.repositories.driver_repository import DriverRepository
from app.repositories.master_data_repository import MasterDataRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.driver import DriverCreate, DriverUpdate
from app.services.audit_service import AuditService

DRIVER_IMPORT_FIELDS = (
    "registro",
    "matricula",
    "cargo",
    "cnh_numero",
    "rg",
    "data_nascimento",
    "data_emissao_cnh",
    "ultimo_abastecimento",
)


class DriverService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.drivers = DriverRepository(db)
        self.master_data = MasterDataRepository(db)
        self.audit = AuditService(db)

    async def list(
        self,
        *,
        page: int,
        limit: int,
        search: str | None = None,
        active_only: bool | None = None,
        organization_id: UUID | None = None,
        current_user: User | None = None,
    ) -> PaginatedResponse[dict]:
        if production_scope_is_empty(current_user):
            return PaginatedResponse[dict](data=[], pagination=build_pagination(page, limit, 0))

        items, total = await self.drivers.list_paginated(
            page=page,
            limit=limit,
            search=search,
            active_only=active_only,
            organization_id=organization_id,
        )
        return PaginatedResponse[dict](data=[self._serialize(item) for item in items], pagination=build_pagination(page, limit, total))

    async def list_active(
        self,
        *,
        search: str | None = None,
        limit: int = 100,
        organization_id: UUID | None = None,
        current_user: User | None = None,
    ) -> list[dict]:
        if production_scope_is_empty(current_user):
            return []

        items = await self.drivers.list_active(search=search, limit=limit, organization_id=organization_id)
        return [self._serialize(item) for item in items]

    async def get(self, driver_id: UUID, current_user: User | None = None) -> dict:
        driver = await self.drivers.get_by_id(driver_id)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")
        if production_scope_is_empty(current_user):
            ensure_organization_access(current_user, driver.organization_id)
        return self._serialize(driver)

    async def create(self, data: DriverCreate, current_user: User) -> dict:
        await self._ensure_unique_document(data.documento)
        organization = await self._require_organization(data.organization_id)
        if production_scope_is_empty(current_user):
            ensure_organization_access(current_user, organization.id)
        driver = Driver(**data.model_dump())
        driver.organization = organization
        try:
            await self.drivers.create(driver)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="DRIVER",
                entity_id=driver.id,
                entity_label=driver.nome_completo,
                details={
                    "documento": driver.documento,
                    **{field: getattr(driver, field) for field in DRIVER_IMPORT_FIELDS},
                    "organization_id": str(driver.organization_id) if driver.organization_id else None,
                    "organization_name": driver.organization_name,
                    "contato": driver.contato,
                    "email": driver.email,
                    "cnh_categoria": driver.cnh_categoria.value,
                    "cnh_validade": driver.cnh_validade.isoformat() if driver.cnh_validade else None,
                    "ativo": driver.ativo,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível cadastrar o condutor") from exc
        return await self.get(driver.id, current_user=current_user)

    async def update(self, driver_id: UUID, data: DriverUpdate, current_user: User) -> dict:
        driver = await self.drivers.get_by_id(driver_id)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")

        if production_scope_is_empty(current_user):
            ensure_organization_access(current_user, driver.organization_id)

        payload = data.model_dump(exclude_unset=True)
        if "documento" in payload and payload["documento"] != driver.documento:
            await self._ensure_unique_document(payload["documento"], exclude_id=driver.id)
        next_organization = None
        if "organization_id" in payload:
            next_organization = await self._require_organization(payload["organization_id"]) if payload["organization_id"] else None
            if production_scope_is_empty(current_user):
                ensure_organization_access(current_user, next_organization.id if next_organization else None)
            payload["organization_id"] = next_organization.id if next_organization else None

        before = self._serialize(driver)
        for field, value in payload.items():
            setattr(driver, field, value)
        if "organization_id" in payload:
            driver.organization = next_organization

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="DRIVER",
                entity_id=driver.id,
                entity_label=driver.nome_completo,
                details={"before": before, "after": self._serialize(driver)},
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível atualizar o condutor") from exc
        return await self.get(driver.id, current_user=current_user)

    async def deactivate(self, driver_id: UUID, current_user: User) -> None:
        driver = await self.drivers.get_by_id(driver_id)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")
        ensure_organization_access(current_user, driver.organization_id)
        if not driver.ativo:
            return

        links = await self.drivers.count_links(driver.id)
        driver.ativo = False
        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="DRIVER",
                entity_id=driver.id,
                entity_label=driver.nome_completo,
                details={
                    "soft_delete": True,
                    "linked_records": links,
                    "documento": driver.documento,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível inativar o condutor") from exc

    async def _ensure_unique_document(self, documento: str, *, exclude_id: UUID | None = None) -> None:
        existing = await self.drivers.get_active_by_document(documento, exclude_id=exclude_id)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Documento já cadastrado para outro condutor ativo")

    async def _require_organization(self, organization_id: UUID):
        organization = await self.master_data.get_organization(organization_id)
        if not organization:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Secretaria não encontrada")
        return organization

    def _serialize(self, driver: Driver) -> dict:
        return {
            "id": driver.id,
            "nome_completo": driver.nome_completo,
            "documento": driver.documento,
            **{field: getattr(driver, field) for field in DRIVER_IMPORT_FIELDS},
            "organization_id": driver.organization_id,
            "organization_name": driver.organization_name,
            "contato": driver.contato,
            "email": driver.email,
            "cnh_categoria": driver.cnh_categoria,
            "cnh_validade": driver.cnh_validade,
            "ativo": driver.ativo,
            "created_at": driver.created_at,
            "updated_at": driver.updated_at,
        }
