from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models.user import UserRole
from app.schemas.possession_return import PossessionEndWithConfirmation, PossessionReturnCorrection
from app.services.possession_return_service import (
    DECLARATION_TEXT,
    DECLARATION_VERSION,
    PossessionReturnService,
    build_canonical_return_payload,
    canonical_payload_sha256,
)
from app.services.possession_term_pdf_service import NO_CACHE_HEADERS, PossessionTermPdfService
from app.api.routes import possession as possession_routes


def _user(role=UserRole.ADMIN):
    return SimpleNamespace(
        id=uuid4(),
        name="Usuário de teste",
        email="usuario@example.test",
        role=role,
    )


def _possession(*, ended=False):
    start = datetime.now(timezone.utc) - timedelta(hours=2)
    return SimpleNamespace(
        id=uuid4(),
        public_number=123,
        vehicle_id=uuid4(),
        driver_id=uuid4(),
        driver_name="Condutor de teste",
        driver_document="12345678901",
        driver_contact="75999999999",
        start_date=start,
        end_date=(start + timedelta(hours=1)) if ended else None,
        start_odometer_km=100.0,
        end_odometer_km=105.0 if ended else None,
        observation="Entrega conferida",
        vehicle=SimpleNamespace(plate="ABC1D23", brand="Marca", model="Modelo"),
        photos=[],
        trips=[],
        return_confirmations=[],
    )


def _service(possession):
    service = PossessionReturnService(AsyncMock())
    service._visible_possession = AsyncMock(return_value=possession)
    service.possessions.get_by_id_for_update = AsyncMock(return_value=possession)
    service.trips.get_open_by_possession = AsyncMock(return_value=None)
    service.trips.get_latest_completed = AsyncMock(return_value=None)
    service.confirmations.get_current = AsyncMock(return_value=None)
    service.confirmations.next_version = AsyncMock(return_value=1)

    async def create(confirmation):
        if confirmation.id is None:
            confirmation.id = uuid4()
        return confirmation

    service.confirmations.create = AsyncMock(side_effect=create)
    service.audit.record = AsyncMock()
    return service


def test_declaration_is_versioned_and_not_signature_language():
    assert DECLARATION_VERSION == "1.0"
    assert "Declaro" in DECLARATION_TEXT
    assert "sessão autenticada" in DECLARATION_TEXT
    lowered = DECLARATION_TEXT.casefold()
    assert "assinatura digital" not in lowered
    assert "icp-brasil" not in lowered


def test_canonical_payload_and_hash_are_stable_and_sensitive_to_changes():
    possession = _possession()
    user = _user()
    confirmed_at = datetime(2026, 7, 13, 15, 30, tzinfo=timezone.utc)
    common = dict(
        possession=possession,
        user=user,
        confirmed_at=confirmed_at,
        returned_at=confirmed_at - timedelta(minutes=5),
        final_odometer_km=Decimal("105.0"),
        vehicle_condition_notes="Sem ressalvas",
        last_trip_id=None,
        request_id="phase5-request-0001",
        version=1,
    )
    first = build_canonical_return_payload(**common)
    reordered = dict(reversed(list(first.items())))
    assert canonical_payload_sha256(first) == canonical_payload_sha256(reordered)
    assert len(canonical_payload_sha256(first)) == 64
    changed = {**first, "final_odometer_km": "105.1"}
    assert canonical_payload_sha256(changed) != canonical_payload_sha256(first)
    assert first["final_odometer_km"] == "105.0"
    assert first["schema_version"] == "possession-return-confirmation.v1"


@pytest.mark.asyncio
async def test_backend_rejects_unchecked_declaration_without_mutation():
    possession = _possession()
    service = _service(possession)
    with pytest.raises(HTTPException) as exc:
        await service.end(
            possession.id,
            PossessionEndWithConfirmation(
                end_date=datetime.now(timezone.utc),
                end_odometer_km=105,
                vehicle_condition_notes="Sem ressalvas",
                declaration_accepted=False,
            ),
            _user(),
        )
    assert exc.value.status_code == 422
    assert exc.value.detail["code"] == "RETURN_DECLARATION_REQUIRED"
    assert possession.end_date is None
    service.confirmations.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_confirmation_and_end_share_one_commit_and_audit_has_no_binary():
    possession = _possession()
    service = _service(possession)
    confirmation = await service.end(
        possession.id,
        PossessionEndWithConfirmation(
            end_date=datetime.now(timezone.utc),
            end_odometer_km=105,
            vehicle_condition_notes="Sem ressalvas",
            declaration_accepted=True,
        ),
        _user(),
    )
    assert possession.end_date is not None
    assert possession.end_odometer_km == 105.0
    assert confirmation.version == 1 and confirmation.is_current is True
    service.db.commit.assert_awaited_once()
    assert service.audit.record.await_count == 2
    for call in service.audit.record.await_args_list:
        details = call.kwargs["details"]
        assert not any(isinstance(value, bytes) for value in details.values())


