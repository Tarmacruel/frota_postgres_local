"""Phase 03: exercise real scoped queries and writes across delivery/return."""
from datetime import datetime, timezone
from uuid import UUID
import os
import psycopg
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.security import create_access_token
from test_vehicle_loan_api import api, workflow_database

pytestmark = [pytest.mark.asyncio, pytest.mark.skipif(os.environ.get('LOAN_MIGRATION_TESTS') != '1', reason='Isolated PostgreSQL required')]


async def request(api, actor, method, path, body=None):
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://localhost:8000',
        cookies={'access_token': create_access_token(api.actors[actor], 'PRODUCAO'), 'csrf_token': 'ops'},
        headers={'Origin': 'http://localhost:8000', 'X-CSRF-Token': 'ops'}) as client:
        return await client.request(method, path, json=body)


async def maintenance(api, actor, **extra):
    response = await request(api, actor, 'POST', '/api/maintenance', {
        'vehicle_id': api.ids['vehicle'], 'start_date': datetime.now(timezone.utc).isoformat(),
        'service_description': 'Manutencao de teste operacional', 'total_cost': '123.45', **extra})
    return response


async def returned(api, active):
    pending = await api.action(active, 'request-return', 'recipient', 'recipient', {
        'return_allocation_id': api.ids['origin_allocation'], 'return_odometer_km': '120',
        'return_condition': 'Sem avarias'})
    assert pending.status_code == 200, pending.text
    result = await api.action(pending.json(), 'accept-return', 'origin', 'origin')
    assert result.status_code == 200, result.text
    return result.json()


async def test_shared_vehicle_list_and_owner_registration(api):
    active = await api.active()
    for actor in ('origin', 'recipient'):
        response = await request(api, actor, 'GET', '/api/vehicles/paginated')
        assert response.status_code == 200, response.text
        rows = response.json()['data']
        assert len(rows) == 1
        row = rows[0]
        assert row['owner_organization_id'] == api.ids['origin']
        assert row['active_vehicle_loan_id'] == active['id']
        assert row['can_operate_vehicle'] is (actor == 'recipient')
        assert row['can_manage_registration'] is (actor == 'origin')
    assert (await request(api, 'outsider', 'GET', '/api/vehicles')).json() == []
    edit = {'model': 'Modelo atualizado', 'edit_reason': 'Correcao cadastral de teste'}
    assert (await request(api, 'recipient', 'PUT', '/api/vehicles/' + api.ids['vehicle'], edit)).status_code == 403
    response = await request(api, 'origin', 'PUT', '/api/vehicles/' + api.ids['vehicle'], edit)
    assert response.status_code == 200, response.text
    await returned(api, active)
    assert (await request(api, 'recipient', 'GET', '/api/vehicles')).json() == []


async def test_responsibility_history_and_return_cutoff(api):
    before = await maintenance(api, 'origin')
    assert before.status_code == 200, before.text
    active = await api.active()
    during = await maintenance(api, 'recipient')
    assert during.status_code == 200, during.text
    record = during.json()
    assert record['responsible_organization_id'] == api.ids['recipient']
    assert record['vehicle_loan_id'] == active['id']
    assert (await maintenance(api, 'origin')).status_code in (403, 404)
    assert (await request(api, 'origin', 'GET', '/api/maintenance/' + record['id'])).status_code == 200
    assert (await request(api, 'origin', 'PUT', '/api/maintenance/' + record['id'], {'total_cost': '1'})).status_code == 403
    await returned(api, active)
    after = await maintenance(api, 'origin')
    assert after.status_code == 200, after.text
    rows = (await request(api, 'recipient', 'GET', '/api/maintenance')).json()
    assert {r['id'] for r in rows} == {before.json()['id'], record['id']}
    assert (await request(api, 'recipient', 'GET', '/api/maintenance/' + after.json()['id'])).status_code == 404
    assert (await request(api, 'outsider', 'GET', '/api/maintenance/' + record['id'])).status_code == 404
    # Former operator can correct its own expenditure, attribution remains stable.
    response = await request(api, 'recipient', 'PUT', '/api/maintenance/' + record['id'], {'total_cost': '150'})
    assert response.status_code == 200, response.text
    assert response.json()['vehicle_loan_id'] == active['id']
    from app.repositories.payment_process_repository import PaymentProcessRepository
    async with api.sessions() as session:
        rows = await PaymentProcessRepository(session).list_maintenance_operations_for_organizations(
            organization_ids={UUID(api.ids['recipient'])})
        assert [str(r.id) for r in rows] == [record['id']]


async def test_temporal_attribution_legacy_null_and_report_totals(api):
    before = (await maintenance(api, 'origin')).json()
    active = await api.active()
    during = (await maintenance(api, 'recipient')).json()
    await returned(api, active)
    after = (await maintenance(api, 'origin')).json()
    from app.services.analytics_service import AnalyticsService
    async with api.sessions() as session:
        service = AnalyticsService(session)
        origin = await service.costs_trend(months=1, organization_id=UUID(api.ids['origin']))
        recipient = await service.costs_trend(months=1, organization_id=UUID(api.ids['recipient']))
        assert origin[0]['maintenance_cost'] == 246.9
        assert recipient[0]['maintenance_cost'] == 123.45

    # Unambiguous legacy rows use historical allocation; they are never reassigned to today's operator.
    with psycopg.connect(**api.db) as connection:
        connection.execute('UPDATE maintenance_records SET responsible_organization_id=NULL WHERE id=%s', (during['id'],))
    async with api.sessions() as session:
        service = AnalyticsService(session)
        recipient = await service.costs_trend(months=1, organization_id=UUID(api.ids['recipient']))
        assert recipient[0]['maintenance_cost'] == 123.45


