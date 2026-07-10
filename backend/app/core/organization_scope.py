from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status

from app.models.user import User, UserRole


def is_production_user(current_user: User | None) -> bool:
    return bool(current_user and getattr(current_user, "role", None) == UserRole.PRODUCAO)


def production_scope_is_empty(current_user: User | None) -> bool:
    return is_production_user(current_user) and current_user.organization_id is None


def scoped_organization_id(current_user: User | None, requested_organization_id: UUID | None = None) -> UUID | None:
    if is_production_user(current_user):
        return getattr(current_user, "organization_id", None)
    return requested_organization_id


def ensure_organization_access(current_user: User | None, organization_id: UUID | None) -> None:
    if not is_production_user(current_user):
        return
    current_organization_id = getattr(current_user, "organization_id", None)
    if current_organization_id is None or organization_id != current_organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")
