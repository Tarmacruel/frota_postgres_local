from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import Column, DateTime, Float, MetaData, Table, Uuid, create_engine, update

from app.models.user import UserRole
from app.repositories.possession_repository import PossessionRepository
from app.services.possession_service import PossessionService


@pytest.mark.asyncio
async def test_http_contract_and_permission(monkeypatch):
    from fastapi import FastAPI
    from httpx import ASGITransport, AsyncClient
    from app.api.deps import get_current_user_ready
    from app.api.routes.possession import router
    from app.db.session import get_db_session

    app = FastAPI()
    app.include_router(router)
    user = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)
    db = SimpleNamespace(execute=AsyncMock(return_value=Mock(scalar_one_or_none=Mock(return_value=None))))
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    service_method = AsyncMock(return_value={'odometer_km': 0, 'end_date': datetime(2026, 7, 12, tzinfo=timezone.utc)})
    monkeypatch.setattr(PossessionService, 'get_odometer_suggestion', service_method)
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        params = {'vehicle_id': str(uuid4()), 'start_date': '2026-07-15T12:00:00Z'}
        response = await client.get('/api/possession/odometer-suggestion', params=params)
        assert response.status_code == 200
        assert response.json() == {'odometer_km': 0, 'end_date': '2026-07-12T00:00:00Z'}
        service_method.return_value = None
        response = await client.get('/api/possession/odometer-suggestion', params=params)
        assert response.status_code == 200
        assert response.json() is None
        assert (await client.get('/api/possession/odometer-suggestion', params={'vehicle_id': 'invalid'})).status_code == 422
        user.role = UserRole.POSTO
        service_method.reset_mock()
        assert (await client.get('/api/possession/odometer-suggestion', params=params)).status_code == 403
        service_method.assert_not_awaited()


@pytest.mark.asyncio
async def test_history_selection_and_correction():
    # Execute the repository's real SELECT against an isolated in-memory database.
    engine = create_engine('sqlite://')
    metadata = MetaData()
    history = Table(
        'vehicle_possession', metadata,
        Column('id', Uuid, primary_key=True), Column('vehicle_id', Uuid),
        Column('end_odometer_km', Float), Column('end_date', DateTime),
        Column('created_at', DateTime),
    )
    metadata.create_all(engine)
    vehicle_id, other_vehicle = uuid4(), uuid4()
    now = datetime(2026, 7, 15, 12)
    with engine.connect() as connection:
        repo = PossessionRepository(SimpleNamespace(execute=AsyncMock(side_effect=connection.execute)))
        assert await repo.get_odometer_suggestion(vehicle_id, now) is None

        def add(identifier, vehicle, end, km, created=now):
            connection.execute(history.insert().values(
                id=UUID(int=identifier), vehicle_id=vehicle, end_date=end,
                end_odometer_km=km, created_at=created,
            ))

        add(1, vehicle_id, now - timedelta(days=3), 0)
        add(2, vehicle_id, now - timedelta(days=2), 900)
        add(3, vehicle_id, now - timedelta(days=1), 100)
        add(4, vehicle_id, now, None)  # Missing final reading is skipped.
        add(5, vehicle_id, None, 999)  # Active possession is skipped.
        add(6, vehicle_id, now + timedelta(days=1), 1000)
        add(7, other_vehicle, now, 2000)
        assert (await repo.get_odometer_suggestion(vehicle_id, now))['odometer_km'] == 100
        assert (await repo.get_odometer_suggestion(vehicle_id, now - timedelta(days=3)))['odometer_km'] == 0
        assert await repo.get_odometer_suggestion(vehicle_id, now - timedelta(days=4)) is None
        add(8, vehicle_id, now - timedelta(days=1), 110, now + timedelta(hours=1))
        add(9, vehicle_id, now - timedelta(days=1), 120, now + timedelta(hours=1))
        assert (await repo.get_odometer_suggestion(vehicle_id, now))['odometer_km'] == 120
        connection.execute(update(history).where(history.c.id == UUID(int=9)).values(end_odometer_km=125))
        assert (await repo.get_odometer_suggestion(vehicle_id, now))['odometer_km'] == 125
    engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize('in_organization', [True, False])
async def test_organization_scope_is_checked_before_history(in_organization):
    vehicle_id, organization_id = uuid4(), uuid4()
    user = SimpleNamespace(role=UserRole.PRODUCAO, organization_id=organization_id)
    service = PossessionService(AsyncMock())
    service.vehicles.get_by_id = AsyncMock(return_value=SimpleNamespace(id=vehicle_id))
    service.vehicles.is_vehicle_in_organization = AsyncMock(return_value=in_organization)
    service.possessions.get_odometer_suggestion = AsyncMock(return_value=None)
    start = datetime.now(timezone.utc)
    if in_organization:
        assert await service.get_odometer_suggestion(vehicle_id, start, user) is None
        service.possessions.get_odometer_suggestion.assert_awaited_once_with(vehicle_id, start)
    else:
        with pytest.raises(HTTPException) as error:
            await service.get_odometer_suggestion(vehicle_id, start, user)
        assert error.value.status_code == 404
        service.possessions.get_odometer_suggestion.assert_not_awaited()
    service.vehicles.is_vehicle_in_organization.assert_awaited_once_with(vehicle_id, organization_id)
