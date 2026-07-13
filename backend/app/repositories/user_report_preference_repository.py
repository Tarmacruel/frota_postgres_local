from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_report_preference import UserReportPreference


class UserReportPreferenceRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, *, user_id: UUID, report_type: str) -> UserReportPreference | None:
        result = await self.db.execute(
            select(UserReportPreference).where(
                UserReportPreference.user_id == user_id,
                UserReportPreference.report_type == report_type,
            )
        )
        return result.scalar_one_or_none()

    async def upsert(self, *, user_id: UUID, report_type: str, config: dict) -> UserReportPreference:
        preference = await self.get(user_id=user_id, report_type=report_type)
        if preference is None:
            preference = UserReportPreference(
                user_id=user_id,
                report_type=report_type,
                config=config,
            )
            self.db.add(preference)
        else:
            preference.config = config
        await self.db.flush()
        return preference
