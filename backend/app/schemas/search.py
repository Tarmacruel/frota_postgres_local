from __future__ import annotations

from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


SearchResultType = Literal["vehicle", "possession", "maintenance"]


class SearchResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    type: SearchResultType
    id: UUID
    title: str = Field(min_length=1)
    subtitle: str = Field(min_length=1)
    status: str = Field(min_length=1)
    route: str = Field(min_length=1)
    context: dict[str, str | None] = Field(default_factory=dict)
