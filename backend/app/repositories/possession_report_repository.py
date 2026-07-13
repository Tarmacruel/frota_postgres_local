from __future__ import annotations

from uuid import UUID

from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from app.models.location_history import LocationHistory
from app.models.master_data import Allocation, Department
from app.models.possession import VehiclePossession
from app.models.possession_trip import (
    VehiclePossessionReturnConfirmation,
    VehiclePossessionTrip,
    VehiclePossessionTripDestination,
)
from app.models.vehicle import Vehicle
from app.schemas.possession_report import (
    PossessionReportFilters,
    PossessionReportMode,
    PossessionStatusFilter,
    PossessionTemporalField,
)


class PossessionReportRepository:
    """Bounded, eagerly-loaded report queries. No method commits a transaction."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def load(
        self,
        *,
        mode: PossessionReportMode,
        filters: PossessionReportFilters,
        organization_id: UUID | None,
        limit: int,
        include_operational_search: bool,
    ) -> list[VehiclePossession | VehiclePossessionTrip]:
        if mode == PossessionReportMode.POSSESSION:
            return await self._load_possessions(
                filters,
                organization_id=organization_id,
                limit=limit,
                include_operational_search=include_operational_search,
            )
        return await self._load_trips(
            filters,
            organization_id=organization_id,
            limit=limit,
            include_operational_search=include_operational_search,
        )

    async def _load_possessions(
        self,
        filters: PossessionReportFilters,
        *,
        organization_id: UUID | None,
        limit: int,
        include_operational_search: bool,
    ) -> list[VehiclePossession]:
        statement = (
            select(VehiclePossession)
            .join(Vehicle, Vehicle.id == VehiclePossession.vehicle_id)
            .options(
                joinedload(VehiclePossession.vehicle),
                selectinload(VehiclePossession.trips).selectinload(VehiclePossessionTrip.destinations),
                selectinload(VehiclePossession.return_confirmations),
            )
        )
        statement = self._apply_common_filters(
            statement,
            filters,
            possession=VehiclePossession,
            vehicle=Vehicle,
            organization_id=organization_id,
        )
        if filters.trip_status is not None:
            statement = statement.where(
                exists(
                    select(VehiclePossessionTrip.id).where(
                        VehiclePossessionTrip.possession_id == VehiclePossession.id,
                        VehiclePossessionTrip.status == filters.trip_status.value,
                    )
                )
            )
        if filters.has_return is not None:
            statement = statement.where(
                VehiclePossession.end_date.is_not(None)
                if filters.has_return
                else VehiclePossession.end_date.is_(None)
            )
        if filters.search:
            pattern = self._search_pattern(filters.search)
            search_conditions = [
                Vehicle.plate.ilike(pattern, escape="\\"),
                VehiclePossession.driver_name.ilike(pattern, escape="\\"),
            ]
            if include_operational_search:
                search_conditions.extend(
                    [
                        VehiclePossession.observation.ilike(pattern, escape="\\"),
                        exists(
                            select(VehiclePossessionTrip.id).where(
                                VehiclePossessionTrip.possession_id == VehiclePossession.id,
                                or_(
                                    VehiclePossessionTrip.origin.ilike(pattern, escape="\\"),
                                    VehiclePossessionTrip.purpose.ilike(pattern, escape="\\"),
                                ),
                            )
                        ),
                        exists(
                            select(VehiclePossessionTripDestination.id)
                            .join(
                                VehiclePossessionTrip,
                                VehiclePossessionTrip.id == VehiclePossessionTripDestination.trip_id,
                            )
                            .where(
                                VehiclePossessionTrip.possession_id == VehiclePossession.id,
                                VehiclePossessionTripDestination.description.ilike(pattern, escape="\\"),
                            )
                        ),
                    ]
                )
            statement = statement.where(or_(*search_conditions))
        statement = statement.order_by(
            VehiclePossession.start_date.desc(),
            VehiclePossession.public_number.desc(),
        ).limit(limit + 1)
        result = await self.db.execute(statement)
        return list(result.scalars().unique().all())

    async def _load_trips(
        self,
        filters: PossessionReportFilters,
        *,
        organization_id: UUID | None,
        limit: int,
        include_operational_search: bool,
    ) -> list[VehiclePossessionTrip]:
        statement = (
            select(VehiclePossessionTrip)
            .join(VehiclePossession, VehiclePossession.id == VehiclePossessionTrip.possession_id)
            .join(Vehicle, Vehicle.id == VehiclePossession.vehicle_id)
            .options(
                joinedload(VehiclePossessionTrip.possession).joinedload(VehiclePossession.vehicle),
                selectinload(VehiclePossessionTrip.destinations),
            )
        )
        statement = self._apply_common_filters(
            statement,
            filters,
            possession=VehiclePossession,
            vehicle=Vehicle,
            organization_id=organization_id,
        )
        if filters.trip_status is not None:
            statement = statement.where(VehiclePossessionTrip.status == filters.trip_status.value)
        if filters.temporal_field == PossessionTemporalField.TRIP_DEPARTURE:
            if filters.date_from:
                statement = statement.where(VehiclePossessionTrip.departure_at >= filters.date_from)
            if filters.date_to:
                statement = statement.where(VehiclePossessionTrip.departure_at <= filters.date_to)
        if filters.has_return is not None:
            statement = statement.where(
                VehiclePossessionTrip.return_at.is_not(None)
                if filters.has_return
                else VehiclePossessionTrip.return_at.is_(None)
            )
        if filters.search:
            pattern = self._search_pattern(filters.search)
            search_conditions = [
                Vehicle.plate.ilike(pattern, escape="\\"),
                VehiclePossession.driver_name.ilike(pattern, escape="\\"),
            ]
            if include_operational_search:
                search_conditions.extend(
                    [
                        VehiclePossessionTrip.origin.ilike(pattern, escape="\\"),
                        VehiclePossessionTrip.purpose.ilike(pattern, escape="\\"),
                        VehiclePossessionTrip.observation.ilike(pattern, escape="\\"),
                        exists(
                            select(VehiclePossessionTripDestination.id).where(
                                VehiclePossessionTripDestination.trip_id == VehiclePossessionTrip.id,
                                VehiclePossessionTripDestination.description.ilike(pattern, escape="\\"),
                            )
                        ),
                    ]
                )
            statement = statement.where(or_(*search_conditions))
        statement = statement.order_by(
            VehiclePossessionTrip.departure_at.desc(),
            VehiclePossession.public_number.desc(),
            VehiclePossessionTrip.sequence_number.desc(),
        ).limit(limit + 1)
        result = await self.db.execute(statement)
        return list(result.scalars().unique().all())

    def _apply_common_filters(
        self,
        statement,
        filters: PossessionReportFilters,
        *,
        possession,
        vehicle,
        organization_id: UUID | None,
    ):
        if filters.vehicle_id:
            statement = statement.where(possession.vehicle_id == filters.vehicle_id)
        if filters.driver_id:
            statement = statement.where(possession.driver_id == filters.driver_id)
        if filters.possession_status == PossessionStatusFilter.ACTIVE:
            statement = statement.where(possession.end_date.is_(None))
        elif filters.possession_status == PossessionStatusFilter.CLOSED:
            statement = statement.where(possession.end_date.is_not(None))
        if filters.temporal_field == PossessionTemporalField.POSSESSION_START:
            if filters.date_from:
                statement = statement.where(possession.start_date >= filters.date_from)
            if filters.date_to:
                statement = statement.where(possession.start_date <= filters.date_to)
        if filters.has_return_confirmation is not None:
            confirmation_exists = exists(
                select(VehiclePossessionReturnConfirmation.id).where(
                    VehiclePossessionReturnConfirmation.possession_id == possession.id,
                    VehiclePossessionReturnConfirmation.is_current.is_(True),
                )
            )
            statement = statement.where(confirmation_exists if filters.has_return_confirmation else ~confirmation_exists)
        effective_organization_id = organization_id or filters.organization_id
        if effective_organization_id:
            scoped_vehicle = exists(
                select(LocationHistory.id)
                .join(Allocation, Allocation.id == LocationHistory.allocation_id)
                .join(Department, Department.id == Allocation.department_id)
                .where(
                    LocationHistory.vehicle_id == vehicle.id,
                    LocationHistory.end_date.is_(None),
                    Department.organization_id == effective_organization_id,
                )
            )
            statement = statement.where(scoped_vehicle)
        return statement

    @staticmethod
    def _search_pattern(value: str) -> str:
        escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return f"%{escaped}%"
