"""Administration is a capability; global visibility belongs only to SUPERUSER."""
from __future__ import annotations


def role_name(user) -> str:
    role = getattr(user, 'role', user)
    return str(getattr(role, 'value', role) or '')


def is_superuser(user) -> bool:
    return role_name(user) == 'SUPERUSER'


def is_administrator(user) -> bool:
    return role_name(user) in {'SUPERUSER', 'ADMIN'}


def is_operator(user) -> bool:
    return role_name(user) in {'SUPERUSER', 'ADMIN', 'PRODUCAO'}


def has_organization_scope(user) -> bool:
    return role_name(user) in {'ADMIN', 'PRODUCAO', 'PADRAO'}
