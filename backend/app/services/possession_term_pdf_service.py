from __future__ import annotations

from datetime import datetime, timezone
from html import escape
from io import BytesIO
from uuid import UUID

from fastapi import HTTPException, status
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    LongTable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.official_identity import (
    ADMINISTRATION_SECRETARIAT,
    COLOR_BORDER,
    COLOR_INK,
    COLOR_MUTED,
    COLOR_NAVY,
    COLOR_SURFACE,
    FLEET_DEPARTMENT,
    MUNICIPALITY_ADDRESS,
    MUNICIPALITY_CNPJ,
    MUNICIPALITY_NAME,
    crest_path,
    ensure_pdf_fonts,
    institutional_datetime,
)
from app.core.possession_responsibility import (
    RESPONSIBILITY_ACCEPTANCE_TEXT,
    RESPONSIBILITY_ACCEPTANCE_VERSION,
    RESPONSIBILITY_TERM_MODEL_VERSION,
)
from app.models.document_signature import DigitalDocumentType
from app.models.user import User, UserRole
from app.repositories.possession_repository import PossessionRepository
from app.services.audit_service import AuditService
from app.services.document_signature_service import DocumentSignatureService
from app.services.possession_service import PossessionService


TERM_VERSION = RESPONSIBILITY_TERM_MODEL_VERSION
NO_CACHE_HEADERS = {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
}


def _fmt_datetime(value: datetime | None) -> str:
    if value is None:
        return "—"
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    local = institutional_datetime(aware)
    return local.strftime("%d/%m/%Y às %H:%M")


def _fmt_date(value: datetime | None) -> str:
    if value is None:
        return "—"
    aware = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return institutional_datetime(aware).strftime("%d/%m/%Y")


def _fmt_odometer(value) -> str:
    if value is None:
        return "—"
    return f"{float(value):,.1f} km".replace(",", "X").replace(".", ",").replace("X", ".")


def _masked_document(value: str | None) -> str:
    if not value:
        return "—"
    digits = "".join(character for character in value if character.isdigit())
    if len(digits) <= 4:
        return "***"
    return f"{digits[:3]}.***.***-{digits[-2:]}"


def _status_label(status_value) -> str:
    value = getattr(status_value, "value", status_value)
    return {
        "EM_ANDAMENTO": "Em andamento",
        "ENCERRADA": "Encerrada",
        "CANCELADA": "Cancelada",
    }.get(str(value), str(value))


def _role_label(role_value) -> str:
    value = getattr(role_value, "value", role_value)
    return {
        "ADMIN": "Administração",
        "PRODUCAO": "Operação da frota",
        "PADRAO": "Consulta institucional",
        "POSTO": "Posto de abastecimento",
    }.get(str(value), "Servidor público")


def _signature_status_label(status_value) -> str:
    return {
        "COMPLETED": "Concluída",
        "PENDING": "Pendente",
        "SUPERSEDED": "Substituída",
        "CANCELLED": "Cancelada",
        "UNSIGNED": "Não emitida",
    }.get(str(status_value or "UNSIGNED"), "Não emitida")


def _count_label(count: int, singular: str, plural: str) -> str:
    return f"{count} {singular if count == 1 else plural}"


def _break_identifier(value: str | None) -> str:
    if not value:
        return "—"
    return " ".join(value[index:index + 16] for index in range(0, len(value), 16))


