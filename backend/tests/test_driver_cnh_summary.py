from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.dialects import sqlite

from app.models.driver import Driver
from app.models.user import UserRole
from app.repositories.driver_repository import DriverRepository
from app.schemas.driver import DriverCnhStatus
from app.services.driver_service import DriverService

TODAY = date(2026, 10, 22)
ORG = UUID('00000000-0000-0000-0000-000000000001')
OTHER = UUID('00000000-0000-0000-0000-000000000002')


@pytest.fixture
def driver_db():
    engine = create_engine('sqlite://')
    with engine.connect() as connection:
        connection.exec_driver_sql('CREATE TABLE master_organizations (id TEXT, name TEXT)')
        connection.exec_driver_sql('CREATE TABLE drivers (id TEXT, nome_completo TEXT, documento TEXT, matricula TEXT, organization_id TEXT, ativo BOOLEAN, cnh_numero TEXT, cnh_validade DATE, created_at TEXT)')
        connection.exec_driver_sql('INSERT INTO master_organizations VALUES (?, ?), (?, ?)', (ORG.hex, 'Secretaria Um', OTHER.hex, 'Secretaria Dois'))
        cases = [(365, '123', True, ORG)] * 10 + [
            (-1, '123', True, ORG), (0, '123', True, ORG), (30, '123', True, ORG),
            (31, '123', True, ORG), (60, '123', True, ORG), (61, '123', True, ORG),
            (None, '123', True, ORG), (365, None, True, ORG), (-1, '  ', True, ORG),
            (None, '', True, ORG), (-2, '123', True, OTHER), (20, '123', False, ORG),
        ]
        for index, (days, number, active, organization) in enumerate(cases, 1):
            expiry = (TODAY + timedelta(days=days)).isoformat() if days is not None else None
            connection.exec_driver_sql('INSERT INTO drivers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                (str(index), f'Motorista {index:02}', f'doc-{index}', f'mat-{index}', organization.hex, active, number, expiry, TODAY.isoformat()))

        async def execute(statement):
            if statement.column_descriptions[0]['expr'] is Driver:
                statement = statement.with_only_columns(Driver.id)
            return connection.exec_driver_sql(str(statement.compile(dialect=sqlite.dialect(), compile_kwargs={'literal_binds': True})))
        yield SimpleNamespace(execute=execute)
    engine.dispose()


@pytest.mark.asyncio
async def test_summary_covers_all_pages_even_when_first_page_has_no_expired_licenses(driver_db):
    repo = DriverRepository(driver_db)
    first, total, summary = await repo.list_paginated(page=1, limit=10, organization_id=ORG, active_only=True, with_summary=True, reference_date=TODAY)
    second, second_total, second_summary = await repo.list_paginated(page=2, limit=10, organization_id=ORG, active_only=True, with_summary=True, reference_date=TODAY)
    assert first == [str(i) for i in range(1, 11)]
    assert total == second_total == 20 and len(second) == 10
    assert summary == second_summary == {'total': 20, 'expired': 2, 'expiring_30': 2, 'expiring_60': 4, 'missing': 4, 'reference_date': TODAY}


@pytest.mark.asyncio
@pytest.mark.parametrize(('status', 'expected'), [
    (DriverCnhStatus.EXPIRED, ['11', '19']),
    (DriverCnhStatus.EXPIRING_30, ['12', '13']),
    (DriverCnhStatus.EXPIRING_60, ['12', '13', '14', '15']),
    (DriverCnhStatus.MISSING, ['17', '18', '19', '20']),
])
async def test_filter_uses_same_boundaries_and_does_not_shrink_other_kpis(driver_db, status, expected):
    repo = DriverRepository(driver_db)
    first, total, summary = await repo.list_paginated(page=1, limit=1, active_only=True, organization_id=ORG, cnh_status=status, with_summary=True, reference_date=TODAY)
    rest, other_total, other_summary = await repo.list_paginated(page=2, limit=1, active_only=True, organization_id=ORG, cnh_status=status, with_summary=True, reference_date=TODAY)
    assert first == expected[:1] and rest == expected[1:2]
    assert total == other_total == len(expected)
    assert summary == other_summary and summary[status.value] == total and summary['total'] == 20


@pytest.mark.asyncio
async def test_summary_honors_status_secretaria_search_and_empty_result(driver_db):
    repo = DriverRepository(driver_db)
    _, total, summary = await repo.list_paginated(page=1, limit=10, active_only=False, with_summary=True, reference_date=TODAY)
    assert total == summary['total'] == summary['expiring_30'] == 1
    _, total, summary = await repo.list_paginated(page=1, limit=10, search='Secretaria Dois', with_summary=True, reference_date=TODAY)
    assert total == summary['total'] == summary['expired'] == 1
    _, total, summary = await repo.list_paginated(page=1, limit=10, search=' mat-19 ', organization_id=ORG, active_only=True, cnh_status=DriverCnhStatus.MISSING, with_summary=True, reference_date=TODAY)
    assert total == summary['expired'] == summary['missing'] == 1
    _, total, summary = await repo.list_paginated(page=1, limit=10, search='inexistente', with_summary=True, reference_date=TODAY)
    assert total == 0 and all(summary[key] == 0 for key in ['total', 'expired', 'expiring_30', 'expiring_60', 'missing'])


@pytest.mark.asyncio
async def test_empty_producao_scope_does_not_query_or_leak_summary():
    service = DriverService(SimpleNamespace())
    service.drivers = SimpleNamespace(list_paginated=AsyncMock())
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=None)
    result = await service.list(page=1, limit=10, current_user=user, with_summary=True, cnh_status=DriverCnhStatus.EXPIRED)
    assert result['data'] == [] and result['pagination'].total == 0
    assert result['summary'].total == result['summary'].expired == 0
    service.drivers.list_paginated.assert_not_awaited()


@pytest.mark.asyncio
async def test_route_rejects_unknown_cnh_filter_before_query(client):
    from app.main import app
    from app.api.deps import get_current_user_ready
    from app.db.session import get_db_session
    async def user(): return SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)
    async def db(): yield SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)))
    app.dependency_overrides[get_current_user_ready] = user
    app.dependency_overrides[get_db_session] = db
    try:
        response = await client.get('/api/drivers?cnh_status=unknown')
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_summary_service_preserves_shared_catalog_secretaria_and_forwards_filter():
    service = DriverService(SimpleNamespace())
    expected = {'total': 3, 'expired': 2, 'expiring_30': 0, 'expiring_60': 0, 'missing': 1, 'reference_date': TODAY}
    service.drivers = SimpleNamespace(list_paginated=AsyncMock(return_value=([], 2, expected)))
    user = SimpleNamespace(id=uuid4(), role=UserRole.PRODUCAO, organization_id=ORG)
    result = await service.list(page=2, limit=1, organization_id=OTHER, current_user=user, cnh_status=DriverCnhStatus.EXPIRED, with_summary=True)
    assert result['summary'] == expected and result['pagination'].total == 2
    assert service.drivers.list_paginated.await_args.kwargs['organization_id'] == OTHER
    assert service.drivers.list_paginated.await_args.kwargs['cnh_status'] == DriverCnhStatus.EXPIRED
