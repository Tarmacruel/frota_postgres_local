from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4
import pytest
import pytest_asyncio
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import event, select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy.schema import CreateTable, CreateIndex
from app.models.possession import VehiclePossession
from app.models.vehicle import Vehicle, VehicleStatus
from app.models.vehicle_tag import VehicleTag, VehicleTagAssignment
from app.models.master_data import Organization, Department, Allocation
from app.models.location_history import LocationHistory
from app.models.user import UserRole
from app.repositories.vehicle_repository import VehicleRepository
from app.schemas.vehicle_tag import VehicleTagWrite, VehicleTagApply, VehicleTagRemove
from app.services.vehicle_tag_service import VehicleTagService, with_vehicle_tags


def actor(name='Ana', role=UserRole.ADMIN, org=None, edit=True):
    return SimpleNamespace(id=uuid4(), name=name, role=role, organization_id=org,
                           permissions={'vehicles': {'can_edit': edit}})


@pytest_asyncio.fixture
async def data(monkeypatch):
    engine = create_async_engine('sqlite+aiosqlite:///:memory:')
    @event.listens_for(engine.sync_engine, 'connect')
    def functions(dbapi, _):
        dbapi.create_function('NOW', 0, lambda: datetime.now(timezone.utc).isoformat())
        dbapi.create_function('gen_random_uuid', 0, lambda: uuid4().hex)
    tables = [Organization.__table__, Department.__table__, Allocation.__table__, Vehicle.__table__, LocationHistory.__table__, VehiclePossession.__table__, VehicleTag.__table__, VehicleTagAssignment.__table__]
    async with engine.begin() as connection:
        for table in tables:
            ddl = str(CreateTable(table).compile(dialect=connection.dialect))
            ddl = ddl.replace('DEFAULT gen_random_uuid()', 'DEFAULT (gen_random_uuid())').replace('DEFAULT NOW()', 'DEFAULT (NOW())')
            ddl = ddl.replace("nextval('vehicle_possession_public_number_seq'::regclass)", '0')
            await connection.exec_driver_sql(ddl)
            for index in table.indexes:
                await connection.exec_driver_sql(str(CreateIndex(index).compile(dialect=connection.dialect)))
    audit = AsyncMock()
    monkeypatch.setattr('app.services.vehicle_tag_service.AuditService.record', audit)
    # Registration management is tested through its existing dedicated tests;
    # these tests exercise tag ownership and real SQL, including the read scope.
    monkeypatch.setattr('app.services.vehicle_tag_service.ensure_registration_manager', AsyncMock())
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as db:
        v = Vehicle(id=uuid4(), plate='TST0T01', brand='TESTE', model='ETIQUETAS')
        db.add(v); await db.commit()
        yield db, VehicleTagService(db), v, actor(), actor('Carlos'), audit
    await engine.dispose()


async def tag(service, user, name='Em lavagem', color='blue'):
    return await service.save(VehicleTagWrite(name=name, color=color), user)


@pytest.mark.asyncio
async def test_personal_catalog_names_are_normalized_and_isolated(data):
    db, service, vehicle, ana, carlos, audit = data
    a = await tag(service, ana, ' Em   lavagem ')
    b = await tag(service, carlos)
    a_id = a.id
    assert a.id != b.id and a.name == 'Em lavagem'
    assert [t.id for t in await service.catalog(ana)] == [a.id]
    with pytest.raises(HTTPException) as error:
        await tag(service, ana, 'EM LAVAGEM')
    assert error.value.status_code == 409
    with pytest.raises(HTTPException) as error:
        await service.save(VehicleTagWrite(name='Outro'), carlos, a_id)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_shared_markers_keep_authors_and_vehicle_state_and_deduplicate(data):
    db, service, v, ana, carlos, audit = data
    vehicle_id, before = v.id, (v.status, v.updated_at)
    a, b = await tag(service, ana), await tag(service, carlos, 'Aguardando peça', 'amber')
    await service.apply(vehicle_id, VehicleTagApply(tag_id=a.id, note='Conferir cabine'), ana)
    await service.apply(vehicle_id, VehicleTagApply(tag_id=a.id), ana)
    await service.apply(vehicle_id, VehicleTagApply(tag_id=b.id), carlos)
    tags = (await service.batch([vehicle_id], ana))[vehicle_id]
    assert len(tags) == 2 and {t['owner_name'] for t in tags} == {'Ana', 'Carlos'}
    assert next(t for t in tags if t['owner_name'] == 'Ana')['note'] == 'Conferir cabine'
    await db.refresh(v)
    assert before == (v.status, v.updated_at)
    assert sum(call.kwargs['action'] == 'TAG_APPLY' for call in audit.await_args_list) == 2


@pytest.mark.asyncio
async def test_cannot_apply_other_users_tag_or_edit_without_permission(data):
    db, service, v, ana, carlos, _ = data
    vehicle_id = v.id
    a = await tag(service, ana)
    with pytest.raises(HTTPException) as error:
        await service.apply(vehicle_id, VehicleTagApply(tag_id=a.id), carlos)
    assert error.value.status_code == 409
    readonly = actor(role=UserRole.PADRAO, edit=False)
    with pytest.raises(HTTPException) as error:
        await service.catalog(readonly)
    assert error.value.status_code == 403


