from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import require_permission
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.auth import MessageOut
from app.schemas.vehicle_tag import VehicleTagWrite, VehicleTagOut, VehicleTagApply, VehicleTagRemove, VehicleTagMarkOut
from app.services.vehicle_tag_service import VehicleTagService

router = APIRouter(tags=['VehicleTags'])


@router.get('/api/vehicle-tags', response_model=list[VehicleTagOut])
async def catalog(db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'edit'))):
    return await VehicleTagService(db).catalog(user)


@router.post('/api/vehicle-tags', response_model=VehicleTagOut, status_code=201)
async def create(data: VehicleTagWrite, db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'edit'))):
    return await VehicleTagService(db).save(data, user)


@router.patch('/api/vehicle-tags/{tag_id}', response_model=VehicleTagOut)
async def update(tag_id: UUID, data: VehicleTagWrite, db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'edit'))):
    return await VehicleTagService(db).save(data, user, tag_id)


@router.delete('/api/vehicle-tags/{tag_id}', response_model=MessageOut)
async def delete_definition(tag_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'edit'))):
    await VehicleTagService(db).delete_definition(tag_id, user)
    return {'message': 'Etiqueta excluída do seu catálogo. O histórico foi preservado.'}


@router.get('/api/vehicles/tag-options', response_model=list[VehicleTagOut])
async def options(db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'view'))):
    return await VehicleTagService(db).options(user)


@router.get('/api/vehicles/{vehicle_id}/tags', response_model=list[VehicleTagMarkOut])
async def marks(vehicle_id: UUID, db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'view'))):
    service = VehicleTagService(db)
    await service.visible(vehicle_id, user)
    return (await service.batch([vehicle_id], user)).get(vehicle_id, [])


@router.post('/api/vehicles/{vehicle_id}/tags', response_model=list[VehicleTagMarkOut])
async def apply(vehicle_id: UUID, data: VehicleTagApply, db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'edit'))):
    service = VehicleTagService(db)
    await service.apply(vehicle_id, data, user)
    return (await service.batch([vehicle_id], user)).get(vehicle_id, [])


@router.post('/api/vehicles/{vehicle_id}/tags/{assignment_id}/remove', response_model=list[VehicleTagMarkOut])
async def remove(vehicle_id: UUID, assignment_id: UUID, data: VehicleTagRemove, db: AsyncSession = Depends(get_db_session), user: User = Depends(require_permission('vehicles', 'edit'))):
    service = VehicleTagService(db)
    await service.remove(vehicle_id, assignment_id, data, user)
    return (await service.batch([vehicle_id], user)).get(vehicle_id, [])
