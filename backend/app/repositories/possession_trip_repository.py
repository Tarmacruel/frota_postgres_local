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
            .execution_options(populate_existing=True)
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
            .execution_options(populate_existing=True)
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
            .execution_options(populate_existing=True)
            .where(VehiclePossessionTrip.possession_id == possession_id)
            .order_by(VehiclePossessionTrip.sequence_number.asc())
        )
        return list(result.scalars().unique().all())

    async def list_paginated_by_possession(
        self,
        possession_id: UUID,
        *,
        page: int,
        limit: int,
        status: VehiclePossessionTripStatus | None = None,
    ) -> tuple[list[VehiclePossessionTrip], int]:
        statement = (
            select(VehiclePossessionTrip)
            .options(selectinload(VehiclePossessionTrip.destinations))
            .execution_options(populate_existing=True)
            .where(VehiclePossessionTrip.possession_id == possession_id)
        )
        count_statement = select(func.count(VehiclePossessionTrip.id)).where(
            VehiclePossessionTrip.possession_id == possession_id
        )
        if status is not None:
            statement = statement.where(VehiclePossessionTrip.status == status)
            count_statement = count_statement.where(VehiclePossessionTrip.status == status)
        statement = (
            statement
            .order_by(VehiclePossessionTrip.sequence_number.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
        total = int((await self.db.execute(count_statement)).scalar_one())
        items = list((await self.db.execute(statement)).scalars().unique().all())
        return items, total

    async def get_latest_completed(self, possession_id: UUID) -> VehiclePossessionTrip | None:
        result = await self.db.execute(
            select(VehiclePossessionTrip)
            .where(
                VehiclePossessionTrip.possession_id == possession_id,
                VehiclePossessionTrip.status == VehiclePossessionTripStatus.ENCERRADA,
            )
            .order_by(VehiclePossessionTrip.sequence_number.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

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
