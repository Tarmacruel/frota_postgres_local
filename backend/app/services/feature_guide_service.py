from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.user_feature_acknowledgement_repository import (
    UserFeatureAcknowledgementRepository,
)


FUEL_SUPPLY_ORDERS_BATCH_FEATURE_KEY = "fuel-supply-orders-batch-v1"


class FeatureGuideService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.acknowledgements = UserFeatureAcknowledgementRepository(db)

    async def get_state(self, *, user_id: UUID, feature_key: str) -> dict:
        acknowledgement = await self.acknowledgements.get(
            user_id=user_id,
            feature_key=feature_key,
        )
        return self._state(feature_key, acknowledgement)

    async def acknowledge(self, *, user_id: UUID, feature_key: str) -> dict:
        try:
            acknowledgement = await self.acknowledgements.acknowledge(
                user_id=user_id,
                feature_key=feature_key,
            )
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        return self._state(feature_key, acknowledgement)

    @staticmethod
    def _state(feature_key: str, acknowledgement) -> dict:
        return {
            "feature_key": feature_key,
            "acknowledged": acknowledgement is not None,
            "acknowledged_at": acknowledgement.acknowledged_at if acknowledgement else None,
        }
