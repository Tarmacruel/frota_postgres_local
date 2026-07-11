from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.possession import VehiclePossession
from app.models.possession_trip import (
    VehiclePossessionReturnConfirmation,
    VehiclePossessionTrip,
    VehiclePossessionTripDestination,
    VehiclePossessionTripStatus,
)


class PossessionTripRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id_and_possession(
        self,
        *,
        trip_id: UUID,
        possession_id: UUID,
        for_update: bool = False,
    ) -> VehiclePossessionTrip | None:
        statement = (
            select(VehiclePossessionTrip)
            .options(selectinload(VehiclePossessionTrip.destinations))
            .where(
                VehiclePossessionTrip.id == trip_id,
                VehiclePossessionTrip.possession_id == possession_id,
            )
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def get_open_by_possession(
        self,
        possession_id: UUID,
        *,
        for_update: bool = False,
    ) -> VehiclePossessionTrip | None:
        statement = (
            select(VehiclePossessionTrip)
            .options(selectinload(VehiclePossessionTrip.destinations))
            .where(
                VehiclePossessionTrip.possession_id == possession_id,
                VehiclePossessionTrip.status == VehiclePossessionTripStatus.EM_ANDAMENTO,
            )
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def list_by_possession(self, possession_id: UUID) -> list[VehiclePossessionTrip]:
        result = await self.db.execute(
            select(VehiclePossessionTrip)
            .options(selectinload(VehiclePossessionTrip.destinations))
            .where(VehiclePossessionTrip.possession_id == possession_id)
            .order_by(VehiclePossessionTrip.sequence_number.asc())
        )
        return list(result.scalars().unique().all())

    async def next_trip_sequence(self, possession_id: UUID) -> int | None:
        locked = await self.db.execute(
            select(VehiclePossession.id)
            .where(VehiclePossession.id == possession_id)
            .with_for_update()
        )
        if locked.scalar_one_or_none() is None:
            return None
        result = await self.db.execute(
            select(func.coalesce(func.max(VehiclePossessionTrip.sequence_number), 0) + 1).where(
                VehiclePossessionTrip.possession_id == possession_id
            )
        )
        return int(result.scalar_one())

    async def next_destination_sequence(self, trip_id: UUID) -> int | None:
        locked = await self.db.execute(
            select(VehiclePossessionTrip.id)
            .where(VehiclePossessionTrip.id == trip_id)
            .with_for_update()
        )
        if locked.scalar_one_or_none() is None:
            return None
        result = await self.db.execute(
            select(func.coalesce(func.max(VehiclePossessionTripDestination.sequence_number), 0) + 1).where(
                VehiclePossessionTripDestination.trip_id == trip_id
            )
        )
        return int(result.scalar_one())

    async def create(self, trip: VehiclePossessionTrip) -> VehiclePossessionTrip:
        self.db.add(trip)
        await self.db.flush()
        return trip

    async def add_destination(
        self,
        destination: VehiclePossessionTripDestination,
    ) -> VehiclePossessionTripDestination:
        self.db.add(destination)
        await self.db.flush()
        return destination


class PossessionReturnConfirmationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_current(
        self,
        possession_id: UUID,
        *,
        for_update: bool = False,
    ) -> VehiclePossessionReturnConfirmation | None:
        statement = select(VehiclePossessionReturnConfirmation).where(
            VehiclePossessionReturnConfirmation.possession_id == possession_id,
            VehiclePossessionReturnConfirmation.is_current.is_(True),
        )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def next_version(self, possession_id: UUID) -> int | None:
        locked = await self.db.execute(
            select(VehiclePossession.id)
            .where(VehiclePossession.id == possession_id)
            .with_for_update()
        )
        if locked.scalar_one_or_none() is None:
            return None
        result = await self.db.execute(
            select(func.coalesce(func.max(VehiclePossessionReturnConfirmation.version), 0) + 1).where(
                VehiclePossessionReturnConfirmation.possession_id == possession_id
            )
        )
        return int(result.scalar_one())

    async def create(
        self,
        confirmation: VehiclePossessionReturnConfirmation,
    ) -> VehiclePossessionReturnConfirmation:
        self.db.add(confirmation)
        await self.db.flush()
        return confirmation
