from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FeatureGuideStateOut(BaseModel):
    feature_key: str
    acknowledged: bool
    acknowledged_at: datetime | None = None