@pytest.mark.asyncio
async def test_failure_rolls_back_possession_and_confirmation_transaction():
    possession = _possession()
    service = _service(possession)
    service.confirmations.create.side_effect = RuntimeError("falha controlada")
    with pytest.raises(RuntimeError):
        await service.end(
            possession.id,
            PossessionEndWithConfirmation(
                end_date=datetime.now(timezone.utc),
                end_odometer_km=105,
                vehicle_condition_notes="Sem ressalvas",
                declaration_accepted=True,
            ),
            _user(),
        )
    service.db.rollback.assert_awaited_once()
    service.db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_concurrent_confirmation_conflict_is_reported_without_second_commit():
    possession = _possession()
    service = _service(possession)
    service.confirmations.create.side_effect = IntegrityError("insert", {}, Exception("unique current"))
    with pytest.raises(HTTPException) as exc:
        await service.end(
            possession.id,
            PossessionEndWithConfirmation(
                end_date=datetime.now(timezone.utc),
                end_odometer_km=105,
                vehicle_condition_notes="Sem ressalvas",
                declaration_accepted=True,
            ),
            _user(),
        )
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == "RETURN_CONFIRMATION_CONFLICT"
    service.db.rollback.assert_awaited_once()
    service.db.commit.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_correction_supersedes_without_changing_previous_payload():
    possession = _possession(ended=True)
    service = _service(possession)
    previous = SimpleNamespace(
        id=uuid4(), version=1, is_current=True, canonical_payload_hash="a" * 64,
        superseded_at=None, superseded_by_confirmation_id=None,
    )
    service.confirmations.get_current = AsyncMock(return_value=previous)
    service.confirmations.next_version = AsyncMock(return_value=2)
    confirmation = await service.correct(
        possession.id,
        PossessionReturnCorrection(
            end_odometer_km=106,
            vehicle_condition_notes="Ressalva corrigida",
            correction_reason="Correção após conferência administrativa",
            declaration_accepted=True,
        ),
        _user(),
    )
    assert previous.is_current is False
    assert previous.superseded_by_confirmation_id == confirmation.id
    assert previous.canonical_payload_hash == "a" * 64
    assert confirmation.version == 2
    assert confirmation.admin_correction_reason.startswith("Correção")


@pytest.mark.asyncio
async def test_full_pdf_download_is_forbidden_to_standard_role_before_querying_data():
    service = PossessionTermPdfService(AsyncMock())
    with pytest.raises(HTTPException) as exc:
        await service.render(uuid4(), disposition="attachment", current_user=_user(UserRole.PADRAO))
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "POSSESSION_TERM_FULL_DOWNLOAD_FORBIDDEN"


@pytest.mark.asyncio
async def test_standard_return_context_masks_confirmer_identity():
    possession = _possession(ended=True)
    service = _service(possession)
    current = SimpleNamespace(
        id=uuid4(), version=1, is_current=True, declaration_version=DECLARATION_VERSION,
        declaration_text=DECLARATION_TEXT, canonical_payload_hash="c" * 64,
        confirmer_name="Nome administrativo restrito", confirmer_role="ADMIN",
        confirmed_at=datetime.now(timezone.utc), final_odometer_km=Decimal("105.0"),
        vehicle_condition_notes="Sem ressalvas", last_trip_id=None, superseded_at=None,
        superseded_by_confirmation_id=None, admin_correction_reason=None,
    )
    service.confirmations.get_current = AsyncMock(return_value=current)
    context = await service.get_context(possession.id, _user(UserRole.PADRAO))
    assert context["current_confirmation"]["confirmer_name"] == "Usuário autenticado (dados restritos)"


