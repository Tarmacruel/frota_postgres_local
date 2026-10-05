import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_current_user_ready
from app.api.routes.fuel_supplies import router
from app.db.session import get_db_session
from app.main import validation_exception_handler
from app.models.user import UserRole
from app.services.fuel_supply_service import FuelSupplyService


@pytest.fixture
def api(monkeypatch):
    app = FastAPI()
    app.include_router(router)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    user = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)))
    app.dependency_overrides[get_current_user_ready] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: db
    calls = []

    async def rectify(self, supply_id, payload, current_user, *, receipt=None):
        calls.append((payload, receipt))
        return JSONResponse({'id': str(supply_id), 'reason': payload.reason,
            'receipt': (await receipt.read()).decode() if receipt else None})

    monkeypatch.setattr(FuelSupplyService, 'rectify', rectify)
    payload = {'supplied_at': datetime.now(timezone.utc).isoformat(), 'odometer_km': 100,
        'liters': 10, 'total_amount': 50, 'fuel_type': 'Gasolina comum',
        'reason': 'Substituição do comprovante incorreto.', 'notes': None, 'additive_type': None}
    return app, payload, calls, user


@pytest.mark.asyncio
@pytest.mark.parametrize('multipart', [False, True])
async def test_rectify_accepts_existing_json_and_atomic_multipart(api, multipart):
    app, payload, calls, _ = api
    kwargs = {'json': payload}
    if multipart:
        kwargs = {'data': {'payload': json.dumps(payload)},
            'files': {'receipt': ('correto.pdf', b'%PDF-1.4 corrected', 'application/pdf')}}
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.patch(f'/api/fuel-supplies/{uuid4()}', **kwargs)
    assert response.status_code == 200, response.text
    assert response.json()['reason'] == payload['reason']
    assert response.json()['receipt'] == ('%PDF-1.4 corrected' if multipart else None)
    assert calls[0][0].notes is None
    assert calls[0][0].additive_type is None
    if multipart:
        assert calls[0][1].file.closed


@pytest.mark.asyncio
@pytest.mark.parametrize('case', ['missing-payload', 'invalid-json', 'short-reason', 'invalid-data', 'receipt-is-text'])
async def test_invalid_multipart_is_rejected_before_service(api, case):
    app, payload, calls, _ = api
    if case == 'short-reason':
        payload['reason'] = 'curta'
    if case == 'invalid-data':
        payload['liters'] = 0
    data = {'payload': json.dumps(payload)}
    files = {'receipt': ('correto.pdf', b'%PDF-1.4 corrected', 'application/pdf')}
    if case == 'missing-payload':
        data = {}
    elif case == 'invalid-json':
        data['payload'] = '{'
    elif case == 'receipt-is-text':
        files['receipt'] = (None, 'arquivo-invalido')
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.patch(f'/api/fuel-supplies/{uuid4()}', data=data, files=files)
    assert response.status_code == 422, response.text
    assert not calls


@pytest.mark.asyncio
async def test_multipart_keeps_existing_edit_permission(api):
    app, payload, calls, user = api
    user.role = UserRole.PADRAO
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
        response = await client.patch(f'/api/fuel-supplies/{uuid4()}', data={'payload': json.dumps(payload)},
            files={'receipt': ('correto.pdf', b'%PDF-1.4 corrected', 'application/pdf')})
    assert response.status_code == 403, response.text
    assert not calls
