from io import BytesIO
import base64
from datetime import datetime, timezone
from unittest.mock import Mock, AsyncMock

import httpx
import pytest
from fastapi import HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from starlette.datastructures import Headers
from starlette.requests import Request

from test_phase5_possession_return import _possession, _service, _user
from app.api.routes.possession import parse_return_with_photos
from app.schemas.possession_return import PossessionEndWithConfirmation
from app.services.possession_return_photo_service import PossessionReturnPhotoService
from app.services.possession_service import settings

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')

@pytest.fixture(autouse=True)
def mock_attribution(monkeypatch):
    monkeypatch.setattr('app.services.possession_return_service.attribute_operation', AsyncMock())

def upload(content=PNG, mime='image/png'):
    return UploadFile(BytesIO(content), filename='evidencia.png', headers=Headers({'content-type': mime}))

def end_data():
    return PossessionEndWithConfirmation(end_date=datetime.now(timezone.utc), end_odometer_km=105,
                                        vehicle_condition_notes='Conferência de teste', declaration_accepted=True)

async def request_for(**kwargs):
    outgoing = httpx.Request('PUT', 'http://test/possession/test/end', **kwargs)
    body = outgoing.read()
    async def receive():
        return {'type': 'http.request', 'body': body, 'more_body': False}
    return Request({'type': 'http', 'app': object(), 'method': 'PUT', 'path': '/', 'headers': [(k.lower(), v) for k, v in outgoing.headers.raw]}, receive)

@pytest.mark.asyncio
async def test_json_contract_without_photos_remains_valid():
    parser = parse_return_with_photos(await request_for(json=end_data().model_dump(mode='json')))
    data, photos = await anext(parser)
    assert data.declaration_accepted and photos == []
    await parser.aclose()

@pytest.mark.asyncio
async def test_multipart_parser_keeps_upload_open_until_request_finishes():
    parser = parse_return_with_photos(await request_for(files=[
        ('payload_json', (None, end_data().model_dump_json())),
        ('photos', ('evidencia.png', PNG, 'image/png')),
    ]))
    data, photos = await anext(parser)
    assert data.end_odometer_km == 105 and await photos[0].read() == PNG
    await parser.aclose()
    assert photos[0].file.closed

@pytest.mark.asyncio
async def test_multipart_rejects_unknown_payload_fields():
    payload = end_data().model_dump(mode='json') | {'bypass': True}
    import json
    parser = parse_return_with_photos(await request_for(files={'payload_json': (None, json.dumps(payload))}))
    with pytest.raises(RequestValidationError):
        await anext(parser)

@pytest.mark.asyncio
@pytest.mark.parametrize('content,mime,status', [(b'', 'image/png', 400), (b'not png', 'image/png', 400),
                                                (PNG, 'text/plain', 400), (b'x' * (8*1024*1024+1), 'image/png', 413)], ids=['empty', 'wrong-content', 'wrong-mime', 'oversized'])
async def test_invalid_files_rejected_and_closed(content, mime, status):
    file = upload(content, mime)
    with pytest.raises(HTTPException) as exc:
        await PossessionReturnPhotoService(Mock()).prepare([file])
    assert exc.value.status_code == status and file.file.closed

@pytest.mark.asyncio
async def test_count_limit_and_total_limit_close_all_files():
    files = [upload() for _ in range(11)]
    with pytest.raises(HTTPException):
        await PossessionReturnPhotoService(Mock()).prepare(files)
    assert all(file.file.closed for file in files)
    service = PossessionReturnPhotoService(Mock())
    service.storage._read_and_validate_photo = AsyncMock(return_value=(b'x' * (8*1024*1024), 'image/png'))
    with pytest.raises(HTTPException) as exc:
        await service.prepare([upload() for _ in range(5)])
    assert exc.value.status_code == 413

@pytest.mark.asyncio
async def test_photo_and_confirmation_share_commit_and_versioned_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    possession = _possession()
    service = _service(possession)
    service.db.add = Mock()
    confirmation = await service.end(possession.id, end_data(), _user(), photos=[upload()])
    stored = service.db.add.call_args.args[0]
    assert stored.evidence_stage == 'return'
    assert stored.return_confirmation_id == confirmation.id and stored.return_confirmation_version == 1
    assert stored.photo_captured_at is None and stored.capture_latitude is None
    assert (tmp_path / stored.photo_path).read_bytes() == PNG
    assert len(stored.content_sha256) == 64
    service.db.commit.assert_awaited_once()
    manifest = service.audit.record.await_args_list[0].kwargs['details']['return_evidence']
    assert manifest[0]['sha256'] == stored.content_sha256

@pytest.mark.asyncio
async def test_commit_failure_removes_staged_files(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    possession = _possession()
    service = _service(possession)
    service.db.add = Mock()
    service.db.commit.side_effect = RuntimeError('database failure')
    with pytest.raises(RuntimeError):
        await service.end(possession.id, end_data(), _user(), photos=[upload()])
    service.db.rollback.assert_awaited_once()
    assert not list(tmp_path.rglob('*.png'))

@pytest.mark.asyncio
async def test_ended_possession_and_open_route_never_store_photos(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    for ended, open_trip in [(True, False), (False, True)]:
        possession = _possession(ended=ended)
        service = _service(possession)
        service.trips.get_open_by_possession.return_value = object() if open_trip else None
        with pytest.raises(HTTPException) as exc:
            await service.end(possession.id, end_data(), _user(), photos=[upload()])
        assert exc.value.status_code == 409
        service.db.commit.assert_not_awaited()
        assert not list(tmp_path.rglob('*.png'))
