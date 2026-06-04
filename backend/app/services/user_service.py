from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.permissions import PERMISSION_MODULES, blank_permissions, default_permissions_for_role
from app.core.security import get_password_hash
from app.models.user import User
from app.models.user_permission import UserPermission
from app.repositories.master_data_repository import MasterDataRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserPermissionsUpdate, UserUpdate
from app.services.audit_service import AuditService


class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.users = UserRepository(db)
        self.master_data = MasterDataRepository(db)
        self.audit = AuditService(db)

    async def list(self, skip: int, limit: int):
        return await self.users.list(skip=skip, limit=limit)

    async def create(self, data: UserCreate, current_user: User) -> User:
        existing = await self.users.get_by_email(data.email.lower())
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

        organization = await self._require_organization(data.organization_id)
        user = User(
            name=data.name.strip(),
            email=data.email.lower(),
            organization_id=organization.id,
            organization=organization,
            password_hash=get_password_hash(data.password),
            must_change_password=True,
            role=data.role,
        )

        try:
            await self.users.create(user)
            self._add_default_permissions(user)
            await self.audit.record(
                actor=current_user,
                action="CREATE",
                entity_type="USER",
                entity_id=user.id,
                entity_label=user.email,
                details={
                    "name": user.name,
                    "email": user.email,
                    "organization_id": str(user.organization_id) if user.organization_id else None,
                    "organization_name": user.organization_name,
                    "role": user.role.value,
                    "must_change_password": user.must_change_password,
                },
            )
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível criar o usuário") from exc

        created = await self.users.get_by_id(user.id)
        return created or user

    async def update(self, user_id: UUID, data: UserUpdate, current_user: User) -> User:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

        payload = data.model_dump(exclude_unset=True)
        previous_values = {
            "name": user.name,
            "email": user.email,
            "organization_id": str(user.organization_id) if user.organization_id else None,
            "organization_name": user.organization_name,
            "role": user.role.value,
        }

        if payload.get("email") and payload["email"].lower() != user.email:
            existing = await self.users.get_by_email(payload["email"].lower())
            if existing and existing.id != user.id:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

        if payload.get("name") is not None:
            user.name = payload["name"].strip()
        if payload.get("email") is not None:
            user.email = payload["email"].lower()
        next_role = payload.get("role")
        role_changed = next_role is not None and next_role != user.role
        if next_role is not None:
            user.role = next_role
        if "organization_id" in payload:
            organization = await self._require_organization(payload["organization_id"]) if payload["organization_id"] else None
            user.organization_id = organization.id if organization else None
            user.organization = organization
        if payload.get("password"):
            user.password_hash = get_password_hash(payload["password"])
            user.must_change_password = True

        try:
            if role_changed:
                await self._set_default_permissions_for_role(user)

            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="USER",
                entity_id=user.id,
                entity_label=user.email,
                details={
                    "before": previous_values,
                    "after": {
                        "name": user.name,
                        "email": user.email,
                        "organization_id": str(user.organization_id) if user.organization_id else None,
                        "organization_name": user.organization_name,
                        "role": user.role.value,
                        "must_change_password": user.must_change_password,
                        "password_changed": bool(payload.get("password")),
                        "permissions_reset_to_role_defaults": role_changed,
                    },
                },
            )
            await self.db.flush()
            await self.db.refresh(user)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível atualizar o usuário") from exc

        updated = await self.users.get_by_id(user.id)
        return updated or user

    async def get_permissions(self, user_id: UUID) -> dict[str, dict[str, bool]]:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
        return self._complete_permissions(user.permissions)

    async def update_permissions(
        self,
        user_id: UUID,
        data: UserPermissionsUpdate,
        current_user: User,
    ) -> dict[str, dict[str, bool]]:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

        previous_permissions = self._complete_permissions(user.permissions)
        next_permissions = self._normalize_permissions(data.permissions)

        try:
            result = await self.db.execute(select(UserPermission).where(UserPermission.user_id == user.id))
            entries_by_module = {entry.module: entry for entry in result.scalars().all()}
            for module, flags in next_permissions.items():
                entry = entries_by_module.get(module)
                if not entry:
                    entry = UserPermission(user_id=user.id, module=module)
                    self.db.add(entry)
                entry.can_view = flags["can_view"]
                entry.can_create = flags["can_create"]
                entry.can_edit = flags["can_edit"]
                entry.can_delete = flags["can_delete"]
                entry.updated_at = datetime.now(timezone.utc)

            await self.audit.record(
                actor=current_user,
                action="UPDATE",
                entity_type="USER_PERMISSIONS",
                entity_id=user.id,
                entity_label=user.email,
                details={"before": previous_permissions, "after": next_permissions},
            )
            await self.db.flush()
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Não foi possível atualizar as permissões do usuário",
            ) from exc

        updated = await self.users.get_by_id(user.id)
        return self._complete_permissions(updated.permissions if updated else next_permissions)

    async def delete(self, user_id: UUID, current_user: User) -> None:
        user = await self.users.get_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
        if user.id == current_user.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não é permitido excluir o próprio usuário")

        try:
            await self.audit.record(
                actor=current_user,
                action="DELETE",
                entity_type="USER",
                entity_id=user.id,
                entity_label=user.email,
                details={
                    "name": user.name,
                    "organization_id": str(user.organization_id) if user.organization_id else None,
                    "organization_name": user.organization_name,
                    "role": user.role.value,
                },
            )
            await self.users.delete(user)
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Não foi possível remover o usuário") from exc

    async def _require_organization(self, organization_id: UUID):
        organization = await self.master_data.get_organization(organization_id)
        if not organization:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Secretaria não encontrada")
        return organization

    def _add_default_permissions(self, user: User) -> None:
        for module, flags in default_permissions_for_role(user.role.value).items():
            self.db.add(UserPermission(user_id=user.id, module=module, **flags))

    async def _set_default_permissions_for_role(self, user: User) -> None:
        result = await self.db.execute(select(UserPermission).where(UserPermission.user_id == user.id))
        entries_by_module = {entry.module: entry for entry in result.scalars().all()}
        now = datetime.now(timezone.utc)

        for module, flags in default_permissions_for_role(user.role.value).items():
            entry = entries_by_module.get(module)
            if not entry:
                entry = UserPermission(user_id=user.id, module=module)
                self.db.add(entry)
            entry.can_view = flags["can_view"]
            entry.can_create = flags["can_create"]
            entry.can_edit = flags["can_edit"]
            entry.can_delete = flags["can_delete"]
            entry.updated_at = now

    def _complete_permissions(self, permissions: dict[str, dict[str, bool]]) -> dict[str, dict[str, bool]]:
        return self._normalize_permissions(permissions)

    def _normalize_permissions(self, permissions: dict[str, object]) -> dict[str, dict[str, bool]]:
        unknown_modules = sorted(set(permissions.keys()) - set(PERMISSION_MODULES))
        if unknown_modules:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Módulos de permissão desconhecidos: {', '.join(unknown_modules)}",
            )

        normalized = blank_permissions()
        for module, flags in permissions.items():
            flag_values = flags.model_dump() if hasattr(flags, "model_dump") else dict(flags)
            normalized[module] = {
                "can_view": bool(flag_values.get("can_view", False)),
                "can_create": bool(flag_values.get("can_create", False)),
                "can_edit": bool(flag_values.get("can_edit", False)),
                "can_delete": bool(flag_values.get("can_delete", False)),
            }
        return normalized
