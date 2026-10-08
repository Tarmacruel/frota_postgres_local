from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi import HTTPException, UploadFile

from app.core.config import settings
from app.services.vehicle_loan_printed_term_service import MAX_TERMS_PER_LOAN, VehicleLoanPrintedTermService


def make_upload(name, content):
    return UploadFile(file=BytesIO(content), filename=name)


@pytest.mark.asyncio
@pytest.mark.parametrize('name,content,status', [
    ('term.exe', b'%PDF-test', 400),
    ('term.pdf', b'', 400),
    ('term.pdf', b'not a pdf', 400),
    ('term.png', b'%PDF-test', 400),
    ('term.jpg', b'\xff\xd8\xff\xe0truncated scan', 400),
    ('term.pdf', b'%PDF-xxxx', 413),
])
async def test_rejects_invalid_printed_terms(tmp_path, monkeypatch, name, content, status):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    if status == 413:
        monkeypatch.setattr('app.services.vehicle_loan_printed_term_service.MAX_TERM_BYTES', 8)
    db = AsyncMock()
    service = VehicleLoanPrintedTermService(db)
    service.loans.get = AsyncMock(return_value=SimpleNamespace())
    with pytest.raises(HTTPException) as error:
        await service.upload(uuid4(), make_upload(name, content), SimpleNamespace(id=uuid4()))
    assert error.value.status_code == status
    db.commit.assert_not_awaited()
    assert not list(tmp_path.rglob('*'))


@pytest.mark.asyncio
async def test_upload_stores_file_and_metadata_then_downloads_with_loan_scope(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    audit = AsyncMock()
    monkeypatch.setattr('app.services.vehicle_loan_printed_term_service.AuditService', lambda db: SimpleNamespace(record=audit))
    db = AsyncMock()
    db.add = Mock()
    db.scalar.return_value = 0
    loan_id, user_id = uuid4(), uuid4()
    service = VehicleLoanPrintedTermService(db)
    service.loans.get = AsyncMock(return_value=SimpleNamespace())
    user = SimpleNamespace(id=user_id)
    content = b'%PDF-1.7\nscanned document'
    term = await service.upload(loan_id, make_upload('../signed.pdf', content), user)
    assert term.original_filename == 'signed.pdf'
    assert term.size_bytes == len(content)
    assert (tmp_path / term.storage_path).read_bytes() == content
    db.commit.assert_awaited_once()
    audit.assert_awaited_once()
    db.get.return_value = term
    record, path = await service.get(loan_id, term.id, user)
    assert record is term and path.read_bytes() == content
    with pytest.raises(HTTPException) as error:
        await service.get(uuid4(), term.id, user)
    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_upload_removes_file_when_database_commit_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    monkeypatch.setattr('app.services.vehicle_loan_printed_term_service.AuditService', lambda db: SimpleNamespace(record=AsyncMock()))
    db = AsyncMock()
    db.add = Mock()
    db.scalar.return_value = 0
    db.commit.side_effect = RuntimeError('database down')
    service = VehicleLoanPrintedTermService(db)
    service.loans.get = AsyncMock(return_value=SimpleNamespace())
    with pytest.raises(RuntimeError):
        await service.upload(uuid4(), make_upload('term.pdf', b'%PDF-1.7'), SimpleNamespace(id=uuid4()))
    assert not list(tmp_path.rglob('*.pdf'))
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_upload_accepts_jpeg_with_scanner_trailer(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    monkeypatch.setattr('app.services.vehicle_loan_printed_term_service.AuditService', lambda db: SimpleNamespace(record=AsyncMock()))
    db = AsyncMock()
    db.add = Mock()
    db.scalar.return_value = 0
    service = VehicleLoanPrintedTermService(db)
    service.loans.get = AsyncMock(return_value=SimpleNamespace())
    content = b'\xff\xd8\xff\xe0scan\xff\xd9trailer'
    term = await service.upload(uuid4(), make_upload('scan.jpeg', content), SimpleNamespace(id=uuid4()))
    assert (tmp_path / term.storage_path).read_bytes() == content


@pytest.mark.asyncio
async def test_upload_enforces_per_loan_limit_before_storing(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    db = AsyncMock()
    db.scalar.return_value = MAX_TERMS_PER_LOAN
    service = VehicleLoanPrintedTermService(db)
    service.loans.get = AsyncMock(return_value=SimpleNamespace())
    with pytest.raises(HTTPException) as error:
        await service.upload(uuid4(), make_upload('term.pdf', b'%PDF-1.7'), SimpleNamespace(id=uuid4()))
    assert error.value.status_code == 409
    db.commit.assert_not_awaited()
    assert not list(tmp_path.rglob('*'))


@pytest.mark.asyncio
async def test_upload_checks_loan_visibility_before_reading_file(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, 'STORAGE_DIR', tmp_path)
    db = AsyncMock()
    service = VehicleLoanPrintedTermService(db)
    service.loans.get = AsyncMock(side_effect=HTTPException(404, 'Empréstimo não encontrado'))
    upload = make_upload('term.pdf', b'%PDF-1.7')
    with pytest.raises(HTTPException) as error:
        await service.upload(uuid4(), upload, SimpleNamespace(id=uuid4()))
    assert error.value.status_code == 404
    assert upload.file.tell() == 0
