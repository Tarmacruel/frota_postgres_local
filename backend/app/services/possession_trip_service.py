from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.possession import VehiclePossession
from app.models.possession_trip import (
    VehiclePossessionTrip,
    VehiclePossessionTripDestination,
    VehiclePossessionTripStatus,
)
from app.models.user import User, UserRole
from app.repositories.possession_repository import PossessionRepository
from app.repositories.possession_trip_repository import PossessionTripRepository
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.common import PaginatedResponse, build_pagination
from app.schemas.possession_trip import (
    TripCancel,
    TripCreate,
    TripDestinationCreate,
    TripEnd,
)
from app.services.audit_service import AuditService


def _conflict(code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": code, "message": message},
    )


class PossessionTripService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
        self.trips = PossessionTripRepository(db)
        self.vehicles = VehicleRepository(db)
        self.audit = AuditService(db)

    async def list_paginated(
        self,
        possession_id: UUID,
        *,
        page: int,
        limit: int,
        trip_status: VehiclePossessionTripStatus | None,
        current_user: User,
    ) -> PaginatedResponse[dict]:
        await self._get_visible_possession(possession_id, current_user=current_user)
        records, total = await self.trips.list_paginated_by_possession(
            possession_id,
            page=page,
            limit=limit,
            status=trip_status,
        )
        return PaginatedResponse[dict](
            data=[self._serialize(record, current_user=current_user) for record in records],
            pagination=build_pagination(page, limit, total),
        )

    async def get(self, possession_id: UUID, trip_id: UUID, *, current_user: User) -> dict:
        await self._get_visible_possession(possession_id, current_user=current_user)
        trip = await self.trips.get_by_id_and_possession(
            trip_id=trip_id,
            possession_id=possession_id,
        )
        if trip is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rota nÃ£o encontrada")
        return self._serialize(trip, current_user=current_user)

    async def create(self, possession_id: UUID, data: TripCreate, *, current_user: User) -> dict:
        try:
            trip = await self.create_in_transaction(
                possession_id,
                data,
                current_user=current_user,
            )
            await self.db.commit()
        except HTTPException:
            await self.db.rollback()
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict("TRIP_CONFLICT", "NÃ£o foi possÃ­vel iniciar a rota") from exc
        except Exception:
            await self.db.rollback()
            raise
        return await self.get(possession_id, trip.id, current_user=current_user)

    async def create_in_transaction(
        self,
        possession_id: UUID,
        data: TripCreate,
        *,
        current_user: User,
    ) -> VehiclePossessionTrip:
        possession = await self._get_visible_possession(
            possession_id,
            current_user=current_user,
            for_update=True,
        )
        if possession.end_date is not None:
            raise _conflict("POSSESSION_ALREADY_ENDED", "Posse encerrada nÃ£o pode receber nova rota")
        if data.departure_at < possession.start_date:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "TRIP_BEFORE_POSSESSION", "message": "A saÃ­da nÃ£o pode anteceder o inÃ­cio da posse"},
            )
        if await self.trips.get_open_by_possession(possession_id, for_update=True):
            raise _conflict("OPEN_TRIP_EXISTS", "JÃ¡ existe uma rota em andamento nesta posse")

        await self._validate_start_odometer(possession, data.start_odometer_km)
        sequence_number = await self.trips.next_trip_sequence(possession_id)
        if sequence_number is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posse nÃ£o encontrada")

        trip = VehiclePossessionTrip(
            possession_id=possession_id,
            sequence_number=sequence_number,
            status=VehiclePossessionTripStatus.EM_ANDAMENTO,
            origin=data.origin,
            purpose=data.purpose,
            departure_at=data.departure_at,
            start_odometer_km=data.start_odometer_km,
            observation=data.observation,
            created_by_user_id=current_user.id,
        )
        await self.trips.create(trip)
        destinations = await self._add_destinations_in_transaction(
            trip,
            data.destinations,
            current_user=current_user,
        )
        await self.audit.record(
            actor=current_user,
            action="TRIP_CREATE",
            entity_type="POSSESSION_TRIP",
            entity_id=trip.id,
            entity_label=f"Posse {possession.public_number} / rota {trip.sequence_number}",
            details={
                "possession_id": str(possession.id),
                "possession_public_number": possession.public_number,
                "trip_sequence": trip.sequence_number,
                "departure_at": trip.departure_at.isoformat(),
                "start_odometer_km": str(trip.start_odometer_km),
                "destination_count": len(destinations),
            },
        )
        if destinations:
            await self._audit_destination_add(
                possession=possession,
                trip=trip,
                destinations=destinations,
                current_user=current_user,
            )
        return trip

    async def add_destinations(
        self,
        possession_id: UUID,
        trip_id: UUID,
        destinations: list[TripDestinationCreate],
        *,
        current_user: User,
    ) -> dict:
        try:
            possession = await self._get_visible_possession(
                possession_id,
                current_user=current_user,
                for_update=True,
            )
            trip = await self.trips.get_by_id_and_possession(
                trip_id=trip_id,
                possession_id=possession_id,
                for_update=True,
            )
            if trip is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rota nÃ£o encontrada")
            if possession.end_date is not None or trip.status != VehiclePossessionTripStatus.EM_ANDAMENTO:
                raise _conflict("TRIP_NOT_OPEN", "Destinos sÃ³ podem ser adicionados a uma rota em andamento")
            created = await self._add_destinations_in_transaction(
                trip,
                destinations,
                current_user=current_user,
            )
            await self._audit_destination_add(
                possession=possession,
                trip=trip,
                destinations=created,
                current_user=current_user,
            )
            await self.db.commit()
        except HTTPException:
            await self.db.rollback()
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict("TRIP_DESTINATION_CONFLICT", "NÃ£o foi possÃ­vel incluir os destinos") from exc
        except Exception:
            await self.db.rollback()
            raise
        return await self.get(possession_id, trip_id, current_user=current_user)

    async def end(
        self,
        possession_id: UUID,
        trip_id: UUID,
        data: TripEnd,
        *,
        current_user: User,
    ) -> dict:
        try:
            possession = await self._get_visible_possession(
                possession_id,
                current_user=current_user,
                for_update=True,
            )
            trip = await self.trips.get_by_id_and_possession(
                trip_id=trip_id,
                possession_id=possession_id,
                for_update=True,
            )
            if trip is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rota nÃ£o encontrada")
            if possession.end_date is not None or trip.status != VehiclePossessionTripStatus.EM_ANDAMENTO:
                raise _conflict("TRIP_NOT_OPEN", "Somente uma rota em andamento pode ser encerrada")
            if data.return_at < trip.departure_at:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"code": "TRIP_RETURN_BEFORE_DEPARTURE", "message": "O retorno nÃ£o pode anteceder a saÃ­da"},
                )
            if data.end_odometer_km < trip.start_odometer_km:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"code": "TRIP_ODOMETER_REVERSED", "message": "O hodÃ´metro final nÃ£o pode ser inferior ao inicial"},
                )

            trip.status = VehiclePossessionTripStatus.ENCERRADA
            trip.return_at = data.return_at
            trip.end_odometer_km = data.end_odometer_km
            if data.observation is not None:
                trip.observation = data.observation
            trip.closed_by_user_id = current_user.id
            trip.closed_at = datetime.now(timezone.utc)
            kilometers = data.end_odometer_km - trip.start_odometer_km
            await self.audit.record(
                actor=current_user,
                action="TRIP_END",
                entity_type="POSSESSION_TRIP",
                entity_id=trip.id,
                entity_label=f"Posse {possession.public_number} / rota {trip.sequence_number}",
                details={
                    "possession_id": str(possession.id),
                    "trip_sequence": trip.sequence_number,
                    "return_at": data.return_at.isoformat(),
                    "end_odometer_km": str(data.end_odometer_km),
                    "kilometers_driven": str(kilometers),
                },
            )
            await self.db.flush()
            await self.db.commit()
        except HTTPException:
            await self.db.rollback()
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict("TRIP_END_CONFLICT", "NÃ£o foi possÃ­vel encerrar a rota") from exc
        except Exception:
            await self.db.rollback()
            raise
        return await self.get(possession_id, trip_id, current_user=current_user)

    async def cancel(
        self,
        possession_id: UUID,
        trip_id: UUID,
        data: TripCancel,
        *,
        current_user: User,
    ) -> dict:
        try:
            possession = await self._get_visible_possession(
                possession_id,
                current_user=current_user,
                for_update=True,
            )
            trip = await self.trips.get_by_id_and_possession(
                trip_id=trip_id,
                possession_id=possession_id,
                for_update=True,
            )
            if trip is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rota nÃ£o encontrada")
            if possession.end_date is not None or trip.status != VehiclePossessionTripStatus.EM_ANDAMENTO:
                raise _conflict("TRIP_NOT_OPEN", "Somente uma rota em andamento pode ser cancelada")

            trip.status = VehiclePossessionTripStatus.CANCELADA
            trip.cancelled_by_user_id = current_user.id
            trip.cancelled_at = datetime.now(timezone.utc)
            trip.cancellation_reason = data.reason
            await self.audit.record(
                actor=current_user,
                action="TRIP_CANCEL",
                entity_type="POSSESSION_TRIP",
                entity_id=trip.id,
                entity_label=f"Posse {possession.public_number} / rota {trip.sequence_number}",
                details={
                    "possession_id": str(possession.id),
                    "trip_sequence": trip.sequence_number,
                    "reason": data.reason,
                },
            )
            await self.db.flush()
            await self.db.commit()
        except HTTPException:
            await self.db.rollback()
            raise
        except IntegrityError as exc:
            await self.db.rollback()
            raise _conflict("TRIP_CANCEL_CONFLICT", "NÃ£o foi possÃ­vel cancelar a rota") from exc
        except Exception:
            await self.db.rollback()
            raise
        return await self.get(possession_id, trip_id, current_user=current_user)

    async def _add_destinations_in_transaction(
        self,
        trip: VehiclePossessionTrip,
        destinations: list[TripDestinationCreate],
        *,
        current_user: User,
    ) -> list[VehiclePossessionTripDestination]:
        created: list[VehiclePossessionTripDestination] = []
        for data in destinations:
            sequence_number = await self.trips.next_destination_sequence(trip.id)
            if sequence_number is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rota nÃ£o encontrada")
            destination = VehiclePossessionTripDestination(
                trip_id=trip.id,
                sequence_number=sequence_number,
                description=data.description,
                address_reference=data.address_reference,
                observation=data.observation,
                arrived_at=data.arrived_at,
                departed_at=data.departed_at,
                created_by_user_id=current_user.id,
            )
            await self.trips.add_destination(destination)
            created.append(destination)
        return created

    async def _audit_destination_add(
        self,
        *,
        possession: VehiclePossession,
        trip: VehiclePossessionTrip,
        destinations: list[VehiclePossessionTripDestination],
        current_user: User,
    ) -> None:
        await self.audit.record(
            actor=current_user,
            action="TRIP_DESTINATION_ADD",
            entity_type="POSSESSION_TRIP",
            entity_id=trip.id,
            entity_label=f"Posse {possession.public_number} / rota {trip.sequence_number}",
            details={
                "possession_id": str(possession.id),
                "trip_sequence": trip.sequence_number,
                "destination_ids": [str(item.id) for item in destinations],
                "destination_sequences": [item.sequence_number for item in destinations],
                "destination_count": len(destinations),
            },
        )

    async def _validate_start_odometer(self, possession: VehiclePossession, value: Decimal) -> None:
        latest = await self.trips.get_latest_completed(possession.id)
        expected_value = latest.end_odometer_km if latest is not None else possession.start_odometer_km
        if expected_value is None:
            return
        expected = Decimal(str(expected_value)).quantize(Decimal("0.1"))
        if value != expected:
            raise _conflict(
                "TRIP_ODOMETER_DIVERGENCE",
                f"O hodÃ´metro inicial deve coincidir com o Ãºltimo valor conhecido ({expected} km)",
            )

    async def _get_visible_possession(
        self,
        possession_id: UUID,
        *,
        current_user: User,
        for_update: bool = False,
    ) -> VehiclePossession:
        possession = (
            await self.possessions.get_by_id_for_update(possession_id)
            if for_update
            else await self.possessions.get_by_id(possession_id)
        )
        if possession is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posse nÃ£o encontrada")
        organization_id = scoped_organization_id(current_user)
        if organization_id is None:
            if production_scope_is_empty(current_user):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posse nÃ£o encontrada")
            return possession
        if not await self.vehicles.is_vehicle_in_organization(possession.vehicle_id, organization_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Posse nÃ£o encontrada")
        return possession

    def _serialize(self, trip: VehiclePossessionTrip, *, current_user: User) -> dict:
        operational_details_restricted = current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO}
        destinations = [] if operational_details_restricted else [
            {
                "id": destination.id,
                "sequence_number": destination.sequence_number,
                "description": destination.description,
                "address_reference": destination.address_reference,
                "observation": destination.observation,
                "arrived_at": destination.arrived_at,
                "departed_at": destination.departed_at,
                "created_at": destination.created_at,
            }
            for destination in trip.destinations
        ]
        kilometers = None
        if trip.end_odometer_km is not None:
            kilometers = trip.end_odometer_km - trip.start_odometer_km
        return {
            "id": trip.id,
            "possession_id": trip.possession_id,
            "sequence_number": trip.sequence_number,
            "status": trip.status,
            "origin": "InformaÃ§Ã£o restrita" if operational_details_restricted else trip.origin,
            "purpose": trip.purpose,
            "departure_at": trip.departure_at,
            "return_at": trip.return_at,
            "start_odometer_km": trip.start_odometer_km,
            "end_odometer_km": trip.end_odometer_km,
            "kilometers_driven": kilometers,
            "observation": None if operational_details_restricted else trip.observation,
            "cancellation_reason": None if operational_details_restricted else trip.cancellation_reason,
            "created_at": trip.created_at,
            "updated_at": trip.updated_at,
            "closed_at": trip.closed_at,
            "cancelled_at": trip.cancelled_at,
            "destinations": destinations,
            "operational_details_restricted": operational_details_restricted,
        }