@pytest.mark.asyncio
async def test_remove_is_author_only_and_admin_requires_reason(data):
    db, service, v, ana, carlos, audit = data
    vehicle_id = v.id
    a = await tag(service, ana)
    await service.apply(vehicle_id, VehicleTagApply(tag_id=a.id), ana)
    mark_id = (await service.batch([vehicle_id], ana))[vehicle_id][0]['id']
    carlos.role = UserRole.PADRAO
    with pytest.raises(HTTPException) as error:
        await service.remove(vehicle_id, mark_id, VehicleTagRemove(), carlos)
    assert error.value.status_code == 403
    carlos.role = UserRole.ADMIN
    with pytest.raises(HTTPException) as error:
        await service.remove(vehicle_id, mark_id, VehicleTagRemove(), carlos)
    assert error.value.status_code == 400
    await service.remove(vehicle_id, mark_id, VehicleTagRemove(reason='Lavagem concluída'), carlos)
    await service.remove(vehicle_id, mark_id, VehicleTagRemove(reason='Lavagem concluída'), carlos)
    assert await service.batch([vehicle_id], ana) == {}
    assert await db.scalar(select(func.count()).select_from(VehicleTagAssignment)) == 1
    assert sum(call.kwargs['action'] == 'TAG_REMOVE' for call in audit.await_args_list) == 1


@pytest.mark.asyncio
async def test_archiving_keeps_marks_rename_is_shared_reapply_keeps_history(data):
    db, service, v, ana, _, _ = data
    vehicle_id = v.id
    a = await tag(service, ana); tag_id = a.id
    await service.apply(vehicle_id, VehicleTagApply(tag_id=tag_id), ana)
    await service.save(VehicleTagWrite(name='Em limpeza', color='green', is_active=False), ana, tag_id)
    marks = (await service.batch([vehicle_id], ana))[vehicle_id]
    assert marks[0]['name'] == 'Em limpeza' and marks[0]['color'] == 'green'
    with pytest.raises(HTTPException):
        await service.apply(vehicle_id, VehicleTagApply(tag_id=tag_id), ana)
    await service.remove(vehicle_id, marks[0]['id'], VehicleTagRemove(), ana)
    await service.save(VehicleTagWrite(name='Em limpeza', color='green'), ana, tag_id)
    await service.apply(vehicle_id, VehicleTagApply(tag_id=tag_id), ana)
    assert await db.scalar(select(func.count()).select_from(VehicleTagAssignment)) == 2


@pytest.mark.asyncio
async def test_scope_hides_current_tags_from_historical_vehicle_readers(data):
    db, service, v, ana, _, _ = data
    a = await tag(service, ana)
    await service.apply(v.id, VehicleTagApply(tag_id=a.id), ana)
    other_org = actor(role=UserRole.PRODUCAO, org=uuid4())
    assert await service.batch([v.id], other_org) == {}
    assert await service.options(other_org) == []
    payload = await with_vehicle_tags(db, [{'vehicle_id': str(v.id)}], other_org, 'vehicle_id')
    assert payload[0]['vehicle_tags'] == []
    with pytest.raises(HTTPException) as error:
        await service.visible(v.id, other_org)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_filter_or_semantics_does_not_duplicate_vehicle_pagination(data):
    db, service, v, ana, carlos, _ = data
    a, b = await tag(service, ana), await tag(service, carlos, 'Em manutenção', 'amber')
    await service.apply(v.id, VehicleTagApply(tag_id=a.id), ana)
    await service.apply(v.id, VehicleTagApply(tag_id=b.id), carlos)
    rows, total, summary = await VehicleRepository(db).list_paginated(page=1, limit=1, tag_ids=[a.id,b.id], with_summary=True)
    assert len(rows) == total == summary['total'] == 1
    rows, total = await VehicleRepository(db).list_paginated(page=2, limit=1, tag_ids=[a.id,b.id])
    assert rows == [] and total == 1
    assert {t.id for t in await service.options(ana)} == {a.id,b.id}


@pytest.mark.asyncio
async def test_audit_failure_rolls_back_application(data):
    db, service, v, ana, _, audit = data
    vehicle_id = v.id
    a = await tag(service, ana)
    audit.side_effect = RuntimeError('audit unavailable')
    with pytest.raises(RuntimeError):
        await service.apply(vehicle_id, VehicleTagApply(tag_id=a.id), ana)
    assert await service.batch([vehicle_id], ana) == {}


def test_schema_rejects_status_injection_and_invalid_fields():
    for payload in [{'name':' '}, {'name':'x','color':'invalid'}, {'name':'x','status':'INATIVO'}]:
        with pytest.raises(ValidationError):
            VehicleTagWrite(**payload)


