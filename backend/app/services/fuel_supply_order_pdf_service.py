from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from functools import partial
from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import (
    Image,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

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
from app.models.document_signature import DigitalDocumentType


FUEL_SUPPLY_ORDER_CANONICAL_SCHEMA = "canonical-fuel-supply-order.v1"


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _format_datetime(value: object) -> str:
    parsed = _parse_datetime(value)
    if parsed is None:
        return "—"
    return institutional_datetime(parsed).strftime("%d/%m/%Y às %H:%M")


def _format_liters(value: object) -> str:
    if value in {None, ""}:
        return "Não informado"
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.001"))
    except (InvalidOperation, ValueError):
        return "Não informado"
    formatted = f"{amount:,.3f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{formatted} L"


def _status_label(value: object) -> str:
    normalized = str(getattr(value, "value", value) or "").upper()
    return {
        "OPEN": "Aberta",
        "COMPLETED": "Concluída",
        "CANCELLED": "Cancelada",
        "EXPIRED": "Expirada",
    }.get(normalized, normalized or "—")


class FuelSupplyOrderPdfService:
    """Build the immutable official fuel-order PDF solely from its frozen snapshot."""

    @classmethod
    def build_canonical_pdf(
        cls,
        snapshot: dict,
        *,
        content_hash: str,
        homologation_watermark: bool = False,
    ) -> bytes:
        if snapshot.get("document_type") != DigitalDocumentType.FUEL_SUPPLY_ORDER:
            raise ValueError("Snapshot não pertence a uma ordem de abastecimento")
        if len(content_hash) != 64 or any(character not in "0123456789abcdefABCDEF" for character in content_hash):
            raise ValueError("Hash do conteúdo-fonte inválido")

        output = BytesIO()
        font_regular, font_bold = ensure_pdf_fonts()
        styles = cls._styles(font_regular=font_regular, font_bold=font_bold)
        request_number = str(snapshot.get("request_number") or "—")
        validation_code = str(snapshot.get("validation_code") or "—")
        validation_path = str(snapshot.get("public_validation_path") or "—")
        vehicle = snapshot.get("vehicle") or {}
        organization = snapshot.get("organization") or {}
        station = snapshot.get("fuel_station") or {}
        vehicle_description = " ".join(
            str(value).strip()
            for value in (vehicle.get("brand"), vehicle.get("model"))
            if value
        )
        vehicle_label = str(vehicle.get("plate") or "—")
        if vehicle_description:
            vehicle_label = f"{vehicle_label} · {vehicle_description}"

        document = SimpleDocTemplate(
            output,
            pagesize=A4,
            rightMargin=17 * mm,
            leftMargin=17 * mm,
            topMargin=19 * mm,
            bottomMargin=23 * mm,
            title=f"Ordem canônica de abastecimento {request_number}",
            author=MUNICIPALITY_NAME,
            subject="Ordem oficial de abastecimento congelada para assinatura digital",
            creator="Sistema de Frota PMTF",
            invariant=1,
            pageCompression=1,
        )

        story = [
            cls._institutional_header(styles),
            Spacer(1, 4 * mm),
            Paragraph("ORDEM CANÔNICA DE ABASTECIMENTO", styles["DocumentTitle"]),
            cls._key_value_table(
                [
                    ("Número da ordem", request_number),
                    ("Situação congelada", _status_label(snapshot.get("status"))),
                    ("Emitida em", _format_datetime(snapshot.get("created_at"))),
                    ("Válida até", _format_datetime(snapshot.get("expires_at"))),
                    ("Código de validação", validation_code),
                ],
                styles,
            ),
            Paragraph("1. Dados operacionais autorizados", styles["Section"]),
            cls._key_value_table(
                [
                    ("Veículo", vehicle_label),
                    ("Órgão solicitante", str(organization.get("name") or "Não informado")),
                    ("Posto credenciado", str(station.get("name") or "Não informado")),
                    ("CNPJ do posto", str(station.get("cnpj") or "Não informado")),
                    ("Endereço do posto", str(station.get("address") or "Não informado")),
                    ("Telefone do posto", str(station.get("phone") or "Não informado")),
                    ("Litros previstos", _format_liters(snapshot.get("requested_liters"))),
                    ("Servidor emissor", str(snapshot.get("created_by_name") or "Não informado")),
                ],
                styles,
            ),
            Paragraph("2. Condições e controle", styles["Section"]),
            Paragraph(
                "Esta ordem autoriza exclusivamente o abastecimento do veículo identificado, "
                "no posto credenciado e dentro do prazo registrados neste documento. Alterações "
                "na ordem original exigem a emissão de um novo artefato.",
                styles["Body"],
            ),
            Spacer(1, 2 * mm),
            cls._key_value_table(
                [
                    ("Observações", str(snapshot.get("notes") or "Sem observações registradas")),
                    ("Caminho de validação", validation_path),
                    ("Hash do conteúdo-fonte", content_hash),
                ],
                styles,
            ),
            Spacer(1, 3 * mm),
            KeepTogether(
                [
                    Paragraph("3. Escopo da assinatura", styles["Section"]),
                    Paragraph(
                        "A assinatura digital cobre os bytes exatos deste PDF e os dados da ordem "
                        "congelados no momento da emissão. Confirmação do abastecimento, comprovante "
                        "fiscal e eventos posteriores permanecem no histórico operacional.",
                        styles["Notice"],
                    ),
                ]
            ),
        ]

        def footer(canvas: Canvas, doc) -> None:
            canvas.saveState()
            if homologation_watermark:
                canvas.setFillColor(colors.Color(0.72, 0.08, 0.08, alpha=0.16))
                canvas.setFont(font_bold, 18)
                canvas.translate(A4[0] / 2, A4[1] / 2)
                canvas.rotate(35)
                canvas.drawCentredString(0, 0, "HOMOLOGAÇÃO — SEM VALIDADE OPERACIONAL")
                canvas.rotate(-35)
                canvas.translate(-A4[0] / 2, -A4[1] / 2)
            canvas.setStrokeColor(colors.HexColor(COLOR_NAVY))
            canvas.setLineWidth(0.5)
            canvas.line(17 * mm, 16 * mm, A4[0] - 17 * mm, 16 * mm)
            canvas.setFillColor(colors.HexColor(COLOR_MUTED))
            canvas.setFont(font_regular, 6.4)
            canvas.drawString(17 * mm, 12.5 * mm, f"{MUNICIPALITY_NAME} · CNPJ {MUNICIPALITY_CNPJ}")
            canvas.drawRightString(A4[0] - 17 * mm, 12.5 * mm, f"{request_number} · Página {doc.page}")
            canvas.drawString(17 * mm, 9.5 * mm, "Artefato canônico imutável")
            canvas.drawRightString(A4[0] - 17 * mm, 9.5 * mm, content_hash)
            canvas.restoreState()

        document.build(
            story,
            onFirstPage=footer,
            onLaterPages=footer,
            canvasmaker=partial(Canvas),
        )
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
                leading=9.4,
                textColor=colors.HexColor(COLOR_MUTED),
            )
        )
        styles.add(
            ParagraphStyle(
                name="DocumentTitle",
                parent=styles["Title"],
                fontName=font_bold,
                fontSize=15,
                leading=18,
                alignment=TA_CENTER,
                textColor=colors.HexColor(COLOR_NAVY),
                spaceAfter=4 * mm,
            )
        )
        styles.add(
            ParagraphStyle(
                name="Section",
                parent=styles["Heading2"],
                fontName=font_bold,
                fontSize=9.5,
                leading=12,
                textColor=colors.HexColor(COLOR_NAVY),
                spaceBefore=4 * mm,
                spaceAfter=2 * mm,
            )
        )
        styles.add(
            ParagraphStyle(
                name="Body",
                parent=styles["BodyText"],
                fontName=font_regular,
                fontSize=8.2,
                leading=11,
                textColor=colors.HexColor(COLOR_INK),
            )
        )
        styles.add(
            ParagraphStyle(
                name="Key",
                parent=styles["Body"],
                fontName=font_bold,
            )
        )
        styles.add(
            ParagraphStyle(
                name="Notice",
                parent=styles["BodyText"],
                fontName=font_regular,
                fontSize=8,
                leading=10.5,
                leftIndent=3 * mm,
                rightIndent=3 * mm,
                borderWidth=0.5,
                borderColor=colors.HexColor(COLOR_BORDER),
                borderPadding=3 * mm,
                backColor=colors.HexColor(COLOR_SURFACE),
                textColor=colors.HexColor(COLOR_INK),
            )
        )
        return styles

    @staticmethod
    def _institutional_header(styles) -> Table:
        logo = Image(str(crest_path()), width=13 * mm, height=16 * mm)
        identity = Paragraph(
            f"{escape(MUNICIPALITY_NAME.upper())}<br/>"
            f"<font name='PMTF-Roboto' size='7.6'>{escape(ADMINISTRATION_SECRETARIAT)} · "
            f"{escape(FLEET_DEPARTMENT)}<br/>{escape(MUNICIPALITY_ADDRESS)}</font>",
            styles["Institution"],
        )
        table = Table([[logo, identity]], colWidths=[17 * mm, 154 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 0),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ]
            )
        )
        return table

    @staticmethod
    def _key_value_table(rows: list[tuple[str, str]], styles) -> Table:
        cells = [
            [
                Paragraph(escape(str(label)), styles["Key"]),
                Paragraph(escape(str(value)).replace("\n", "<br/>"), styles["Body"]),
            ]
            for label, value in rows
        ]
        table = Table(cells, colWidths=[45 * mm, 126 * mm], repeatRows=0)
        table.setStyle(
            TableStyle(
                [
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor(COLOR_BORDER)),
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor(COLOR_SURFACE)),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("FONTNAME", (0, 0), (0, -1), "PMTF-Roboto-Bold"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]
            )
        )
        return table
