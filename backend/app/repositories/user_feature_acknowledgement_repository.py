from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_feature_acknowledgement import UserFeatureAcknowledgement


class UserFeatureAcknowledgementRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(
        self,
        *,
        user_id: UUID,
        feature_key: str,
    ) -> UserFeatureAcknowledgement | None:
        result = await self.db.execute(
            select(UserFeatureAcknowledgement).where(
                UserFeatureAcknowledgement.user_id == user_id,
                UserFeatureAcknowledgement.feature_key == feature_key,
            )
        )
        return result.scalar_one_or_none()

    async def acknowledge(
        self,
        *,
        user_id: UUID,
        feature_key: str,
    ) -> UserFeatureAcknowledgement:
        """Create the acknowledgement once, including under concurrent requests."""
        statement = (
            insert(UserFeatureAcknowledgement)
            .values(user_id=user_id, feature_key=feature_key)
            .on_conflict_do_nothing(
                constraint="uq_user_feature_acknowledgements_user_feature"
            )
            .returning(UserFeatureAcknowledgement)
        )
        result = await self.db.execute(statement)
        acknowledgement = result.scalar_one_or_none()
        if acknowledgement is not None:
            return acknowledgement

        # PostgreSQL waits for a conflicting transaction before returning from
        # ON CONFLICT. A new statement can therefore read the persisted row.
        acknowledgement = await self.get(user_id=user_id, feature_key=feature_key)
        if acknowledgement is None:  # defensive guard against an unexpected DB contract breach
            raise RuntimeError("Falha ao registrar reconhecimento do guia")
        return acknowledgement
