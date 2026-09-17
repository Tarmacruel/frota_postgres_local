from __future__ import annotations

from datetime import datetime, timedelta, timezone
from inspect import signature
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError

from app.api.routes.possession import update_possession, correct_possession_return_confirmation
from app.models.user import UserRole
from app.schemas.possession import PossessionAdminUpdate
from app.services.document_signature_service import DocumentSignatureService
from app.services.possession_service import PossessionService


def _user(role: UserRole = UserRole.ADMIN):
    return SimpleNamespace(
        id=uuid4(),
        name="Administrador de teste",
        email="admin@example.test",
        role=role,
        organization_id=None,
    )


def _possession(*, start_date: datetime | None = None, end_date: datetime | None = None):
    start = start_date or datetime.now(timezone.utc) - timedelta(hours=2)
    return SimpleNamespace(
        id=uuid4(),
        vehicle_id=uuid4(),
        driver_id=None,
        driver_name="Condutor de teste",
        driver_document=None,
        driver_contact=None,
        start_date=start,
        end_date=end_date,
        observation="Registro original",
        start_odometer_km=100.0,
        end_odometer_km=120.0 if end_date else None,
        photo_path=None,
        photo_mime_type=None,
        photo_size_bytes=None,
        photo_captured_at=None,
        capture_latitude=None,
        capture_longitude=None,
        capture_accuracy_meters=None,
        document_path=None,
        document_name=None,
        return_document_path=None,
        return_document_name=None,
        photos=[],
        vehicle=SimpleNamespace(plate="ABC1D23"),
    )


def _payload(record, **changes) -> PossessionAdminUpdate:
    values = {
        "driver_id": record.driver_id,
        "driver_name": record.driver_name,
        "driver_document": record.driver_document,
        "driver_contact": record.driver_contact,
        "start_date": record.start_date,
        "end_date": record.end_date,
        "observation": record.observation,
        "start_odometer_km": record.start_odometer_km,
        "end_odometer_km": record.end_odometer_km,
        "edit_reason": "Correção administrativa de teste",
    }
    values.update(changes)
    return PossessionAdminUpdate(**values)


def _service(record, monkeypatch):
    db = AsyncMock()
    service = PossessionService(db)
    service.possessions.get_by_id = AsyncMock(return_value=record)
    service.possessions.get_by_id_for_update = AsyncMock(return_value=record)
    service.possessions.lock_vehicle = AsyncMock(return_value=True)
    service.possessions.list = AsyncMock(return_value=[record])
    service.return_confirmations.get_current = AsyncMock(return_value=None)
    service.trips.list_by_possession = AsyncMock(return_value=[])
    service.audit.record = AsyncMock()
    service._serialize_with_signatures = AsyncMock(return_value={"id": str(record.id)})
    monkeypatch.setattr(DocumentSignatureService, "mark_source_documents_superseded", AsyncMock())
    return service, db


@pytest.mark.asyncio
async def test_admin_rectification_validates_and_commits_atomically(monkeypatch):
    record = _possession()
    service, db = _service(record, monkeypatch)

    result = await service.admin_update(record.id, _payload(record), _user())

    assert result == {"id": str(record.id)}
    service.audit.record.assert_awaited_once()
    db.flush.assert_awaited()
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_rectification_rejects_missing_previous_possession(monkeypatch):
    service, _db = _service(_possession(), monkeypatch)
    service.possessions.get_by_id = AsyncMock(return_value=None)

    with pytest.raises(HTTPException) as exc:
        await service.admin_update(uuid4(), _payload(_possession()), _user())

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_admin_rectification_rejects_overlapping_active_possession(monkeypatch):
    record = _possession()
    other_active = _possession(start_date=record.start_date - timedelta(days=1))
    service, _db = _service(record, monkeypatch)
    service.possessions.list = AsyncMock(return_value=[record, other_active])

    with pytest.raises(HTTPException) as exc:
        await service.admin_update(
            record.id,
            _payload(record, start_date=record.start_date + timedelta(minutes=1)),
            _user(),
        )

    assert exc.value.status_code == 409
    assert "sobrepõe" in exc.value.detail


def test_admin_rectification_requires_mandatory_fields():
    with pytest.raises(ValidationError):
        PossessionAdminUpdate.model_validate({})


@pytest.mark.asyncio
async def test_admin_rectification_rejects_inconsistent_dates(monkeypatch):
    record = _possession()
    record.end_date = record.start_date + timedelta(hours=1)
    record.end_odometer_km = 120.0
    service, _db = _service(record, monkeypatch)

    with pytest.raises(HTTPException) as exc:
        await service.admin_update(
            record.id,
            _payload(record, end_date=record.start_date - timedelta(minutes=1)),
            _user(),
        )

    assert exc.value.status_code == 400
    assert "Data final" in exc.value.detail


@pytest.mark.asyncio
async def test_admin_rectification_rolls_back_when_a_later_operation_fails(monkeypatch):
    record = _possession()
    service, db = _service(record, monkeypatch)
    monkeypatch.setattr(
        DocumentSignatureService,
        "mark_source_documents_superseded",
        AsyncMock(side_effect=RuntimeError("falha de assinatura")),
    )

    with pytest.raises(RuntimeError, match="falha de assinatura"):
        await service.admin_update(record.id, _payload(record), _user())

    db.rollback.assert_awaited_once()
    db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_rectification_reports_database_conflict(monkeypatch):
    record = _possession()
    service, db = _service(record, monkeypatch)
    db.flush = AsyncMock(side_effect=IntegrityError("UPDATE vehicle_possession", {}, Exception("unique")))

    with pytest.raises(HTTPException) as exc:
        await service.admin_update(record.id, _payload(record), _user())

    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "POSSESSION_CONFLICT"
    assert "conflita" in exc.value.detail["message"]
    db.rollback.assert_awaited_once()


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint", [update_possession, correct_possession_return_confirmation])
@pytest.mark.parametrize("role", list(UserRole))
@pytest.mark.parametrize("can_edit", [True, False, None])
async def test_rectification_endpoint_permissions(endpoint, role, can_edit):
    user = _user(role)
    permission = None if can_edit is None else SimpleNamespace(
        can_view=True, can_create=True, can_edit=can_edit, can_delete=False,
    )
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: permission)
    parameters = signature(endpoint).parameters
    role_guard = parameters["current_user"].default.dependency
    permission_guard = parameters["_permission"].default.dependency

    async def authorize():
        await role_guard(current_user=user)
        await permission_guard(db=db, current_user=user)

    if role in {UserRole.ADMIN, UserRole.PRODUCAO} and can_edit is not False:
        await authorize()
    else:
        with pytest.raises(HTTPException) as exc:
            await authorize()
        assert exc.value.status_code == 403
