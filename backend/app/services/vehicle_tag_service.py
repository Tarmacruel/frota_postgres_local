from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException
from pydantic import BaseModel
from sqlalchemy import select, exists
from sqlalchemy.exc import IntegrityError
from app.core.organization_scope import scoped_organization_id, production_scope_is_empty
from app.core.vehicle_handoff import lock_vehicle_handoff
from app.models.user import UserRole
from app.models.vehicle import Vehicle
from app.models.vehicle_tag import VehicleTag, VehicleTagAssignment
from app.repositories.vehicle_scope import vehicle_visible
from app.services.audit_service import AuditService
from app.services.operational_scope import ensure_registration_manager


class VehicleTagService:
    def __init__(self, db):
        self.db = db

    @staticmethod
    def _editor(user):
        if user.role not in (UserRole.SUPERUSER, UserRole.ADMIN) and not getattr(user, 'permissions', {}).get('vehicles', {}).get('can_edit'):
            raise HTTPException(403, 'Você não tem permissão para gerenciar etiquetas de veículos.')

    def _scope(self, statement, user, vehicle_id=Vehicle.id):
        if production_scope_is_empty(user):
            return statement.where(False)
        org = scoped_organization_id(user)
        return statement.where(vehicle_visible(vehicle_id, org)) if org else statement

    async def catalog(self, user):
        self._editor(user)
        return list((await self.db.scalars(select(VehicleTag).where(VehicleTag.owner_user_id == user.id, VehicleTag.deleted_at.is_(None))
                                          .order_by(VehicleTag.is_active.desc(), VehicleTag.name))).all())

    async def save(self, data, user, tag_id=None):
        self._editor(user)
        try:
            if tag_id:
                tag = await self.db.scalar(select(VehicleTag).where(VehicleTag.id == tag_id,
                    VehicleTag.owner_user_id == user.id, VehicleTag.deleted_at.is_(None)).with_for_update())
                if not tag:
                    raise HTTPException(404, 'Etiqueta não encontrada no seu catálogo.')
                before = {'name': tag.name, 'color': tag.color, 'is_active': tag.is_active}
            else:
                tag = VehicleTag(owner_user_id=user.id, owner_name=user.name)
                self.db.add(tag)
                before = None
            tag.name = data.name
            tag.normalized_name = data.name.casefold()
            tag.color = data.color
            tag.is_active = data.is_active
            tag.updated_at = datetime.now(timezone.utc)
            await self.db.flush()
            await AuditService(self.db).record(actor=user, action='TAG_UPDATE' if tag_id else 'TAG_CREATE',
                entity_type='VEHICLE_TAG', entity_id=tag.id, entity_label=tag.name,
                details={'before': before, 'after': data.model_dump()})
            await self.db.commit()
            return tag
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(409, 'Já existe uma etiqueta com esse nome no seu catálogo, inclusive entre as arquivadas.') from exc
        except Exception:
            await self.db.rollback()
            raise

    async def delete_definition(self, tag_id, user):
        self._editor(user)
        try:
            # Application takes this same tag lock after its vehicle lock.
            # Never lock vehicles here: that would reverse the shared order.
            tag = await self.db.scalar(select(VehicleTag).where(
                VehicleTag.id == tag_id, VehicleTag.owner_user_id == user.id).with_for_update())
            if not tag:
                raise HTTPException(404, 'Etiqueta não encontrada no seu catálogo.')
            if tag.deleted_at is not None:
                await self.db.commit()
                return
            in_use = await self.db.scalar(select(exists().where(
                VehicleTagAssignment.tag_id == tag_id, VehicleTagAssignment.removed_at.is_(None))))
            if in_use:
                raise HTTPException(409, 'A etiqueta ainda está aplicada a um ou mais veículos. Retire as marcações em Gerenciar etiquetas antes de excluir. Se não tiver mais acesso ao veículo, solicite apoio à administração.')
            before = {'name': tag.name, 'color': tag.color, 'is_active': tag.is_active}
            tag.deleted_at = datetime.now(timezone.utc)
            tag.updated_at = tag.deleted_at
            tag.is_active = False
            await self.db.flush()
            await AuditService(self.db).record(actor=user, action='TAG_DELETE',
                entity_type='VEHICLE_TAG', entity_id=tag.id, entity_label=tag.name,
                details={'before': before, 'after': {'deleted': True}, 'history_preserved': True})
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def batch(self, ids, user):
        ids = {UUID(str(value)) for value in ids if value}
        if not ids or production_scope_is_empty(user):
            return {}
        statement = select(VehicleTagAssignment, VehicleTag).join(VehicleTag, VehicleTag.id == VehicleTagAssignment.tag_id)
        statement = statement.where(VehicleTagAssignment.vehicle_id.in_(ids), VehicleTagAssignment.removed_at.is_(None), VehicleTag.deleted_at.is_(None))
        statement = self._scope(statement, user, VehicleTagAssignment.vehicle_id)
        rows = (await self.db.execute(statement.order_by(VehicleTagAssignment.applied_at, VehicleTagAssignment.id))).all()
        result = {}
        for mark, tag in rows:
            result.setdefault(mark.vehicle_id, []).append({
                'id': mark.id, 'tag_id': tag.id, 'name': tag.name, 'color': tag.color,
                'owner_user_id': tag.owner_user_id, 'owner_name': tag.owner_name,
                'applied_by_user_id': mark.applied_by_user_id, 'applied_by_name': mark.applied_by_name,
                'applied_at': mark.applied_at, 'note': mark.note,
            })
        return result

    async def options(self, user):
        statement = select(VehicleTag).where(VehicleTag.deleted_at.is_(None), exists(select(VehicleTagAssignment.id).where(
            VehicleTagAssignment.tag_id == VehicleTag.id, VehicleTagAssignment.removed_at.is_(None),
            self._scope(select(Vehicle.id).where(Vehicle.id == VehicleTagAssignment.vehicle_id), user).exists())))
        return list((await self.db.scalars(statement.order_by(VehicleTag.name, VehicleTag.owner_name))).all())

    async def visible(self, vehicle_id, user):
        found = await self.db.scalar(self._scope(select(Vehicle.id).where(Vehicle.id == vehicle_id), user))
        if not found:
            raise HTTPException(404, 'Veículo não encontrado.')

    async def _writable(self, vehicle_id, user):
        self._editor(user)
        await self.visible(vehicle_id, user)
        await lock_vehicle_handoff(self.db, vehicle_id)
        await ensure_registration_manager(self.db, vehicle_id, user)

    async def apply(self, vehicle_id, data, user):
        try:
            await self._writable(vehicle_id, user)
            tag = await self.db.scalar(select(VehicleTag).where(VehicleTag.id == data.tag_id,
                VehicleTag.owner_user_id == user.id, VehicleTag.deleted_at.is_(None)).with_for_update())
            if not tag or not tag.is_active:
                raise HTTPException(409, 'Escolha uma etiqueta ativa do seu catálogo.')
            mark = await self.db.scalar(select(VehicleTagAssignment).where(
                VehicleTagAssignment.vehicle_id == vehicle_id, VehicleTagAssignment.tag_id == tag.id,
                VehicleTagAssignment.removed_at.is_(None)))
            if mark:
                await self.db.commit()
                return
            mark = VehicleTagAssignment(vehicle_id=vehicle_id, tag_id=tag.id,
                applied_by_user_id=user.id, applied_by_name=user.name, note=(data.note or '').strip() or None)
            self.db.add(mark)
            await self.db.flush()
            await self._audit(user, vehicle_id, 'TAG_APPLY', tag, mark)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def remove(self, vehicle_id, assignment_id, data, user):
        try:
            await self._writable(vehicle_id, user)
            mark = await self.db.scalar(select(VehicleTagAssignment).where(
                VehicleTagAssignment.id == assignment_id, VehicleTagAssignment.vehicle_id == vehicle_id).with_for_update())
            if not mark:
                raise HTTPException(404, 'Marcação não encontrada.')
            if mark.applied_by_user_id != user.id and user.role not in (UserRole.SUPERUSER, UserRole.ADMIN):
                raise HTTPException(403, 'Somente o autor ou um administrador pode retirar esta etiqueta.')
            reason = (data.reason or '').strip() or None
            if mark.applied_by_user_id != user.id and not reason:
                raise HTTPException(400, 'Informe o motivo para retirar uma etiqueta de outro usuário.')
            if mark.removed_at is None:
                tag = await self.db.get(VehicleTag, mark.tag_id)
                mark.removed_at = datetime.now(timezone.utc)
                mark.removed_by_user_id = user.id
                mark.removal_reason = reason
                await self._audit(user, vehicle_id, 'TAG_REMOVE', tag, mark, reason)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    async def _audit(self, user, vehicle_id, action, tag, mark, reason=None):
        plate = await self.db.scalar(select(Vehicle.plate).where(Vehicle.id == vehicle_id))
        await AuditService(self.db).record(actor=user, action=action, entity_type='VEHICLE',
            entity_id=vehicle_id, entity_label=plate,
            details={'reason': reason or mark.note, 'tag_name': tag.name, 'tag_color': tag.color,
                'tag_owner': tag.owner_name, 'assignment_id': str(mark.id), 'note': mark.note,
                'before': {'etiqueta': tag.name} if action == 'TAG_REMOVE' else None,
                'after': {'etiqueta': tag.name} if action == 'TAG_APPLY' else None})


async def with_vehicle_tags(db, result, user, vehicle_key='id'):
    """Decorate a complete response with one scoped batch; signed payloads stay untouched."""
    if isinstance(result, BaseModel):
        result = result.model_dump()
    rows = result.get('data', []) if isinstance(result, dict) else result
    tags = await VehicleTagService(db).batch([row.get(vehicle_key) for row in rows], user)
    for row in rows:
        row['tags' if vehicle_key == 'id' else 'vehicle_tags'] = tags.get(UUID(str(row[vehicle_key])), []) if row.get(vehicle_key) else []
    return result
