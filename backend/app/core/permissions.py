from __future__ import annotations


PERMISSION_ACTIONS = ("view", "create", "edit", "delete")

PERMISSION_MODULES = (
    "vehicles",
    "vehicle_loans",
    "possession",
    "drivers",
    "maintenance",
    "claims",
    "fines",
    "master_data",
    "fuel_supplies",
    "fuel_supply_orders",
    "fuel_stations",
    "payment_processes",
    "analytics",
    "data_imports",
)

POSSESSION_ROLE_CEILINGS = {
    "ADMIN": {"can_view": True, "can_create": True, "can_edit": True, "can_delete": False},
    "PRODUCAO": {"can_view": True, "can_create": True, "can_edit": True, "can_delete": False},
    "PADRAO": {"can_view": True, "can_create": False, "can_edit": False, "can_delete": False},
    "POSTO": {"can_view": False, "can_create": False, "can_edit": False, "can_delete": False},
}


def blank_permissions() -> dict[str, dict[str, bool]]:
    return {
        module: {
            "can_view": False,
            "can_create": False,
            "can_edit": False,
            "can_delete": False,
        }
        for module in PERMISSION_MODULES
    }


def default_permissions_for_role(role: str) -> dict[str, dict[str, bool]]:
    permissions = blank_permissions()

    if role == "SUPERUSER":
        return {module: {f"can_{action}": True for action in PERMISSION_ACTIONS} for module in permissions}

    if role == "ADMIN":
        for module in permissions:
            permissions[module] = {
                "can_view": True,
                "can_create": True,
                "can_edit": True,
                "can_delete": True,
            }
        permissions["possession"] = POSSESSION_ROLE_CEILINGS[role].copy()
        permissions["vehicle_loans"]["can_delete"] = False
        return permissions

    if role == "PRODUCAO":
        for module in (
            "vehicles",
            "vehicle_loans",
            "possession",
            "drivers",
            "maintenance",
            "claims",
            "fines",
            "master_data",
            "fuel_supplies",
            "fuel_supply_orders",
            "payment_processes",
            "data_imports",
        ):
            permissions[module].update(can_view=True, can_create=True, can_edit=True)
        permissions["fuel_stations"]["can_view"] = True
        return permissions

    if role == "POSTO":
        permissions["fuel_supply_orders"].update(can_view=True, can_edit=True)
        return permissions

    if role == "PADRAO":
        permissions["possession"] = POSSESSION_ROLE_CEILINGS[role].copy()
        return permissions

    return permissions


def apply_role_permission_ceiling(
    role: str,
    module: str,
    flags: dict[str, bool],
) -> dict[str, bool]:
    if role == "SUPERUSER":
        return {f"can_{action}": True for action in PERMISSION_ACTIONS}
    if role == 'POSTO':
        return {f'can_{action}': bool(module == 'fuel_supply_orders' and action in {'view', 'edit'} and flags.get(f'can_{action}'))
                for action in PERMISSION_ACTIONS}
    if role == "ADMIN" and module in {"analytics", "payment_processes"}:
        return {**flags, "can_view": True}
    if module == "vehicle_loans":
        allowed = role in {"ADMIN", "PRODUCAO"}
        return {key: bool(value and allowed and key != "can_delete") for key, value in flags.items()}
    if module != "possession":
        return flags.copy()

    ceiling = POSSESSION_ROLE_CEILINGS.get(role, blank_permissions()["possession"])
    return {key: bool(flags.get(key, False) and ceiling[key]) for key in ceiling}


def action_to_column(action: str) -> str:
    if action not in PERMISSION_ACTIONS:
        raise ValueError(f"Ação de permissão desconhecida: {action}")
    return f"can_{action}"
