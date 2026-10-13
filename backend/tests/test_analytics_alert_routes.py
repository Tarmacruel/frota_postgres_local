from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user_ready
from app.api.routes.analytics_v2 import router
from app.db.session import get_db_session
from app.models.user import UserRole
from app.services.analytics_alerts import AnalyticsAlerts


@pytest.mark.asyncio
async def test_closed_filters_and_private_detail_etag(monkeypatch):
    user = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN, organization_id=None,
        permissions={'analytics': {'can_view': True}, 'fuel_supplies': {'can_view': True}})
    permission_result = SimpleNamespace(scalar_one_or_none=lambda: SimpleNamespace(can_view=True,
        can_edit=False, can_create=False, can_delete=False))
    db = SimpleNamespace(execute=AsyncMock(return_value=permission_result))
    detail = AsyncMock(return_value={'id': str(uuid4()), 'version': 4})
    listing = AsyncMock(return_value={'items': [], 'total': 0})
    monkeypatch.setattr(AnalyticsAlerts, 'detail', detail)
    monkeypatch.setattr(AnalyticsAlerts, 'list', listing)
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        base = '/api/analytics/v2/alerts'
        reply = await client.get(base + f'/{uuid4()}')
        assert reply.status_code == 200 and reply.headers['etag'] == '"4"'
        assert reply.headers['cache-control'] == 'private, no-store'
        valid = await client.get(base + '?date_from=2026-09-01&date_to=2026-09-30&status=IGNORED&limit=25')
        assert valid.status_code == 200 and listing.call_args.kwargs['status'] == 'IGNORED'
        for suffix in ('&include_charts=true', '&limit=101', '&status=UNKNOWN', '&rule_key=unapproved'):
            response = await client.get(base + '?date_from=2026-09-01&date_to=2026-09-30' + suffix)
            assert response.status_code == 422
        assert (await client.get(base + f'/{uuid4()}?evidence=true')).status_code == 422


@pytest.mark.asyncio
async def test_mutations_require_headers_reason_and_source_permission():
    user = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN, organization_id=None,
        permissions={'analytics': {'can_view': True, 'can_edit': True}, 'fuel_supplies': {'can_view': True}})
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)), rollback=AsyncMock())
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        base = '/api/analytics/v2/alerts'
        response = await client.post(base + '/reconcile', json={'date_from': '2026-09-01', 'date_to': '2026-09-30'})
        assert response.status_code == 428
        missing = await client.patch(base + f'/{uuid4()}/status', json={'status': 'IN_REVIEW'})
        assert missing.status_code == 428
        extra = await client.post(base + '/reconcile', json={'date_from': '2026-09-01', 'date_to': '2026-09-30', 'evidence': {}})
        assert extra.status_code == 422
        user.permissions['fuel_supplies']['can_view'] = False
        for method, path, body in [('get', base, None), ('post', base + '/reconcile', {'date_from': '2026-09-01', 'date_to': '2026-09-30'})]:
            args = {'params': {'date_from': '2026-09-01', 'date_to': '2026-09-30'}} if method == 'get' else {'json': body}
            denied = await getattr(client, method)(path, **args)
            assert denied.status_code == 403