@pytest.mark.asyncio
@pytest.mark.parametrize('color', ['blue','amber','red','green','purple','neutral','orange','teal','pink','cyan','indigo','brown'])
async def test_twelve_colors_round_trip_through_catalog_and_shared_marks(data, color):
    db, service, vehicle, ana, _, audit = data
    vehicle_id = vehicle.id
    before = (vehicle.status, vehicle.updated_at)
    created = await service.save(VehicleTagWrite(name='Teste da paleta', color=color), ana)
    tag_id = created.id
    await service.apply(vehicle_id, VehicleTagApply(tag_id=tag_id), ana)
    assert (await service.catalog(ana))[0].color == color
    assert (await service.batch([vehicle_id], ana))[vehicle_id][0]['color'] == color
    changed = 'blue' if color == 'brown' else 'brown'
    await service.save(VehicleTagWrite(name='Teste da paleta', color=changed), ana, tag_id)
    assert (await service.batch([vehicle_id], ana))[vehicle_id][0]['color'] == changed
    await db.refresh(vehicle)
    assert (vehicle.status, vehicle.updated_at) == before
    applied = next(call for call in audit.await_args_list if call.kwargs['action'] == 'TAG_CREATE')
    assert applied.kwargs['details']['after']['color'] == color


@pytest.mark.asyncio
async def test_delete_is_personal_audited_idempotent_and_releases_name(data):
    db, service, _, ana, _, audit = data
    created = await tag(service, ana)
    tag_id = created.id
    await service.delete_definition(tag_id, ana)
    await service.delete_definition(tag_id, ana)
    assert await service.catalog(ana) == []
    stored = await db.get(VehicleTag, tag_id)
    assert stored.deleted_at is not None and not stored.is_active
    assert sum(call.kwargs['action'] == 'TAG_DELETE' for call in audit.await_args_list) == 1
    replacement = await tag(service, ana, 'EM LAVAGEM')
    assert replacement.id != tag_id


@pytest.mark.asyncio
async def test_cannot_delete_an_active_mark_even_when_archived_or_outside_current_scope(data):
    db, service, vehicle, ana, _, _ = data
    created = await tag(service, ana)
    tag_id, vehicle_id = created.id, vehicle.id
    await service.apply(vehicle_id, VehicleTagApply(tag_id=tag_id), ana)
    await service.save(VehicleTagWrite(name='Em lavagem', is_active=False), ana, tag_id)
    ana.role = UserRole.PRODUCAO
    ana.organization_id = uuid4()
    with pytest.raises(HTTPException) as error:
        await service.delete_definition(tag_id, ana)
    assert error.value.status_code == 409
    assert 'Gerenciar etiquetas' in error.value.detail
    assert await db.scalar(select(func.count()).select_from(VehicleTagAssignment).where(VehicleTagAssignment.removed_at.is_(None))) == 1
    assert (await db.get(VehicleTag, tag_id)).deleted_at is None


@pytest.mark.asyncio
async def test_delete_after_withdrawal_preserves_links_and_prevents_edit_or_application(data):
    db, service, vehicle, ana, _, _ = data
    created = await tag(service, ana)
    tag_id, vehicle_id = created.id, vehicle.id
    await service.apply(vehicle_id, VehicleTagApply(tag_id=tag_id), ana)
    mark_id = (await service.batch([vehicle_id], ana))[vehicle_id][0]['id']
    await service.remove(vehicle_id, mark_id, VehicleTagRemove(), ana)
    await service.delete_definition(tag_id, ana)
    historic = await db.get(VehicleTagAssignment, mark_id)
    assert historic.tag_id == tag_id and historic.removed_at is not None
    assert await service.options(ana) == []
    with pytest.raises(HTTPException) as error:
        await service.save(VehicleTagWrite(name='Retorno'), ana, tag_id)
    assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        await service.apply(vehicle_id, VehicleTagApply(tag_id=tag_id), ana)
    assert error.value.status_code == 409


@pytest.mark.asyncio
async def test_delete_denies_other_owner_admin_and_readonly(data):
    _, service, _, ana, other_admin, _ = data
    created = await tag(service, ana)
    tag_id = created.id
    with pytest.raises(HTTPException) as error:
        await service.delete_definition(tag_id, other_admin)
    assert error.value.status_code == 404
    with pytest.raises(HTTPException) as error:
        await service.delete_definition(tag_id, actor(role=UserRole.PADRAO, edit=False))
    assert error.value.status_code == 403
    assert len(await service.catalog(ana)) == 1


@pytest.mark.asyncio
async def test_delete_rolls_back_if_audit_fails(data):
    db, service, _, ana, _, audit = data
    created = await tag(service, ana)
    tag_id = created.id
    audit.side_effect = RuntimeError('audit unavailable')
    with pytest.raises(RuntimeError):
        await service.delete_definition(tag_id, ana)
    stored = await db.get(VehicleTag, tag_id)
    assert stored.deleted_at is None and stored.is_active
    assert len(await service.catalog(ana)) == 1
