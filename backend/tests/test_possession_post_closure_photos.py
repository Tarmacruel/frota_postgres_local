from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4
import pytest
from fastapi import HTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException

from test_phase5_possession_return import _possession, _user
from test_possession_return_photos import upload, request_for, PNG
from app.api.routes.possession import parse_post_closure_photos
from app.models.user import UserRole
from app.services.possession_return_photo_service import PossessionReturnPhotoService
from app.services.possession_service import settings

@pytest.fixture
def setup_service(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    service = PossessionReturnPhotoService(AsyncMock())
    service.db.add = Mock()
    possession = _possession(ended=True)
    possession.revision = 7
    service.storage.possessions.get_by_id_for_update = AsyncMock(return_value=possession)
    service.storage._ensure_possession_visible_to_user = AsyncMock()
    confirmation = SimpleNamespace(id=uuid4(), version=3, canonical_payload_hash='original-hash')
    monkeypatch.setattr('app.services.possession_return_photo_service.PossessionReturnConfirmationRepository.get_current', AsyncMock(return_value=confirmation))
    audit = AsyncMock()
    monkeypatch.setattr('app.services.possession_return_photo_service.AuditService.record', audit)
    return service, possession, confirmation, audit, tmp_path

@pytest.mark.asyncio
async def test_append_keeps_closure_revision_and_confirmation_unchanged(setup_service):
    service, possession, confirmation, audit, path = setup_service
    before = (possession.end_date, possession.end_odometer_km, possession.revision, confirmation.__dict__.copy())
    count = await service.append_to_closed(possession.id, [upload()], _user())
    assert count == 1
    assert before == (possession.end_date, possession.end_odometer_km, possession.revision, confirmation.__dict__)
    photo = service.db.add.call_args.args[0]
    assert photo.evidence_stage == 'post_return' and photo.return_confirmation_version == 3
    assert (path / photo.photo_path).read_bytes() == PNG
    service.db.commit.assert_awaited_once()
    assert audit.await_args.kwargs['action'] == 'POSSESSION_POST_CLOSURE_PHOTOS'

@pytest.mark.asyncio
async def test_legacy_closed_possession_needs_no_confirmation(setup_service, monkeypatch):
    service, possession, _, _, _ = setup_service
    monkeypatch.setattr('app.services.possession_return_photo_service.PossessionReturnConfirmationRepository.get_current', AsyncMock(return_value=None))
    assert await service.append_to_closed(possession.id, [upload()], _user()) == 1
    photo = service.db.add.call_args.args[0]
    assert photo.return_confirmation_id is None and photo.return_confirmation_version is None

@pytest.mark.asyncio
async def test_retry_and_duplicate_content_do_not_create_duplicate_attachments(setup_service):
    service, possession, _, audit, _ = setup_service
    assert await service.append_to_closed(possession.id, [upload(), upload()], _user()) == 1
    possession.photos.append(service.db.add.call_args.args[0])
    service.db.add.reset_mock()
    assert await service.append_to_closed(possession.id, [upload()], _user()) == 0
    service.db.add.assert_not_called()
    audit.assert_awaited_once()

@pytest.mark.asyncio
async def test_active_or_invisible_possession_cannot_receive_later_photos(setup_service):
    service, possession, _, _, path = setup_service
    possession.end_date = None
    with pytest.raises(HTTPException) as exc:
        await service.append_to_closed(possession.id, [upload()], _user())
    assert exc.value.status_code == 409
    possession.end_date = 'closed'
    service.storage._ensure_possession_visible_to_user.side_effect = HTTPException(403)
    with pytest.raises(HTTPException) as exc:
        await service.append_to_closed(possession.id, [upload()], _user())
    assert exc.value.status_code == 403
    assert not list(path.rglob('*.png'))

@pytest.mark.asyncio
async def test_readonly_profile_cannot_upload(setup_service):
    service, possession, _, _, _ = setup_service
    with pytest.raises(HTTPException) as exc:
        await service.append_to_closed(possession.id, [upload()], _user(UserRole.PADRAO))
    assert exc.value.status_code == 403
    service.db.add.assert_not_called()

@pytest.mark.asyncio
async def test_failure_removes_files_and_rolls_back(setup_service):
    service, possession, _, _, path = setup_service
    service.db.commit.side_effect = RuntimeError('failure')
    with pytest.raises(RuntimeError):
        await service.append_to_closed(possession.id, [upload()], _user())
    service.db.rollback.assert_awaited_once()
    assert not list(path.rglob('*.png'))

@pytest.mark.asyncio
async def test_parser_accepts_photos_only_and_rejects_closure_fields():
    parser = parse_post_closure_photos(await request_for(files={'photos': ('photo.png', PNG, 'image/png')}))
    photos = await anext(parser)
    assert len(photos) == 1
    await parser.aclose()
    parser = parse_post_closure_photos(await request_for(files=[('photos', ('photo.png', PNG, 'image/png')), ('end_date', (None, '2030-01-01'))]))
    with pytest.raises(StarletteHTTPException) as exc:
        await anext(parser)
    assert exc.value.status_code == 400