def test_pdf_contains_official_structure_and_omits_technical_metadata():
    possession = _possession(ended=True)
    confirmation = SimpleNamespace(
        version=1,
        is_current=True,
        confirmer_name="Usuário de teste",
        confirmer_role="ADMIN",
        confirmed_at=datetime.now(timezone.utc),
        final_odometer_km=Decimal("105.0"),
        vehicle_condition_notes="Sem ressalvas",
        canonical_payload_hash="b" * 64,
        declaration_version=DECLARATION_VERSION,
        declaration_text=DECLARATION_TEXT,
    )
    possession.return_confirmations = [confirmation]
    pdf = PossessionTermPdfService(AsyncMock())._build_pdf(possession, include_personal=False)
    assert pdf.startswith(b"%PDF-")
    assert len(pdf) > 1500
    assert b"127.0.0.1" not in pdf
    assert b"phase5-request" not in pdf
    assert NO_CACHE_HEADERS["Cache-Control"].startswith("private, no-store")


def test_active_and_legacy_possessions_generate_without_fabricating_confirmation():
    service = PossessionTermPdfService(AsyncMock())
    active = _possession(ended=False)
    legacy = _possession(ended=True)
    assert service._build_pdf(active, include_personal=True).startswith(b"%PDF-")
    assert service._build_pdf(legacy, include_personal=False).startswith(b"%PDF-")


def test_pdf_receives_routes_and_destinations_in_persisted_sequence_order():
    possession = _possession(ended=False)
    possession.trips = [
        SimpleNamespace(
            sequence_number=1,
            status="ENCERRADA",
            origin="Garagem",
            purpose="Rota de teste",
            departure_at=datetime.now(timezone.utc) - timedelta(hours=1),
            return_at=datetime.now(timezone.utc),
            start_odometer_km=Decimal("100.0"),
            end_odometer_km=Decimal("101.0"),
            destinations=[
                SimpleNamespace(sequence_number=1, description="Primeiro destino", address_reference=None, arrived_at=None, departed_at=None),
                SimpleNamespace(sequence_number=2, description="Segundo destino", address_reference=None, arrived_at=None, departed_at=None),
            ],
        )
    ]
    service = PossessionTermPdfService(AsyncMock())
    captured = []
    original = service._destination_table

    def capture(rows, styles):
        captured.extend(rows[1:])
        return original(rows, styles)

    service._destination_table = capture
    assert service._build_pdf(possession, include_personal=True).startswith(b"%PDF-")
    assert [row[0] for row in captured] == ["1", "2"]
    assert [row[1] for row in captured] == ["Primeiro destino", "Segundo destino"]


@pytest.mark.asyncio
async def test_masked_preview_is_generated_and_audited_for_standard_role():
    possession = _possession(ended=True)
    possession.return_confirmations = []
    service = PossessionTermPdfService(AsyncMock())
    service.possessions.get_term_graph = AsyncMock(return_value=possession)
    service.audit.record = AsyncMock()
    service._build_pdf = lambda record, include_personal: b"%PDF-masked" if not include_personal else b"%PDF-full"
    service_visibility = AsyncMock()
    original = PossessionTermPdfService.render.__globals__["PossessionService"]._ensure_possession_visible_to_user
    PossessionTermPdfService.render.__globals__["PossessionService"]._ensure_possession_visible_to_user = service_visibility
    try:
        content, filename = await service.render(possession.id, disposition="inline", current_user=_user(UserRole.PADRAO))
    finally:
        PossessionTermPdfService.render.__globals__["PossessionService"]._ensure_possession_visible_to_user = original
    assert content == b"%PDF-masked"
    assert filename == "termo-posse-123.pdf"
    assert service.audit.record.await_args.kwargs["action"] == "TERM_PREVIEW"
    assert service.audit.record.await_args.kwargs["details"]["masked"] is True
    service.db.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_pdf_route_applies_protected_no_cache_headers(monkeypatch):
    class FakePdfService:
        def __init__(self, _db):
            pass

        async def render(self, *_args, **_kwargs):
            return b"%PDF-test", "termo-posse-123.pdf"

    monkeypatch.setattr(possession_routes, "PossessionTermPdfService", FakePdfService)
    response = await possession_routes.get_official_possession_term(
        uuid4(),
        disposition="inline",
        db=AsyncMock(),
        current_user=_user(),
    )
    assert response.media_type == "application/pdf"
    assert response.headers["cache-control"].startswith("private, no-store")
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"].startswith("inline;")
