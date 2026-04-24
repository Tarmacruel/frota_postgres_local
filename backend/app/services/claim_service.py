from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.claim import Claim, ClaimStatus, ClaimType
from app.models.user import User
from app.models.vehicle import VehicleStatus
from app.repositories.claim_repository import ClaimRepository
from app.repositories.driver_repository import DriverRepository
from app.repositories.possession_repository import PossessionRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.claim import ClaimCreate, ClaimUpdate
from app.schemas.common import PaginatedResponse, build_pagination
from app.services.audit_service import AuditService


class ClaimService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.claims = ClaimRepository(db)
        self.vehicles = VehicleRepository(db)
        self.drivers = DriverRepository(db)
        self.possessions = PossessionRepository(db)
        self.audit = AuditService(db)

    async def list(
        self,
        *,
        page: int,
        limit: int,
        vehicle_id: UUID | None = None,
        status_filter: ClaimStatus | None = None,
        tipo: ClaimType | None = None,
        search: str | None = None,
    ) -> PaginatedResponse[dict]:
        items, total = await self.claims.list_paginated(
            page=page,
            limit=limit,
            vehicle_id=vehicle_id,
            status=status_filter,
            tipo=tipo,
            search=search,
        )
        return PaginatedResponse[dict](data=[self._serialize(item) for item in items], pagination=build_pagination(page, limit, total))

    async def get(self, claim_id: UUID) -> dict:
        claim = await self.claims.get_by_id(claim_id)
        if not claim:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sinistro não encontrado")
        return self._serialize(claim)

    async def create(self, data: ClaimCreate, current_user: User) -> dict:
        vehicle = await self._require_vehicle_for_claim(data.vehicle_id)
        driver = await self._require_driver_if_needed(data.driver_id, data.data_ocorrencia, data.vehicle_id)
        await self._validate_closed_claim(data.status, data.valor_estimado, data.justificativa_encerramento)

        claim = Claim(
            vehicle_id=data.vehicle_id,
            driver_id=driver.id if driver else None,
            data_ocorrencia=data.data_ocorrencia,
            tipo=data.tipo,
            descricao=data.descricao,
            local=data.local,
            boletim_ocorrencia=data.boletim_ocorrencia,
            valor_estimado=data.valor_estimado,
            status=data.status,
            justificativa_encerramento=data.justificativa_encerramento,
            anexos=data.anexos,
            created_by=current_user.id,
        )

        try:
            await self.claims.create(claim)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="CLAIM",
                entity_id=claim.id,
                entity_label=f"{vehicle.plate} - {claim.tipo.value}",
                details=self._serialize(claim),
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível registrar o sinistro") from exc
        return await self.get(claim.id)

    async def update(self, claim_id: UUID, data: ClaimUpdate, current_user: User) -> dict:
        claim = await self.claims.get_by_id(claim_id)
        if not claim:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sinistro não encontrado")

        payload = data.model_dump(exclude_unset=True)
        next_vehicle_id = claim.vehicle_id
        next_driver_id = payload["driver_id"] if "driver_id" in payload else claim.driver_id
        next_data_ocorrencia = payload["data_ocorrencia"] if "data_ocorrencia" in payload else claim.data_ocorrencia
        next_status = payload["status"] if "status" in payload else claim.status
        next_valor = payload["valor_estimado"] if "valor_estimado" in payload else claim.valor_estimado
        next_justificativa = payload["justificativa_encerramento"] if "justificativa_encerramento" in payload else claim.justificativa_encerramento

        await self._require_vehicle_for_claim(next_vehicle_id)
        driver = await self._require_driver_if_needed(next_driver_id, next_data_ocorrencia, next_vehicle_id)
        await self._validate_closed_claim(next_status, next_valor, next_justificativa)

        before = self._serialize(claim)
        for field, value in payload.items():
            setattr(claim, field, value)
        claim.driver_id = driver.id if driver else None

        try:
            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="CLAIM",
                entity_id=claim.id,
                entity_label=f"{claim.vehicle.plate if claim.vehicle else claim.vehicle_id} - {claim.tipo.value}",
                details={"before": before, "after": self._serialize(claim)},
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível atualizar o sinistro") from exc
        return await self.get(claim.id)

    async def _require_vehicle_for_claim(self, vehicle_id: UUID):
        vehicle = await self.vehicles.get_by_id(vehicle_id)
        if not vehicle:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Veículo não encontrado")
        if vehicle.status not in {VehicleStatus.ATIVO, VehicleStatus.MANUTENCAO}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sinistros so podem ser registrados para veículos ativos ou em manutencao",
            )
        return vehicle

    async def _require_driver_if_needed(self, driver_id: UUID | None, occurred_at, vehicle_id: UUID):
        if not driver_id:
            return None
        driver = await self.drivers.get_by_id(driver_id)
        if not driver:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Condutor não encontrado")
        if not await self.possessions.driver_had_vehicle_at(vehicle_id=vehicle_id, driver_id=driver_id, occurred_at=occurred_at):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Condutor informado não possuia posse ativa deste veículo na data do sinistro",
            )
        return driver

    async def _validate_closed_claim(self, claim_status: ClaimStatus, valor, justificativa: str | None) -> None:
        if claim_status == ClaimStatus.ENCERRADO and valor is None and not justificativa:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sinistro encerrado exige valor estimado ou justificativa",
            )

    def _serialize(self, claim: Claim) -> dict:
        return {
            "id": claim.id,
            "vehicle_id": claim.vehicle_id,
            "vehicle_plate": claim.vehicle.plate if claim.vehicle else "",
            "driver_id": claim.driver_id,
            "driver_name": claim.driver.nome_completo if claim.driver else None,
            "data_ocorrencia": claim.data_ocorrencia,
            "tipo": claim.tipo,
            "descricao": claim.descricao,
            "local": claim.local,
            "boletim_ocorrencia": claim.boletim_ocorrencia,
            "valor_estimado": claim.valor_estimado,
            "status": claim.status,
            "justificativa_encerramento": claim.justificativa_encerramento,
            "anexos": claim.anexos,
            "created_by": claim.created_by,
            "created_at": claim.created_at,
            "updated_at": claim.updated_at,
        }
