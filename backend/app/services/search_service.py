from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession
from app.core.organization_scope import production_scope_is_empty, scoped_organization_id
from app.models.user import User, UserRole
from app.repositories.search_repository import SearchRepository


class SearchService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.search_repo = SearchRepository(db)

    async def search(self, q: str, limit: int, current_user: User) -> list[dict]:
        term = q.strip()
        if not term:
            return []
        if production_scope_is_empty(current_user):
            return []

        search_term = f"%{term}%"
        per_group_limit = min(max(limit, 1), 20)
        organization_id = scoped_organization_id(current_user)

        vehicles = (
            await self.search_repo.search_vehicles(search_term, per_group_limit, organization_id=organization_id)
            if self._can_view(current_user, "vehicles")
            else []
        )
        possessions = (
            await self.search_repo.search_possessions(
                search_term,
                per_group_limit,
                organization_id=organization_id,
                include_personal_data=self._can_view_personal_data(current_user),
            )
            if self._can_view(current_user, "possession")
            else []
        )
        maintenances = (
            await self.search_repo.search_maintenances(search_term, per_group_limit, organization_id=organization_id)
            if self._can_view(current_user, "maintenance")
            else []
        )

        results = [
            *[self._serialize_vehicle(vehicle, department, possession) for vehicle, department, possession in vehicles],
            *[self._serialize_possession(record, current_user=current_user) for record in possessions],
            *[self._serialize_maintenance(record) for record in maintenances],
        ]

        deduped: list[dict] = []
        seen: set[tuple[str, str]] = set()
        for result in results:
            key = (result["type"], str(result["id"]))
            if key in seen:
                continue
            seen.add(key)
            deduped.append(result)

        deduped.sort(key=lambda item: self._sort_key(item, term))
        return deduped[:limit]

    def _serialize_vehicle(self, vehicle, department, possession) -> dict:
        driver_name = possession.driver_name if possession else None
        current_department = department.department if department else None
        return {
            "type": "vehicle",
            "id": vehicle.id,
            "title": vehicle.plate,
            "subtitle": f"{vehicle.brand} {vehicle.model} | {vehicle.ownership_type.value}",
            "status": vehicle.status.value,
            "route": f"/vehicles?focus={vehicle.id}",
            "context": {
                "chassis_number": vehicle.chassis_number,
                "department": current_department,
                "driver_name": driver_name,
                "status_label": vehicle.status.value,
            },
        }

    def _serialize_possession(self, record, *, current_user: User) -> dict:
        vehicle_plate = record.vehicle.plate if record.vehicle else ""
        can_view_personal_data = self._can_view_personal_data(current_user)
        return {
            "type": "possession",
            "id": record.id,
            "title": record.driver_name,
            "subtitle": f"Condutor de {vehicle_plate}" if vehicle_plate else "Condutor",
            "status": "ATIVA" if record.is_active else "ENCERRADA",
            "route": f"/posses?focus={record.id}",
            "context": {
                "vehicle_plate": vehicle_plate,
                "driver_document": record.driver_document if can_view_personal_data else self._mask_document(record.driver_document),
                "driver_contact": record.driver_contact if can_view_personal_data else None,
            },
        }

    def _serialize_maintenance(self, record) -> dict:
        vehicle_plate = record.vehicle.plate if record.vehicle else ""
        return {
            "type": "maintenance",
            "id": record.id,
            "title": vehicle_plate or "Manutenção",
            "subtitle": record.service_description,
            "status": "CONCLUÍDA" if record.end_date else "EM_ANDAMENTO",
            "route": f"/manutencoes?focus={record.id}",
            "context": {
                "vehicle_plate": vehicle_plate,
                "parts_replaced": record.parts_replaced,
                "total_cost": str(record.total_cost),
            },
        }

    def _sort_key(self, item: dict, term: str) -> tuple[int, int, str]:
        type_priority = {"vehicle": 0, "possession": 1, "maintenance": 2}
        score = self._score(item, term)
        return (-score, type_priority.get(item["type"], 99), item["title"].lower())

    def _score(self, item: dict, term: str) -> int:
        normalized = term.lower()
        title = item["title"].lower()
        subtitle = item["subtitle"].lower()
        context_values = " ".join(str(value).lower() for value in item.get("context", {}).values() if value)

        if title == normalized:
            return 100
        if title.startswith(normalized):
            return 90
        if normalized in title:
            return 75
        if subtitle.startswith(normalized):
            return 65
        if normalized in subtitle:
            return 55
        if normalized in context_values:
            return 40
        return 10

    def _can_view(self, current_user: User, module: str) -> bool:
        return bool(current_user.permissions.get(module, {}).get("can_view"))

    def _can_view_personal_data(self, current_user: User) -> bool:
        return current_user.role in {UserRole.ADMIN, UserRole.PRODUCAO}

    def _mask_document(self, value: str | None) -> str | None:
        if not value:
            return None
        digits = "".join(character for character in value if character.isdigit())
        if len(digits) <= 4:
            return "***"
        return f"{digits[:3]}.***.***-{digits[-2:]}"
