from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi import HTTPException
from reportlab.pdfbase import pdfmetrics
from reportlab.platypus import KeepTogether, Paragraph, Spacer, Table
from sqlalchemy.exc import IntegrityError

from app.models.user import UserRole
from app.core.official_identity import MUNICIPALITY_CNPJ, MUNICIPALITY_NAME, crest_path, ensure_pdf_fonts
from app.core.possession_responsibility import RESPONSIBILITY_ACCEPTANCE_TEXT, RESPONSIBILITY_ACCEPTANCE_VERSION
from app.schemas.possession_return import PossessionEndWithConfirmation, PossessionReturnCorrection
from app.services.possession_return_service import (
    DECLARATION_TEXT,
    DECLARATION_VERSION,
    PossessionReturnService,
    build_canonical_return_payload,
    canonical_payload_sha256,
)
from app.services.possession_term_pdf_service import NO_CACHE_HEADERS, PossessionTermPdfService
from app.services import possession_term_pdf_service as term_pdf_module
from app.api.routes import possession as possession_routes


def _user(role=UserRole.ADMIN):
    return SimpleNamespace(
        id=uuid4(),
        name="Usuário de teste",
        email="usuario@example.test",
        role=role,
        organization_id=None,
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
    confirmation = context["current_confirmation"]
    assert context["driver_name"] == "Identidade protegida"
    assert context["last_trip_id"] is None
    assert confirmation["id"] is None
    assert confirmation["confirmer_name"] == "Identidade protegida"
    assert confirmation["confirmer_role"] is None
    assert confirmation["canonical_payload_hash"] is None
    assert confirmation["vehicle_condition_notes"] is None
    assert confirmation["last_trip_id"] is None
    assert confirmation["superseded_by_confirmation_id"] is None
    assert confirmation["admin_correction_reason"] is None


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


def test_pdf_embeds_municipal_crest_and_uses_final_institutional_copy(monkeypatch):
    possession = _possession(ended=False)
    captured_text = []
    original_paragraph = term_pdf_module.Paragraph

    def capture_paragraph(text, *args, **kwargs):
        captured_text.append(str(text))
        return original_paragraph(text, *args, **kwargs)

    monkeypatch.setattr(term_pdf_module, "Paragraph", capture_paragraph)
    pdf = PossessionTermPdfService(AsyncMock())._build_pdf(possession, include_personal=True)
    rendered_copy = " ".join(captured_text)
    lowered = rendered_copy.casefold()

    assert crest_path().stat().st_size > 10_000
    assert b"/Subtype /Image" in pdf
    assert b"/FontFile2" in pdf
    assert MUNICIPALITY_NAME.upper() in rendered_copy
    assert MUNICIPALITY_CNPJ in rendered_copy
    assert RESPONSIBILITY_ACCEPTANCE_TEXT in rendered_copy
    assert "Pessoa responsável pela condução" in rendered_copy
    assert "evidência(s)" not in rendered_copy
    assert "destino(s)" not in rendered_copy
    for prohibited in ("gerado pelo backend", "estado persistido", "metadados técnicos", "fluxo atual", "controles de acesso"):
        assert prohibited not in lowered


def test_embedded_roboto_fonts_cover_extended_latin_names():
    regular, bold = ensure_pdf_fonts()

    for font_name in (regular, bold):
        glyphs = pdfmetrics.getFont(font_name).face.charToGlyph
        for character in "ȘșČŁãç":
            assert ord(character) in glyphs

    possession = _possession(ended=False)
    possession.driver_name = "Ștefan Ioniță Čapek Łukasz"
    pdf = PossessionTermPdfService(AsyncMock())._build_pdf(possession, include_personal=True)
    assert b"/FontFile2" in pdf
    assert b"/ToUnicode" in pdf


def test_signature_date_and_physical_lines_are_kept_on_the_same_page():
    service = PossessionTermPdfService(AsyncMock())
    regular, bold = ensure_pdf_fonts()
    styles = service._styles(font_regular=regular, font_bold=bold)
    story = service._signature_story(
        _possession(ended=False),
        signature_summary=None,
        include_personal=True,
        styles=styles,
    )

    block = next(item for item in reversed(story) if isinstance(item, KeepTogether))
    assert len(block._content) == 3
    assert isinstance(block._content[0], Paragraph)
    assert block._content[0].getPlainText().startswith("Teixeira de Freitas - BA")
    assert isinstance(block._content[1], Spacer)
    assert isinstance(block._content[2], Table)


def test_signature_section_heading_is_kept_with_declaration_and_status():
    service = PossessionTermPdfService(AsyncMock())
    regular, bold = ensure_pdf_fonts()
    styles = service._styles(font_regular=regular, font_bold=bold)
    story = service._signature_story(
        _possession(ended=False),
        signature_summary=None,
        include_personal=True,
        styles=styles,
    )

    block = story[0]
    assert isinstance(block, KeepTogether)
    assert isinstance(block._content[0], Paragraph)
    assert block._content[0].getPlainText() == "6. Assinaturas e ciência"
    assert isinstance(block._content[1], Paragraph)
    assert block._content[1].getPlainText().startswith("Declaração de ciência")
    assert isinstance(block._content[-1], Table)


def test_masked_pdf_does_not_render_route_locations(monkeypatch):
    possession = _possession(ended=False)
    possession.trips = [
        SimpleNamespace(
            sequence_number=1,
            status="EM_ANDAMENTO",
            origin="Endereço operacional secreto",
            purpose="Finalidade reservada",
            departure_at=datetime.now(timezone.utc),
            return_at=None,
            start_odometer_km=Decimal("100.0"),
            end_odometer_km=None,
            cancellation_reason=None,
            destinations=[
                SimpleNamespace(
                    sequence_number=1,
                    description="Destino reservado",
                    address_reference="Rua sigilosa, 123",
                    arrived_at=None,
                    departed_at=None,
                )
            ],
        )
    ]
    captured_text = []
    original_paragraph = term_pdf_module.Paragraph

    def capture_paragraph(text, *args, **kwargs):
        captured_text.append(str(text))
        return original_paragraph(text, *args, **kwargs)

    monkeypatch.setattr(term_pdf_module, "Paragraph", capture_paragraph)
    PossessionTermPdfService(AsyncMock())._build_pdf(possession, include_personal=False)
    rendered_copy = " ".join(captured_text)
    assert "localização protegida" in rendered_copy
    assert "Endereço operacional secreto" not in rendered_copy
    assert "Finalidade reservada" not in rendered_copy
    assert "Destino reservado" not in rendered_copy
    assert "Rua sigilosa" not in rendered_copy


def test_completed_electronic_acceptance_is_printed_with_its_hash(monkeypatch):
    possession = _possession(ended=False)
    signed_at = datetime.now(timezone.utc)
    summary = {
        "document_id": uuid4(),
        "status": "COMPLETED",
        "content_hash": "a" * 64,
        "signed_count": 1,
        "required_signatures": 1,
        "snapshot": {
            "acceptance": {
                "version": RESPONSIBILITY_ACCEPTANCE_VERSION,
                "text": RESPONSIBILITY_ACCEPTANCE_TEXT,
            }
        },
        "signatures": [
            {
                "signer_name": "Servidor responsável",
                "signer_role": "PRODUCAO",
                "signer_organization_name": "Secretaria Municipal",
                "signer_cpf_masked": "123.***.***-01",
                "signature_fingerprint": "b" * 64,
                "signed_at": signed_at,
            }
        ],
    }
    captured_text = []
    original_paragraph = term_pdf_module.Paragraph

    def capture_paragraph(text, *args, **kwargs):
        captured_text.append(str(text))
        return original_paragraph(text, *args, **kwargs)

    monkeypatch.setattr(term_pdf_module, "Paragraph", capture_paragraph)
    PossessionTermPdfService(AsyncMock())._build_pdf(
        possession,
        include_personal=True,
        signature_summary=summary,
    )
    rendered_copy = " ".join(captured_text)
    assert "Servidor responsável" in rendered_copy
    assert "Situação do registro eletrônico" in rendered_copy
    assert "Concluída" in rendered_copy
    assert "Código de integridade do conteúdo assinado" in rendered_copy
    assert "a" * 16 in rendered_copy
    assert "b" * 16 in rendered_copy


def test_masked_pdf_hides_signature_people_and_technical_identifiers(monkeypatch):
    possession = _possession(ended=False)
    summary = {
        "status": "COMPLETED",
        "content_hash": "a" * 64,
        "signed_count": 1,
        "required_signatures": 1,
        "signatures": [
            {
                "signer_name": "Nome restrito",
                "signer_role": "ADMIN",
                "signer_organization_name": "Unidade restrita",
                "signer_cpf_masked": "123.***.***-01",
                "signature_fingerprint": "b" * 64,
                "signed_at": datetime.now(timezone.utc),
            }
        ],
    }
    captured_text = []
    original_paragraph = term_pdf_module.Paragraph

    def capture_paragraph(text, *args, **kwargs):
        captured_text.append(str(text))
        return original_paragraph(text, *args, **kwargs)

    monkeypatch.setattr(term_pdf_module, "Paragraph", capture_paragraph)
    PossessionTermPdfService(AsyncMock())._build_pdf(
        possession,
        include_personal=False,
        signature_summary=summary,
    )
    rendered_copy = " ".join(captured_text)
    assert "Concluída" in rendered_copy
    assert "Nome restrito" not in rendered_copy
    assert "Unidade restrita" not in rendered_copy
    assert "Código de registro da assinatura" not in rendered_copy
    assert "b" * 16 not in rendered_copy
    assert "a" * 16 not in rendered_copy


def test_masked_pdf_protects_driver_and_all_free_text_fields(monkeypatch):
    possession = _possession(ended=True)
    possession.driver_name = "Nome pessoal restrito"
    possession.observation = "Observação com telefone 75999999999"
    possession.trips = [
        SimpleNamespace(
            sequence_number=1,
            status="CANCELADA",
            origin="Origem restrita",
            purpose="Finalidade restrita",
            departure_at=datetime.now(timezone.utc),
            return_at=None,
            start_odometer_km=Decimal("100"),
            end_odometer_km=None,
            cancellation_reason="Justificativa com pessoa identificável",
            destinations=[],
        )
    ]
    possession.return_confirmations = [
        SimpleNamespace(
            version=1,
            is_current=True,
            confirmer_name="Confirmador restrito",
            confirmer_role="ADMIN",
            confirmed_at=datetime.now(timezone.utc),
            final_odometer_km=Decimal("105"),
            vehicle_condition_notes="Condições com endereço pessoal restrito",
            canonical_payload_hash="c" * 64,
            declaration_version=DECLARATION_VERSION,
            declaration_text=DECLARATION_TEXT,
        )
    ]
    captured_text = []
    original_paragraph = term_pdf_module.Paragraph

    def capture_paragraph(text, *args, **kwargs):
        captured_text.append(str(text))
        return original_paragraph(text, *args, **kwargs)

    monkeypatch.setattr(term_pdf_module, "Paragraph", capture_paragraph)
    PossessionTermPdfService(AsyncMock())._build_pdf(possession, include_personal=False)
    rendered_copy = " ".join(captured_text)

    for restricted in (
        "Nome pessoal restrito",
        "75999999999",
        "Justificativa com pessoa identificável",
        "Condições com endereço pessoal restrito",
        "Confirmador restrito",
    ):
        assert restricted not in rendered_copy
    assert "Identidade protegida" in rendered_copy
    assert "Conteúdo protegido nesta via" in rendered_copy


def test_legacy_end_without_versioned_confirmation_prints_persisted_facts(monkeypatch):
    possession = _possession(ended=True)
    captured_text = []
    original_paragraph = term_pdf_module.Paragraph

    def capture_paragraph(text, *args, **kwargs):
        captured_text.append(str(text))
        return original_paragraph(text, *args, **kwargs)

    monkeypatch.setattr(term_pdf_module, "Paragraph", capture_paragraph)
    PossessionTermPdfService(AsyncMock())._build_pdf(possession, include_personal=True)
    rendered_copy = " ".join(captured_text)

    assert "Encerramento administrativo" in rendered_copy
    assert term_pdf_module._fmt_datetime(possession.end_date) in rendered_copy
    assert "105,0 km" in rendered_copy


def test_multipage_term_with_unicode_routes_and_signatures_keeps_document_structure():
    possession = _possession(ended=True)
    possession.driver_name = "João Łukasz Șerban"
    possession.observation = "Registro administrativo extenso. " * 40
    possession.trips = [
        SimpleNamespace(
            sequence_number=index,
            status="ENCERRADA",
            origin=f"Origem institucional {index}",
            purpose=f"Atendimento público {index}",
            departure_at=datetime.now(timezone.utc) - timedelta(hours=2),
            return_at=datetime.now(timezone.utc) - timedelta(hours=1),
            start_odometer_km=Decimal(100 + index),
            end_odometer_km=Decimal(101 + index),
            cancellation_reason=None,
            destinations=[
                SimpleNamespace(
                    sequence_number=destination,
                    description=f"Destino {index}.{destination}",
                    address_reference=f"Referência administrativa {destination}",
                    arrived_at=datetime.now(timezone.utc),
                    departed_at=datetime.now(timezone.utc),
                )
                for destination in range(1, 4)
            ],
        )
        for index in range(1, 31)
    ]
    possession.return_confirmations = [
        SimpleNamespace(
            version=1,
            is_current=True,
            confirmer_name="Agente responsável",
            confirmer_role="ADMIN",
            confirmed_at=datetime.now(timezone.utc),
            final_odometer_km=Decimal("150"),
            vehicle_condition_notes="Condições administrativas registradas. " * 80,
            canonical_payload_hash="c" * 64,
            declaration_version=DECLARATION_VERSION,
            declaration_text=DECLARATION_TEXT,
        )
    ]
    summary = {
        "status": "COMPLETED",
        "content_hash": "a" * 64,
        "signed_count": 4,
        "required_signatures": 4,
        "snapshot": {
            "acceptance": {
                "version": RESPONSIBILITY_ACCEPTANCE_VERSION,
                "text": RESPONSIBILITY_ACCEPTANCE_TEXT,
            }
        },
        "signatures": [
            {
                "signer_name": f"Agente público {index}",
                "signer_role": "PRODUCAO",
                "signer_organization_name": "Setor de Frotas",
                "signer_cpf_masked": "123.***.***-01",
                "signature_fingerprint": str(index) * 64,
                "signed_at": datetime.now(timezone.utc),
            }
            for index in range(1, 5)
        ],
    }

    pdf = PossessionTermPdfService(AsyncMock())._build_pdf(
        possession,
        include_personal=True,
        signature_summary=summary,
    )
    page_count = len(re.findall(rb"/Type\s*/Page\b", pdf))

    assert page_count >= 4
    assert b"/FontFile2" in pdf
    assert b"/Subtype /Image" in pdf


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
    service.signatures.get_validated_summary_for_source = AsyncMock(return_value={
        "document_id": None,
        "status": "UNSIGNED",
        "signatures": [],
    })
    service.signatures.lock_source_for_consistent_read = AsyncMock()
    service.audit.record = AsyncMock()
    service._build_pdf = lambda record, include_personal, signature_summary=None: b"%PDF-masked" if not include_personal else b"%PDF-full"
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
async def test_pdf_render_uses_only_the_fresh_graph_loaded_after_source_lock():
    stale = _possession(ended=False)
    fresh = _possession(ended=True)
    fresh.id = stale.id
    fresh.public_number = stale.public_number
    service = PossessionTermPdfService(AsyncMock())
    service.possessions.get_term_graph = AsyncMock(side_effect=[stale, fresh])
    service.signatures.lock_source_for_consistent_read = AsyncMock()
    service.signatures.get_validated_summary_for_source = AsyncMock(
        return_value={"document_id": None, "status": "UNSIGNED", "signatures": []}
    )
    service.audit.record = AsyncMock()
    captured = []
    service._build_pdf = lambda record, **_kwargs: captured.append(record) or b"%PDF-fresh"
    visibility = AsyncMock()
    original = PossessionTermPdfService.render.__globals__["PossessionService"]._ensure_possession_visible_to_user
    PossessionTermPdfService.render.__globals__["PossessionService"]._ensure_possession_visible_to_user = visibility
    try:
        content, _ = await service.render(stale.id, disposition="inline", current_user=_user(UserRole.ADMIN))
    finally:
        PossessionTermPdfService.render.__globals__["PossessionService"]._ensure_possession_visible_to_user = original

    assert content == b"%PDF-fresh"
    assert captured == [fresh]
    assert service.possessions.get_term_graph.await_args_list[1].kwargs == {"populate_existing": True}
    assert visibility.await_count == 2


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
