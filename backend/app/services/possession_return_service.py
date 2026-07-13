from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.request_context import get_request_audit_context, normalize_request_id
from app.models.possession_trip import VehiclePossessionReturnConfirmation
from app.models.user import User, UserRole
from app.repositories.possession_repository import PossessionRepository
from app.repositories.possession_trip_repository import (
    PossessionReturnConfirmationRepository,
    PossessionTripRepository,
)
from app.schemas.possession_return import PossessionEndWithConfirmation, PossessionReturnCorrection
from app.services.audit_service import AuditService
from app.services.possession_service import PossessionService


DECLARATION_VERSION = "1.0"
DECLARATION_TEXT = (
    "Declaro que o veículo identificado nesta posse foi devolvido à Frota Municipal na data e hora "
    "informadas, com o hodômetro e as condições registrados neste sistema. Confirmo que revisei as "
    "informações apresentadas e estou ciente de que esta declaração ficará vinculada ao meu usuário "
    "e à sessão autenticada para fins de responsabilidade e auditoria."
)
CANONICAL_SCHEMA_VERSION = "possession-return-confirmation.v1"
ODOMETER_QUANTUM = Decimal("0.1")


def _utc_iso(value: datetime) -> str:
    normalized = value.astimezone(timezone.utc)
    return normalized.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _decimal_odometer(value: float | Decimal) -> Decimal:
    return Decimal(str(value)).quantize(ODOMETER_QUANTUM, rounding=ROUND_HALF_UP)


def build_canonical_return_payload(
    *,
    possession,
    user: User,
    confirmed_at: datetime,
    returned_at: datetime,
    final_odometer_km: Decimal,
    vehicle_condition_notes: str,
    last_trip_id: UUID | None,
    request_id: str,
    version: int,
    correction_of_hash: str | None = None,
) -> dict:
    payload = {
        "schema_version": CANONICAL_SCHEMA_VERSION,
        "confirmation_version": version,
        "possession_id": str(possession.id),
        "possession_public_number": possession.public_number,
        "vehicle_id": str(possession.vehicle_id),
        "driver": {
            "id": str(possession.driver_id) if possession.driver_id else None,
            "name_snapshot": possession.driver_name,
        },
        "confirmed_by_user_id": str(user.id),
        "declaration_version": DECLARATION_VERSION,
        "declaration_text": DECLARATION_TEXT,
        "confirmed_at": _utc_iso(confirmed_at),
        "returned_at": _utc_iso(returned_at),
        "final_odometer_km": format(final_odometer_km, ".1f"),
        "vehicle_condition_notes": vehicle_condition_notes,
        "last_trip_id": str(last_trip_id) if last_trip_id else None,
        "request_id": request_id,
    }
    if correction_of_hash:
        payload["correction_of_hash"] = correction_of_hash
    return payload


