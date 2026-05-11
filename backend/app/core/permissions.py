from __future__ import annotations


PERMISSION_ACTIONS = ("view", "create", "edit", "delete")

PERMISSION_MODULES = (
    "vehicles",
    "possession",
    "drivers",
    "maintenance",
    "claims",
    "fines",
    "master_data",
    "fuel_supplies",
    "fuel_supply_orders",
    "fuel_stations",
    "analytics",
)


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

    if role == "ADMIN":
        for module in permissions:
            permissions[module] = {
                "can_view": True,
                "can_create": True,
                "can_edit": True,
                "can_delete": True,
            }
        return permissions

    if role == "PRODUCAO":
        for module in (
            "vehicles",
            "possession",
            "drivers",
            "maintenance",
            "claims",
            "fines",
            "master_data",
            "fuel_supplies",
            "fuel_supply_orders",
        ):
            permissions[module].update(can_view=True, can_create=True, can_edit=True)
        permissions["fuel_stations"]["can_view"] = True
        return permissions

    if role == "POSTO":
        permissions["fuel_supply_orders"].update(can_view=True, can_edit=True)
        return permissions

    return permissions


def action_to_column(action: str) -> str:
    if action not in PERMISSION_ACTIONS:
        raise ValueError(f"Acao de permissao desconhecida: {action}")
    return f"can_{action}"

