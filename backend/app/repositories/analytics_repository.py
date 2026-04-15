from __future__ import annotations

from datetime import datetime
from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.fleet_analytics_snapshot import FleetAnalyticsSnapshot


class AnalyticsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def replace_period_snapshots(
        self,
        *,
        period_start: datetime,
        period_end: datetime,
        items: list[FleetAnalyticsSnapshot],
    ) -> None:
        await self.db.execute(
            delete(FleetAnalyticsSnapshot).where(
                FleetAnalyticsSnapshot.period_start == period_start,
                FleetAnalyticsSnapshot.period_end == period_end,
            )
        )
        for item in items:
            self.db.add(item)
        await self.db.flush()

    async def list_period_snapshots(self, *, period_start: datetime, period_end: datetime) -> list[FleetAnalyticsSnapshot]:
        rows = await self.db.execute(
            select(FleetAnalyticsSnapshot)
            .where(
                FleetAnalyticsSnapshot.period_start == period_start,
                FleetAnalyticsSnapshot.period_end == period_end,
            )
            .order_by(desc(FleetAnalyticsSnapshot.created_at))
        )
        return list(rows.scalars().all())