def canonical_payload_sha256(payload: dict) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class PossessionReturnService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
        self.trips = PossessionTripRepository(db)
        self.confirmations = PossessionReturnConfirmationRepository(db)
        self.audit = AuditService(db)

    async def get_context(self, possession_id: UUID, current_user: User) -> dict:
        possession = await self._visible_possession(possession_id, current_user)
        open_trip = await self.trips.get_open_by_possession(possession_id)
        latest_trip = await self.trips.get_latest_completed(possession_id)
        current = await self.confirmations.get_current(possession_id)
        minimum = self._minimum_odometer(possession, latest_trip)
        serialized_current = self.serialize_confirmation(current) if current else None
        if serialized_current and current_user.role == UserRole.PADRAO:
            serialized_current["confirmer_name"] = "Usuário autenticado (dados restritos)"
        return {
            "possession_id": possession.id,
            "possession_public_number": possession.public_number,
            "vehicle_plate": possession.vehicle.plate,
            "driver_name": possession.driver_name,
            "start_date": possession.start_date,
            "start_odometer_km": possession.start_odometer_km,
            "last_trip_id": latest_trip.id if latest_trip else None,
            "minimum_end_odometer_km": float(minimum),
            "has_open_trip": open_trip is not None,
            "declaration": {"version": DECLARATION_VERSION, "text": DECLARATION_TEXT},
            "current_confirmation": serialized_current,
        }

    async def end(
        self,
        possession_id: UUID,
        data: PossessionEndWithConfirmation,
        current_user: User,
    ) -> VehiclePossessionReturnConfirmation:
        if data.declaration_accepted is not True:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "RETURN_DECLARATION_REQUIRED", "message": "Confirme integralmente a declaração para encerrar a posse."},
            )
        await self._visible_possession(possession_id, current_user)
        self._require_aware_datetime(data.end_date)
        context = self._request_context()
        confirmed_at = datetime.now(timezone.utc)
        final_odometer = _decimal_odometer(data.end_odometer_km)

        try:
            possession = await self.possessions.get_by_id_for_update(possession_id)
            if possession is None:
                raise HTTPException(status_code=404, detail="Registro de posse não encontrado")
            if possession.end_date is not None:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "POSSESSION_ALREADY_ENDED", "message": "A posse já foi encerrada."},
                )
            if await self.trips.get_open_by_possession(possession_id, for_update=True):
                raise HTTPException(
                    status_code=409,
                    detail={"code": "POSSESSION_HAS_OPEN_TRIP", "message": "A posse não pode ser encerrada enquanto houver rota em andamento."},
                )
            if await self.confirmations.get_current(possession_id, for_update=True):
                raise HTTPException(
                    status_code=409,
                    detail={"code": "RETURN_CONFIRMATION_EXISTS", "message": "Já existe confirmação atual para esta posse."},
                )

            latest_trip = await self.trips.get_latest_completed(possession_id)
            self._validate_return_values(possession, latest_trip, data.end_date, final_odometer)
            version = await self.confirmations.next_version(possession_id)
            if version != 1:
                raise HTTPException(status_code=409, detail={"code": "RETURN_CONFIRMATION_VERSION_CONFLICT", "message": "O histórico de confirmações exige correção administrativa."})
            payload = build_canonical_return_payload(
                possession=possession,
                user=current_user,
                confirmed_at=confirmed_at,
                returned_at=data.end_date,
                final_odometer_km=final_odometer,
                vehicle_condition_notes=data.vehicle_condition_notes,
                last_trip_id=latest_trip.id if latest_trip else None,
                request_id=context["request_id"],
                version=version,
            )
            confirmation = VehiclePossessionReturnConfirmation(
                possession_id=possession.id,
                version=version,
                is_current=True,
                declaration_version=DECLARATION_VERSION,
                declaration_text=DECLARATION_TEXT,
                canonical_payload_hash=canonical_payload_sha256(payload),
                confirmed_by_user_id=current_user.id,
                confirmer_name=current_user.name,
                confirmer_email=current_user.email,
                confirmer_role=current_user.role.value,
                confirmed_at=confirmed_at,
                request_id=context["request_id"],
                ip_address=context["ip_address"],
                user_agent=context["user_agent"],
                final_odometer_km=final_odometer,
                vehicle_condition_notes=data.vehicle_condition_notes,
                last_trip_id=latest_trip.id if latest_trip else None,
            )
            possession.end_date = data.end_date
            possession.end_odometer_km = float(final_odometer)
            await self.confirmations.create(confirmation)
            await self.audit.record(
                actor=current_user,
                action="POSSESSION_RETURN_CONFIRMATION",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"Posse {possession.public_number}",
                details={
                    "confirmation_id": str(confirmation.id),
                    "confirmation_version": version,
                    "declaration_version": DECLARATION_VERSION,
                    "canonical_payload_hash": confirmation.canonical_payload_hash,
                    "returned_at": data.end_date.isoformat(),
                    "final_odometer_km": float(final_odometer),
                    "last_trip_id": str(latest_trip.id) if latest_trip else None,
                },
            )
            await self.audit.record(
                actor=current_user,
                action="POSSESSION_END",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"Posse {possession.public_number}",
                details={"confirmation_id": str(confirmation.id), "atomic": True},
            )
            await self.db.flush()
            await self.db.commit()
            return confirmation
        except HTTPException:
            await self.db.rollback()
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=409,
                detail={"code": "RETURN_CONFIRMATION_CONFLICT", "message": "A posse foi alterada por outra operação."},
            ) from exc
        except Exception:
            await self.db.rollback()
            raise

    async def correct(
        self,
        possession_id: UUID,
        data: PossessionReturnCorrection,
        current_user: User,
    ) -> VehiclePossessionReturnConfirmation:
        if data.declaration_accepted is not True:
            raise HTTPException(status_code=422, detail={"code": "RETURN_DECLARATION_REQUIRED", "message": "Confirme integralmente a declaração para registrar a correção."})
        await self._visible_possession(possession_id, current_user)
        context = self._request_context()
        confirmed_at = datetime.now(timezone.utc)
        final_odometer = _decimal_odometer(data.end_odometer_km)

        try:
            possession = await self.possessions.get_by_id_for_update(possession_id)
            if possession is None or possession.end_date is None:
                raise HTTPException(status_code=409, detail={"code": "POSSESSION_NOT_ENDED", "message": "Somente uma posse encerrada pode ter a confirmação corrigida."})
            current = await self.confirmations.get_current(possession_id, for_update=True)
            if current is None:
                raise HTTPException(status_code=409, detail={"code": "RETURN_CONFIRMATION_NOT_FOUND", "message": "A posse não possui confirmação versionada para corrigir."})
            latest_trip = await self.trips.get_latest_completed(possession_id)
            self._validate_return_values(possession, latest_trip, possession.end_date, final_odometer)
            version = await self.confirmations.next_version(possession_id)
            new_id = uuid4()
            payload = build_canonical_return_payload(
                possession=possession,
                user=current_user,
                confirmed_at=confirmed_at,
                returned_at=possession.end_date,
                final_odometer_km=final_odometer,
                vehicle_condition_notes=data.vehicle_condition_notes,
                last_trip_id=latest_trip.id if latest_trip else None,
                request_id=context["request_id"],
                version=version,
                correction_of_hash=current.canonical_payload_hash,
            )
            current.is_current = False
            current.superseded_at = confirmed_at
            current.superseded_by_confirmation_id = new_id
            await self.db.flush()
            confirmation = VehiclePossessionReturnConfirmation(
                id=new_id,
                possession_id=possession.id,
                version=version,
                is_current=True,
                declaration_version=DECLARATION_VERSION,
                declaration_text=DECLARATION_TEXT,
                canonical_payload_hash=canonical_payload_sha256(payload),
                confirmed_by_user_id=current_user.id,
                confirmer_name=current_user.name,
                confirmer_email=current_user.email,
                confirmer_role=current_user.role.value,
                confirmed_at=confirmed_at,
                request_id=context["request_id"],
                ip_address=context["ip_address"],
                user_agent=context["user_agent"],
                final_odometer_km=final_odometer,
                vehicle_condition_notes=data.vehicle_condition_notes,
                last_trip_id=latest_trip.id if latest_trip else None,
                admin_correction_reason=data.correction_reason,
            )
            possession.end_odometer_km = float(final_odometer)
            await self.confirmations.create(confirmation)
            await self.audit.record(
                actor=current_user,
                action="POSSESSION_RETURN_CORRECTION",
                entity_type="POSSESSION",
                entity_id=possession.id,
                entity_label=f"Posse {possession.public_number}",
                details={
                    "previous_confirmation_id": str(current.id),
                    "confirmation_id": str(confirmation.id),
                    "confirmation_version": version,
                    "canonical_payload_hash": confirmation.canonical_payload_hash,
                    "correction_reason": data.correction_reason,
                },
            )
            await self.db.flush()
            await self.db.commit()
            return confirmation
        except HTTPException:
            await self.db.rollback()
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=409, detail={"code": "RETURN_CORRECTION_CONFLICT", "message": "A confirmação foi alterada por outra operação."}) from exc
        except Exception:
            await self.db.rollback()
            raise

    async def history(self, possession_id: UUID, current_user: User) -> list[dict]:
        await self._visible_possession(possession_id, current_user)
        return [self.serialize_confirmation(item) for item in await self.confirmations.list_by_possession(possession_id)]

    async def _visible_possession(self, possession_id: UUID, current_user: User):
        possession = await self.possessions.get_by_id(possession_id)
        if possession is None:
            raise HTTPException(status_code=404, detail="Registro de posse não encontrado")
        await PossessionService(self.db)._ensure_possession_visible_to_user(possession, current_user)
        return possession

    @staticmethod
    def _request_context() -> dict[str, str]:
        context = get_request_audit_context()
        if context:
            return {"request_id": context.request_id, "ip_address": context.ip_address, "user_agent": context.user_agent or "unknown"}
        return {"request_id": normalize_request_id(None), "ip_address": "0.0.0.0", "user_agent": "unknown"}

    @staticmethod
    def _minimum_odometer(possession, latest_trip) -> Decimal:
        values = [Decimal("0")]
        if possession.start_odometer_km is not None:
            values.append(_decimal_odometer(possession.start_odometer_km))
        if latest_trip is not None and latest_trip.end_odometer_km is not None:
            values.append(_decimal_odometer(latest_trip.end_odometer_km))
        return max(values)

    def _validate_return_values(self, possession, latest_trip, returned_at: datetime, final_odometer: Decimal) -> None:
        if returned_at < possession.start_date:
            raise HTTPException(status_code=422, detail={"code": "POSSESSION_RETURN_BEFORE_START", "message": "A devolução não pode ser anterior ao início da posse."})
        if latest_trip is not None and latest_trip.return_at is not None and returned_at < latest_trip.return_at:
            raise HTTPException(status_code=422, detail={"code": "POSSESSION_RETURN_BEFORE_LAST_TRIP", "message": "A devolução não pode ser anterior ao retorno da última rota."})
        minimum = self._minimum_odometer(possession, latest_trip)
        if final_odometer < minimum:
            raise HTTPException(status_code=422, detail={"code": "POSSESSION_ODOMETER_REVERSED", "message": f"O hodômetro final deve ser igual ou superior a {minimum:.1f} km."})

    @staticmethod
    def _require_aware_datetime(value: datetime) -> None:
        if value.tzinfo is None or value.utcoffset() is None:
            raise HTTPException(status_code=422, detail={"code": "RETURN_DATETIME_TIMEZONE_REQUIRED", "message": "Informe data e hora com fuso horário."})

    @staticmethod
    def serialize_confirmation(confirmation: VehiclePossessionReturnConfirmation) -> dict:
        return {
            "id": confirmation.id,
            "version": confirmation.version,
            "is_current": confirmation.is_current,
            "declaration_version": confirmation.declaration_version,
            "declaration_text": confirmation.declaration_text,
            "canonical_payload_hash": confirmation.canonical_payload_hash,
            "confirmer_name": confirmation.confirmer_name,
            "confirmer_role": confirmation.confirmer_role,
            "confirmed_at": confirmation.confirmed_at,
            "final_odometer_km": float(confirmation.final_odometer_km),
            "vehicle_condition_notes": confirmation.vehicle_condition_notes,
            "last_trip_id": confirmation.last_trip_id,
            "superseded_at": confirmation.superseded_at,
            "superseded_by_confirmation_id": confirmation.superseded_by_confirmation_id,
            "admin_correction_reason": confirmation.admin_correction_reason,
        }