class PossessionTermPdfService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
        self.signatures = DocumentSignatureService(db)
        self.audit = AuditService(db)

    async def render(
        self,
        possession_id: UUID,
        *,
        disposition: str,
        current_user: User,
    ) -> tuple[bytes, str]:
        if disposition not in {"inline", "attachment"}:
            raise HTTPException(status_code=422, detail="Disposição do PDF inválida")
        if disposition == "attachment" and current_user.role not in {UserRole.ADMIN, UserRole.PRODUCAO}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "POSSESSION_TERM_FULL_DOWNLOAD_FORBIDDEN",
                    "message": "Seu perfil permite somente a consulta mascarada do termo.",
                },
            )

        precheck = await self.possessions.get_term_graph(possession_id)
        if precheck is None:
            raise HTTPException(status_code=404, detail="Registro de posse não encontrado")
        possession_service = PossessionService(self.db)
        await possession_service._ensure_possession_visible_to_user(precheck, current_user)
        include_personal = current_user.role in {UserRole.ADMIN, UserRole.PRODUCAO}
        await self.signatures.lock_source_for_consistent_read(
            DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            possession_id,
            current_user=current_user,
        )
        signature_summary = await self.signatures.get_validated_summary_for_source(
            DigitalDocumentType.POSSESSION_RESPONSIBILITY_TERM,
            possession_id,
            current_user=current_user,
            supersede_stale=include_personal,
            source_is_locked=True,
        )
        possession = await self.possessions.get_term_graph(
            possession_id,
            populate_existing=True,
        )
        if possession is None:
            raise HTTPException(status_code=404, detail="Registro de posse não encontrado")
        await possession_service._ensure_possession_visible_to_user(possession, current_user)
        pdf = self._build_pdf(
            possession,
            include_personal=include_personal,
            signature_summary=signature_summary,
        )
        action = "TERM_DOWNLOAD" if disposition == "attachment" else "TERM_PREVIEW"
        current_confirmation = self._current_confirmation(possession)
        await self.audit.record(
            actor=current_user,
            action=action,
            entity_type="POSSESSION",
            entity_id=possession.id,
            entity_label=f"Posse {possession.public_number}",
            details={
                "term_version": TERM_VERSION,
                "result": "SUCCESS",
                "masked": not include_personal,
                "confirmation_version": current_confirmation.version if current_confirmation else None,
                "signature_document_id": (
                    str(signature_summary["document_id"])
                    if signature_summary.get("document_id")
                    else None
                ),
                "signature_status": signature_summary.get("status"),
            },
        )
        await self.db.commit()
        filename = f"termo-posse-{possession.public_number}.pdf"
        return pdf, filename

    def _build_pdf(
        self,
        possession,
        *,
        include_personal: bool,
        signature_summary: dict | None = None,
    ) -> bytes:
        output = BytesIO()
        font_regular, font_bold = ensure_pdf_fonts()
        generated_at = datetime.now(timezone.utc)
        document = SimpleDocTemplate(
            output,
            pagesize=A4,
            rightMargin=17 * mm,
            leftMargin=17 * mm,
            topMargin=20 * mm,
            bottomMargin=22 * mm,
            title=f"Termo de Posse e Responsabilidade nº {possession.public_number}",
            author=MUNICIPALITY_NAME,
            subject="Registro oficial de entrega, responsabilidade, rotas e devolução de veículo",
        )
        styles = self._styles(font_regular=font_regular, font_bold=font_bold)
        status_text = "Em andamento" if possession.end_date is None else "Encerrada"

        story = [
            self._institutional_header(styles),
            Spacer(1, 4 * mm),
            Paragraph("TERMO DE POSSE E RESPONSABILIDADE DE VEÍCULO", styles["TermTitle"]),
            self._control_table(
                term_number=possession.public_number,
                status_text=status_text,
                generated_at=generated_at,
                styles=styles,
            ),
            Spacer(1, 4 * mm),
            Paragraph(
                "Por este instrumento, o Município de Teixeira de Freitas registra a entrega do veículo "
                "abaixo identificado à pessoa responsável pela condução, para utilização exclusiva no interesse "
                "do serviço público, sob os deveres de guarda, conservação e correta utilização.",
                styles["BodyCompact"],
            ),
        ]
        if not include_personal:
            story.extend(
                [
                    Spacer(1, 2 * mm),
                    Paragraph(
                        "Classificação desta via: consulta com dados pessoais e localização protegidos.",
                        styles["PrivacyNote"],
                    ),
                ]
            )

        vehicle_name = " ".join(filter(None, [possession.vehicle.brand, possession.vehicle.model])).strip()
        driver_document = possession.driver_document if include_personal else _masked_document(possession.driver_document)
        driver_contact = possession.driver_contact if include_personal else "Informação protegida"
        driver_name = possession.driver_name if include_personal else "Identidade protegida"
        observation = (
            possession.observation or "Sem observações registradas"
            if include_personal
            else "Conteúdo protegido nesta via" if possession.observation else "Sem observações registradas"
        )
        story.extend(
            [
                Paragraph("1. Identificação da posse", styles["Section"]),
                self._key_value_table(
                    [
                        ("Número da posse", str(possession.public_number)),
                        ("Situação", status_text),
                        ("Veículo", f"{possession.vehicle.plate} · {vehicle_name or '—'}"),
                        ("Responsável pela condução", driver_name),
                        ("Documento", driver_document or "—"),
                        ("Contato", driver_contact or "—"),
                    ],
                    styles,
                ),
                Paragraph("2. Entrega e responsabilidade", styles["Section"]),
                self._key_value_table(
                    [
                        ("Data e hora da entrega", _fmt_datetime(possession.start_date)),
                        ("Hodômetro inicial", _fmt_odometer(possession.start_odometer_km)),
                        ("Observação", observation),
                        (
                            "Registros fotográficos",
                            _count_label(
                                len(possession.photos),
                                "evidência vinculada à entrega",
                                "evidências vinculadas à entrega",
                            ),
                        ),
                    ],
                    styles,
                ),
                Spacer(1, 2 * mm),
                Paragraph(
                    "A pessoa responsável pela condução declara receber o veículo nas condições registradas e "
                    "compromete-se "
                    "a utilizá-lo exclusivamente para fins institucionais, observar a legislação de trânsito, "
                    "zelar por sua guarda e conservação e comunicar prontamente qualquer dano, avaria, infração "
                    "ou ocorrência verificada durante o período de posse.",
                    styles["BodyCompact"],
                ),
                Paragraph("3. Rotas e destinos", styles["Section"]),
            ]
        )
        self._append_trips(story, possession, include_personal=include_personal, styles=styles)

        current = self._current_confirmation(possession)
        return_heading = Paragraph("4. Devolução do veículo", styles["Section"])
        if current:
            confirmer = current.confirmer_name if include_personal else "Identidade protegida"
            return_rows = [
                ("Data e hora da devolução", _fmt_datetime(possession.end_date)),
                ("Hodômetro final", _fmt_odometer(current.final_odometer_km)),
                ("Responsável pela confirmação", f"{confirmer} · {_role_label(current.confirmer_role)}"),
                ("Registro da confirmação", f"Versão {current.version} · {_fmt_datetime(current.confirmed_at)}"),
            ]
            if include_personal:
                return_rows.append(("Código de integridade", _break_identifier(current.canonical_payload_hash)))
            story.extend(
                [
                    KeepTogether(
                        [
                            return_heading,
                            self._key_value_table(return_rows, styles),
                        ]
                    ),
                    Spacer(1, 3 * mm),
                    Paragraph("<b>Condições informadas na devolução</b>", styles["BodyCompact"]),
                    Paragraph(
                        (
                            escape(current.vehicle_condition_notes).replace("\n", "<br/>")
                            if include_personal
                            else "Conteúdo protegido nesta via."
                        ),
                        styles["BodyCompact"],
                    ),
                    Spacer(1, 3 * mm),
                    Paragraph(
                        f"<b>Declaração de devolução · versão {escape(current.declaration_version)}</b>"
                        f"<br/>{escape(current.declaration_text)}",
                        styles["Declaration"],
                    ),
                ]
            )
        elif possession.end_date is not None:
            story.extend(
                [
                    KeepTogether(
                        [
                            return_heading,
                            self._key_value_table(
                                [
                                    ("Situação", "Encerramento administrativo"),
                                    ("Data e hora do encerramento", _fmt_datetime(possession.end_date)),
                                    ("Hodômetro final", _fmt_odometer(possession.end_odometer_km)),
                                ],
                                styles,
                            ),
                        ]
                    ),
                    Spacer(1, 3 * mm),
                    Paragraph(
                        "Os comprovantes arquivados à época permanecem válidos para a composição do "
                        "histórico documental.",
                        styles["BodyCompact"],
                    ),
                ]
            )
        else:
            story.append(
                KeepTogether(
                    [
                        return_heading,
                        Paragraph(
                            "A posse permanece vigente na data de emissão deste termo. O registro da devolução será "
                            "incorporado a este documento quando o veículo for formalmente restituído.",
                            styles["BodyCompact"],
                        ),
                    ]
                )
            )

        story.append(
            KeepTogether(
                [
                    Paragraph("5. Declaração de responsabilidade", styles["Section"]),
                    Paragraph(
                        "A pessoa responsável pela condução reconhece que a utilização do veículo está vinculada às "
                        "atividades institucionais autorizadas e que a entrega, as movimentações e a devolução "
                        "registradas neste termo integram o histórico administrativo da posse.",
                        styles["BodyCompact"],
                    ),
                ]
            )
        )
        story.extend(
            self._signature_story(
                possession,
                signature_summary=signature_summary,
                include_personal=include_personal,
                styles=styles,
            )
        )

        generated_label = _fmt_datetime(generated_at)

        def footer(canvas, doc):
            canvas.saveState()
            if doc.page > 1:
                canvas.setFillColor(colors.HexColor(COLOR_NAVY))
                canvas.setFont(font_bold, 7.2)
                canvas.drawString(17 * mm, A4[1] - 12 * mm, MUNICIPALITY_NAME.upper())
                canvas.setFont(font_regular, 7.2)
                canvas.drawRightString(
                    A4[0] - 17 * mm,
                    A4[1] - 12 * mm,
                    f"TERMO DE POSSE Nº {possession.public_number} · CONTINUAÇÃO",
                )
                canvas.setStrokeColor(colors.HexColor(COLOR_NAVY))
                canvas.setLineWidth(0.45)
                canvas.line(17 * mm, A4[1] - 15 * mm, A4[0] - 17 * mm, A4[1] - 15 * mm)
            canvas.setStrokeColor(colors.HexColor(COLOR_NAVY))
            canvas.setLineWidth(0.5)
            canvas.line(17 * mm, 16 * mm, A4[0] - 17 * mm, 16 * mm)
            canvas.setFillColor(colors.HexColor(COLOR_MUTED))
            canvas.setFont(font_regular, 6.4)
            canvas.drawString(17 * mm, 12.5 * mm, f"{MUNICIPALITY_NAME} · CNPJ {MUNICIPALITY_CNPJ}")
            canvas.drawString(17 * mm, 9.5 * mm, MUNICIPALITY_ADDRESS)
            canvas.drawRightString(
                A4[0] - 17 * mm,
                12.5 * mm,
                f"Termo nº {possession.public_number} · Modelo {TERM_VERSION} · Página {doc.page}",
            )
            canvas.drawRightString(A4[0] - 17 * mm, 9.5 * mm, f"Emissão: {generated_label}")
            canvas.restoreState()

        document.build(story, onFirstPage=footer, onLaterPages=footer)
        return output.getvalue()

    @staticmethod
    def _styles(*, font_regular: str, font_bold: str):
        styles = getSampleStyleSheet()
        styles.add(
            ParagraphStyle(
                name="Institution",
                parent=styles["BodyText"],
                fontName=font_bold,
                fontSize=9.5,
                leading=11.5,
                textColor=colors.HexColor(COLOR_NAVY),
            )
        )
        styles.add(
            ParagraphStyle(
                name="InstitutionDetail",
                parent=styles["BodyText"],
                fontName=font_regular,
                fontSize=7.6,
                leading=9.5,
                textColor=colors.HexColor(COLOR_INK),
            )
        )
        styles.add(
            ParagraphStyle(
                name="TermTitle",
                parent=styles["Title"],
                fontName=font_bold,
                fontSize=14,
                leading=17,
                alignment=TA_CENTER,
                textColor=colors.HexColor(COLOR_NAVY),
                spaceAfter=3 * mm,
            )
        )
        styles.add(
            ParagraphStyle(
                name="Section",
                parent=styles["Heading2"],
                fontName=font_bold,
                fontSize=10.5,
                leading=13,
                textColor=colors.HexColor(COLOR_NAVY),
                spaceBefore=4 * mm,
                spaceAfter=2 * mm,
            )
        )
        styles.add(
            ParagraphStyle(
                name="Small",
                parent=styles["BodyText"],
                fontName=font_regular,
                fontSize=7.4,
                leading=9.4,
                textColor=colors.HexColor(COLOR_MUTED),
            )
        )
        styles.add(
            ParagraphStyle(
                name="BodyCompact",
                parent=styles["BodyText"],
                fontName=font_regular,
                fontSize=8.8,
                leading=12,
                alignment=TA_LEFT,
                textColor=colors.HexColor(COLOR_INK),
            )
        )
        styles.add(
            ParagraphStyle(
                name="PrivacyNote",
                parent=styles["BodyText"],
                fontName=font_regular,
                fontSize=7.5,
                leading=9.5,
                textColor=colors.HexColor(COLOR_MUTED),
                borderColor=colors.HexColor(COLOR_BORDER),
                borderWidth=0.5,
                borderPadding=5,
                backColor=colors.HexColor("#FAFAFA"),
            )
        )
        styles.add(
            ParagraphStyle(
                name="Declaration",
                parent=styles["BodyText"],
                fontName=font_regular,
                fontSize=8.6,
                leading=12,
                borderColor=colors.HexColor(COLOR_BORDER),
                borderWidth=0.6,
                borderPadding=8,
                backColor=colors.HexColor("#F8FAFC"),
                textColor=colors.HexColor(COLOR_INK),
            )
        )
        return styles

    @staticmethod
    def _institutional_header(styles):
        crest = Image(str(crest_path()), width=14.3 * mm, height=18 * mm)
        identity = [
            Paragraph(MUNICIPALITY_NAME.upper(), styles["Institution"]),
            Paragraph(ADMINISTRATION_SECRETARIAT, styles["InstitutionDetail"]),
            Paragraph(FLEET_DEPARTMENT, styles["InstitutionDetail"]),
            Paragraph(f"CNPJ {MUNICIPALITY_CNPJ}", styles["InstitutionDetail"]),
        ]
        table = Table([[crest, identity]], colWidths=[19 * mm, 141 * mm], hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.9, colors.HexColor(COLOR_NAVY)),
                ]
            )
        )
        return table

    @staticmethod
    def _control_table(*, term_number, status_text: str, generated_at: datetime, styles):
        data = [
            [
                Paragraph(f"<b>TERMO Nº</b><br/>{escape(str(term_number))}", styles["BodyCompact"]),
                Paragraph(f"<b>SITUAÇÃO</b><br/>{escape(status_text)}", styles["BodyCompact"]),
                Paragraph(f"<b>EMISSÃO</b><br/>{escape(_fmt_datetime(generated_at))}", styles["BodyCompact"]),
            ]
        ]
        table = Table(data, colWidths=[53.3 * mm, 53.3 * mm, 53.4 * mm], hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOX", (0, 0), (-1, -1), 0.45, colors.HexColor(COLOR_BORDER)),
                    ("INNERGRID", (0, 0), (-1, -1), 0.35, colors.HexColor(COLOR_BORDER)),
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        return table

    def _append_trips(self, story: list, possession, *, include_personal: bool, styles) -> None:
        if not possession.trips:
            story.append(Paragraph("Nenhuma rota registrada para esta posse.", styles["BodyCompact"]))
            return

        for trip in possession.trips:
            operational_description = (
                f"{trip.origin} / {trip.purpose}"
                if include_personal
                else "Origem e finalidade protegidas nesta via"
            )
            trip_rows = [
                ("Rota", f"#{trip.sequence_number}"),
                ("Situação", _status_label(trip.status)),
                ("Origem / finalidade", operational_description),
                ("Saída / retorno", f"{_fmt_datetime(trip.departure_at)} / {_fmt_datetime(trip.return_at)}"),
                ("Hodômetro", f"{_fmt_odometer(trip.start_odometer_km)} / {_fmt_odometer(trip.end_odometer_km)}"),
            ]
            if getattr(trip, "cancellation_reason", None):
                trip_rows.append(
                    (
                        "Justificativa do cancelamento",
                        trip.cancellation_reason if include_personal else "Conteúdo protegido nesta via",
                    )
                )
            story.append(KeepTogether([self._key_value_table(trip_rows, styles), Spacer(1, 2 * mm)]))
            if not trip.destinations:
                continue
            if not include_personal:
                story.extend(
                    [
                        Paragraph(
                            f"{_count_label(len(trip.destinations), 'destino registrado', 'destinos registrados')}, "
                            "com localização protegida nesta via.",
                            styles["Small"],
                        ),
                        Spacer(1, 3 * mm),
                    ]
                )
                continue
            destination_rows = [["Seq.", "Destino", "Referência", "Chegada", "Saída"]]
            destination_rows.extend(
                [
                    [
                        str(destination.sequence_number),
                        destination.description,
                        destination.address_reference or "—",
                        _fmt_datetime(destination.arrived_at),
                        _fmt_datetime(destination.departed_at),
                    ]
                    for destination in trip.destinations
                ]
            )
            story.append(self._destination_table(destination_rows, styles))
            story.append(Spacer(1, 3 * mm))

    @staticmethod
    def _signature_story(possession, *, signature_summary: dict | None, include_personal: bool, styles) -> list:
        summary = signature_summary or {}
        acceptance = (summary.get("snapshot") or {}).get("acceptance") or {}
        acceptance_version = acceptance.get("version") or RESPONSIBILITY_ACCEPTANCE_VERSION
        acceptance_text = acceptance.get("text") or RESPONSIBILITY_ACCEPTANCE_TEXT
        status_value = summary.get("status") or "UNSIGNED"
        signed_count = int(summary.get("signed_count") or 0)
        required_signatures = max(1, int(summary.get("required_signatures") or 1))
        story: list = [
            KeepTogether(
                [
                    Paragraph("6. Assinaturas e ciência", styles["Section"]),
                    Paragraph(
                        f"<b>Declaração de ciência · versão {escape(str(acceptance_version))}</b>"
                        f"<br/>{escape(str(acceptance_text))}",
                        styles["Declaration"],
                    ),
                    Spacer(1, 3 * mm),
                    PossessionTermPdfService._key_value_table(
                        [
                            ("Situação do registro eletrônico", _signature_status_label(status_value)),
                            ("Assinaturas registradas", f"{signed_count} de {required_signatures}"),
                        ],
                        styles,
                    ),
                ]
            ),
            Spacer(1, 3 * mm),
        ]
        signatures = summary.get("signatures") or []
        if signatures and include_personal:
            story.extend(
                [
                    Paragraph(
                        "Os registros abaixo formalizam a declaração dos agentes responsáveis pela entrega ou "
                        "pela conferência administrativa deste termo. A ciência da pessoa responsável pela "
                        "condução também pode ser colhida no campo próprio ao final do documento.",
                        styles["BodyCompact"],
                    ),
                    Spacer(1, 2 * mm),
                ]
            )
            for signature in signatures:
                signer_name = signature.get("signer_name")
                signer_role = _role_label(signature.get("signer_role"))
                organization = signature.get("signer_organization_name") or "—"
                cpf = signature.get("signer_cpf_masked")
                story.append(
                    KeepTogether(
                        [
                            PossessionTermPdfService._key_value_table(
                                [
                                    ("Agente responsável pelo registro", signer_name or "—"),
                                    ("Perfil / unidade", f"{signer_role} · {organization}"),
                                    ("Documento", cpf or "—"),
                                    ("Data e hora", _fmt_datetime(signature.get("signed_at"))),
                                    (
                                        "Código de registro da assinatura",
                                        _break_identifier(signature.get("signature_fingerprint")),
                                    ),
                                ],
                                styles,
                            ),
                            Spacer(1, 2 * mm),
                        ]
                    )
                )
            story.extend(
                [
                    Paragraph(
                        "<b>Código de integridade do conteúdo assinado:</b> "
                        f"{escape(_break_identifier(summary.get('content_hash')))}",
                        styles["Small"],
                    ),
                    Spacer(1, 4 * mm),
                ]
            )
        elif signatures:
            story.extend(
                [
                    Paragraph(
                        "A identificação dos agentes signatários permanece protegida nesta via de consulta.",
                        styles["BodyCompact"],
                    ),
                    Spacer(1, 4 * mm),
                ]
            )

        signature_line = Table(
            [
                [Spacer(1, 11 * mm), "", Spacer(1, 11 * mm)],
                [
                    Paragraph(
                        escape(
                            (possession.driver_name or "Pessoa responsável pela condução")
                            if include_personal
                            else "Identidade protegida"
                        ),
                        styles["BodyCompact"],
                    ),
                    "",
                    Paragraph("Responsável pela entrega", styles["BodyCompact"]),
                ],
                [
                    Paragraph("Pessoa responsável pela condução", styles["Small"]),
                    "",
                    Paragraph(f"{ADMINISTRATION_SECRETARIAT} / {FLEET_DEPARTMENT}", styles["Small"]),
                ],
            ],
            colWidths=[72 * mm, 10 * mm, 72 * mm],
            hAlign="CENTER",
        )
        signature_line.setStyle(
            TableStyle(
                [
                    ("LINEABOVE", (0, 1), (0, 1), 0.65, colors.HexColor(COLOR_INK)),
                    ("LINEABOVE", (2, 1), (2, 1), 0.65, colors.HexColor(COLOR_INK)),
                    ("ALIGN", (0, 1), (-1, -1), "CENTER"),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                    ("TOPPADDING", (0, 0), (-1, -1), 2),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ]
            )
        )
        story.extend(
            [
                Spacer(1, 4 * mm),
                KeepTogether(
                    [
                        Paragraph(
                            f"Teixeira de Freitas - BA, {_fmt_date(possession.start_date)}.",
                            styles["BodyCompact"],
                        ),
                        Spacer(1, 2 * mm),
                        signature_line,
                    ]
                ),
            ]
        )
        return story

    @staticmethod
    def _key_value_table(rows, styles):
        data = [
            [
                Paragraph(f"<b>{escape(str(label))}</b>", styles["BodyCompact"]),
                Paragraph(escape(str(value)).replace("\n", "<br/>"), styles["BodyCompact"]),
            ]
            for label, value in rows
        ]
        table = Table(data, colWidths=[48 * mm, 112 * mm], hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor(COLOR_BORDER)),
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(COLOR_SURFACE)),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        return table

    @staticmethod
    def _destination_table(rows, styles):
        data = [[Paragraph(escape(str(value)), styles["Small"]) for value in row] for row in rows]
        table = LongTable(
            data,
            colWidths=[10 * mm, 42 * mm, 45 * mm, 31 * mm, 31 * mm],
            repeatRows=1,
            hAlign="LEFT",
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(COLOR_NAVY)),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor(COLOR_BORDER)),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            )
        )
        return table

    @staticmethod
    def _current_confirmation(possession):
        return next((item for item in possession.return_confirmations if item.is_current), None)
