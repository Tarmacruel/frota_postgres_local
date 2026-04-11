from __future__ import annotations

from math import ceil
from typing import Generic, TypeVar
from pydantic import BaseModel, ConfigDict

def normalize_email(value: str) -> str:
    email = value.strip().lower()
    if not email or " " in email or email.count("@") != 1:
        raise ValueError("Informe um e-mail valido")

    local_part, domain = email.split("@", 1)
    if not local_part or not domain or domain.startswith(".") or domain.endswith("."):
        raise ValueError("Informe um e-mail valido")

    return email


class PaginationOut(BaseModel):
    page: int
    limit: int
    total: int
    pages: int
    has_next: bool
    has_prev: bool


ItemT = TypeVar("ItemT")


class PaginatedResponse(BaseModel, Generic[ItemT]):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    data: list[ItemT]
    pagination: PaginationOut


def build_pagination(page: int, limit: int, total: int) -> PaginationOut:
    pages = max(ceil(total / limit), 1) if limit else 1
    return PaginationOut(
        page=page,
        limit=limit,
        total=total,
        pages=pages,
        has_next=page < pages,
        has_prev=page > 1,
    )