@pytest.mark.parametrize('kind', ['possession', 'supply', 'order', 'fine', 'claim'])
async def test_each_operational_module_keeps_attribution_and_dated_visibility(api, kind):
    from app.models.user import User
    from app.models.possession import VehiclePossession
    from app.models.fuel_supply import FuelSupply
    from app.models.fuel_supply_order import FuelSupplyOrder
    from app.models.fine import Fine
    from app.models.claim import Claim
    from app.core.official_identity import INSTITUTIONAL_TIMEZONE
    from app.services.operational_scope import attribute_operation, ensure_record_visible
    from app.repositories.possession_repository import PossessionRepository
    from app.repositories.fuel_supply_repository import FuelSupplyRepository
    from app.repositories.fuel_supply_order_repository import FuelSupplyOrderRepository
    from app.repositories.fine_repository import FineRepository
    from app.repositories.claim_repository import ClaimRepository
    from fastapi import HTTPException
    from uuid import uuid4

    async def insert(side):
        now = datetime.now(timezone.utc)
        vid = UUID(api.ids['vehicle'])
        uid = UUID(api.actors[side])
        models = {
            'possession': lambda: VehiclePossession(vehicle_id=vid, driver_name='Teste', start_date=now, end_date=now),
            'supply': lambda: FuelSupply(vehicle_id=vid, supplied_at=now, odometer_km=100, liters=10,
                receipt_path='test-only.pdf', receipt_mime_type='application/pdf', receipt_size_bytes=1),
            'order': lambda: FuelSupplyOrder(vehicle_id=vid, created_at=now, created_by_user_id=uid,
                validation_code=uuid4().hex[:24], status='CANCELLED'),
            'fine': lambda: Fine(vehicle_id=vid, created_by=uid, ticket_number=uuid4().hex[:20], amount=100,
                description='Teste', infraction_date=now.astimezone(INSTITUTIONAL_TIMEZONE).date(),
                infraction_time=now.astimezone(INSTITUTIONAL_TIMEZONE).time()),
            'claim': lambda: Claim(vehicle_id=vid, created_by=uid, data_ocorrencia=now, tipo='AVARIA',
                descricao='Teste de responsabilidade', local='Garagem'),
        }
        async with api.sessions() as session:
            user = await session.get(User, uid)
            record = models[kind]()
            await attribute_operation(session, record, user, new=True)
            session.add(record)
            await session.commit()
            return record

    before = await insert('origin')
    loan = await api.active()
    during = await insert('recipient')
    assert str(during.vehicle_loan_id) == loan['id']
    field = 'organization_id' if kind in ('supply', 'order') else 'responsible_organization_id'
    assert str(getattr(during, field)) == api.ids['recipient']
    await returned(api, loan)
    after = await insert('origin')
    repositories = {'possession': PossessionRepository, 'supply': FuelSupplyRepository,
        'order': FuelSupplyOrderRepository, 'fine': FineRepository, 'claim': ClaimRepository}
    async with api.sessions() as session:
        repo = repositories[kind](session)
        rows, total = await repo.list_paginated(page=1, limit=100, organization_id=UUID(api.ids['recipient']))
        assert total == 2 and {row.id for row in rows} == {before.id, during.id}
        user = await session.get(User, UUID(api.actors['recipient']))
        await ensure_record_visible(session, during, user)
        with pytest.raises(HTTPException) as exc:
            await ensure_record_visible(session, after, user)
        assert exc.value.status_code == 404
        owner = await session.get(User, UUID(api.actors['origin']))
        with pytest.raises(HTTPException) as exc:
            await attribute_operation(session, during, owner)
        assert exc.value.status_code == 403

        if kind == 'possession':
            from app.services.document_signature_service import DocumentSignatureService
            from app.models.document_signature import DigitalDocumentType
            documents = DocumentSignatureService(session)
            with pytest.raises(HTTPException) as exc:
                await documents._ensure_source_writer(DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM, during.id, owner)
            assert exc.value.status_code == 403
            await documents._ensure_source_writer(DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM, during.id, user)


async def test_ambiguous_legacy_and_possession_crossing_handoff(api):
    from datetime import timedelta
    from app.models.user import User
    from app.models.possession import VehiclePossession
    from app.models.maintenance import MaintenanceRecord
    from app.services.operational_scope import attribute_operation
    from fastapi import HTTPException
    loan = await api.active()
    async with api.sessions() as session:
        admin = await session.get(User, UUID(api.actors['admin']))
        crossed = VehiclePossession(vehicle_id=UUID(api.ids['vehicle']), driver_name='Teste',
            start_date=datetime.fromisoformat(loan['started_at']) - timedelta(minutes=5))
        with pytest.raises(HTTPException) as exc:
            await attribute_operation(session, crossed, admin, new=True)
        assert exc.value.status_code == 409
        missing = MaintenanceRecord(vehicle_id=UUID(api.ids['vehicle']),
            start_date=datetime.now(timezone.utc) - timedelta(days=10))
        await attribute_operation(session, missing, admin, new=True)
        assert missing.responsible_organization_id is None and missing.vehicle_loan_id is None
