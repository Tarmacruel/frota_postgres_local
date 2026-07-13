from __future__ import annotations

from html import escape
from io import BytesIO
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    LongTable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.possession_trip import VehiclePossessionTripStatus
from app.models.user import User, UserRole
from app.repositories.possession_repository import PossessionRepository
from app.services.audit_service import AuditService
from app.services.possession_service import PossessionService


TERM_VERSION = "1.0"
NO_CACHE_HEADERS = {
    "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "X-Content-Type-Options": "nosniff",
}


def _fmt_datetime(value) -> str:
    return value.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M:%S UTC") if value else "—"


def _fmt_odometer(value) -> str:
    return f"{float(value):,.1f} km".replace(",", "X").replace(".", ",").replace("X", ".") if value is not None else "—"


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


class PossessionTermPdfService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.possessions = PossessionRepository(db)
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
                detail={"code": "POSSESSION_TERM_FULL_DOWNLOAD_FORBIDDEN", "message": "Seu perfil permite somente a consulta mascarada do termo."},
            )

        possession = await self.possessions.get_term_graph(possession_id)
        if possession is None:
            raise HTTPException(status_code=404, detail="Registro de posse não encontrado")
        await PossessionService(self.db)._ensure_possession_visible_to_user(possession, current_user)
        include_personal = current_user.role in {UserRole.ADMIN, UserRole.PRODUCAO}
        pdf = self._build_pdf(possession, include_personal=include_personal)
        action = "TERM_DOWNLOAD" if disposition == "attachment" else "TERM_PREVIEW"
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
                "confirmation_version": self._current_confirmation(possession).version if self._current_confirmation(possession) else None,
            },
        )
        await self.db.commit()
        filename = f"termo-posse-{possession.public_number}.pdf"
        return pdf, filename

    def _build_pdf(self, possession, *, include_personal: bool) -> bytes:
        output = BytesIO()
        generated_at = datetime.now(timezone.utc)
        document = SimpleDocTemplate(
            output,
            pagesize=A4,
            rightMargin=17 * mm,
            leftMargin=17 * mm,
            topMargin=22 * mm,
            bottomMargin=18 * mm,
            title=f"Termo de Posse e Responsabilidade nº {possession.public_number}",
            author="Frota Municipal",
            subject="Registro oficial de entrega, rotas e devolução de veículo",
        )
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name="TermTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=15, leading=18, alignment=TA_CENTER, textColor=colors.HexColor("#17365D"), spaceAfter=5 * mm))
        styles.add(ParagraphStyle(name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=10.5, leading=13, textColor=colors.HexColor("#17365D"), spaceBefore=4 * mm, spaceAfter=2 * mm))
        styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=8, leading=10, textColor=colors.HexColor("#4B5563")))
        styles.add(ParagraphStyle(name="BodyCompact", parent=styles["BodyText"], fontSize=9, leading=12))
        styles.add(ParagraphStyle(name="Declaration", parent=styles["BodyText"], fontSize=9, leading=13, borderColor=colors.HexColor("#9CA3AF"), borderWidth=0.5, borderPadding=8, backColor=colors.HexColor("#F8FAFC")))

        story = [
            Paragraph("PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS", styles["Small"]),
            Paragraph("TERMO DE POSSE E RESPONSABILIDADE", styles["TermTitle"]),
            Paragraph(f"Termo nº {possession.public_number} · versão documental {TERM_VERSION}", styles["Small"]),
            Paragraph(f"Registro interno: {possession.id} · gerado em {_fmt_datetime(generated_at)}", styles["Small"]),
        ]
        if not include_personal:
            story.extend([Spacer(1, 2 * mm), Paragraph("Cópia de consulta com dados pessoais mascarados.", styles["Small"])])

        vehicle_name = " ".join(filter(None, [possession.vehicle.brand, possession.vehicle.model])).strip()
        driver_document = possession.driver_document if include_personal else _masked_document(possession.driver_document)
        driver_contact = possession.driver_contact if include_personal else "Dado restrito"
        status_text = "Em andamento" if possession.end_date is None else "Encerrada"
        story.extend([
            Paragraph("1. Identificação e status", styles["Section"]),
            self._key_value_table([
                ("Número da posse", str(possession.public_number)),
                ("Status", status_text),
                ("Veículo", f"{possession.vehicle.plate} · {vehicle_name or '—'}"),
                ("Condutor", possession.driver_name),
                ("Documento", driver_document or "—"),
                ("Contato", driver_contact or "—"),
            ], styles),
            Paragraph("2. Entrega", styles["Section"]),
            self._key_value_table([
                ("Data e hora da entrega", _fmt_datetime(possession.start_date)),
                ("Hodômetro inicial", _fmt_odometer(possession.start_odometer_km)),
                ("Observação registrada", possession.observation or "Sem observação"),
                ("Evidências fotográficas", f"{len(possession.photos)} arquivo(s) protegido(s); metadados técnicos omitidos deste termo"),
            ], styles),
            Paragraph("3. Rotas e destinos", styles["Section"]),
        ])
        if possession.trips:
            for trip in possession.trips:
                trip_rows = [
                    ["Rota", f"#{trip.sequence_number}"],
                    ["Status", _status_label(trip.status)],
                    ["Origem / finalidade", f"{trip.origin} / {trip.purpose}"],
                    ["Saída / retorno", f"{_fmt_datetime(trip.departure_at)} / {_fmt_datetime(trip.return_at)}"],
                    ["Hodômetro", f"{_fmt_odometer(trip.start_odometer_km)} / {_fmt_odometer(trip.end_odometer_km)}"],
                ]
                story.append(KeepTogether([self._key_value_table(trip_rows, styles), Spacer(1, 2 * mm)]))
                if trip.destinations:
                    destination_rows = [["Seq.", "Destino", "Referência", "Chegada", "Saída"]]
                    destination_rows.extend([
                        [
                            str(destination.sequence_number),
                            destination.description,
                            destination.address_reference or "—",
                            _fmt_datetime(destination.arrived_at),
                            _fmt_datetime(destination.departed_at),
                        ]
                        for destination in trip.destinations
                    ])
                    story.append(self._destination_table(destination_rows, styles))
                    story.append(Spacer(1, 3 * mm))
        else:
            story.append(Paragraph("Nenhuma rota registrada nesta posse.", styles["BodyCompact"]))

        current = self._current_confirmation(possession)
        story.append(Paragraph("4. Devolução e confirmação", styles["Section"]))
        if current:
            confirmer = current.confirmer_name if include_personal else "Usuário autenticado (dados restritos)"
            story.extend([
                self._key_value_table([
                    ("Data e hora da devolução", _fmt_datetime(possession.end_date)),
                    ("Hodômetro final", _fmt_odometer(current.final_odometer_km)),
                    ("Declarante", f"{confirmer} · perfil {current.confirmer_role}"),
                    ("Confirmação", f"Versão {current.version} · {_fmt_datetime(current.confirmed_at)}"),
                    ("Integridade SHA-256", current.canonical_payload_hash),
                ], styles),
                Spacer(1, 3 * mm),
                Paragraph("<b>Condições registradas</b>", styles["BodyCompact"]),
                Paragraph(escape(current.vehicle_condition_notes), styles["BodyCompact"]),
                Spacer(1, 3 * mm),
                Paragraph(f"<b>Declaração v{escape(current.declaration_version)}</b><br/>{escape(current.declaration_text)}", styles["Declaration"]),
            ])
        elif possession.end_date is not None:
            story.append(Paragraph("Registro legado encerrado sem confirmação versionada do fluxo atual. Seus anexos e registros históricos permanecem disponíveis somente nos controles de acesso próprios do legado.", styles["BodyCompact"]))
        else:
            story.append(Paragraph("A devolução ainda não foi registrada. Este documento reflete o estado atual da posse.", styles["BodyCompact"]))

        story.extend([
            Paragraph("5. Responsabilidade e integridade", styles["Section"]),
            Paragraph("Este é o termo único oficial gerado pelo backend a partir do estado persistido. Uma rota não cria novo termo. Retificações administrativas de devolução criam nova versão e preservam a versão anterior. A autenticidade deve ser conferida no sistema institucional autenticado.", styles["BodyCompact"]),
        ])

        def footer(canvas, doc):
            canvas.saveState()
            canvas.setFont("Helvetica", 7)
            canvas.setFillColor(colors.HexColor("#6B7280"))
            canvas.drawString(17 * mm, 10 * mm, f"Termo nº {possession.public_number} · versão {TERM_VERSION}")
            canvas.drawRightString(A4[0] - 17 * mm, 10 * mm, f"Página {doc.page}")
            canvas.restoreState()

        document.build(story, onFirstPage=footer, onLaterPages=footer)
        return output.getvalue()

    @staticmethod
    def _key_value_table(rows, styles):
        data = [[Paragraph(f"<b>{escape(str(label))}</b>", styles["BodyCompact"]), Paragraph(escape(str(value)), styles["BodyCompact"])] for label, value in rows]
        table = Table(data, colWidths=[48 * mm, 112 * mm], hAlign="LEFT")
        table.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D1D5DB")),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F3F4F6")),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        return table

    @staticmethod
    def _destination_table(rows, styles):
        data = [[Paragraph(escape(str(value)), styles["Small"]) for value in row] for row in rows]
        table = LongTable(data, colWidths=[10 * mm, 42 * mm, 45 * mm, 31 * mm, 31 * mm], repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#17365D")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D1D5DB")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        return table

    @staticmethod
    def _current_confirmation(possession):
        return next((item for item in possession.return_confirmations if item.is_current), None)
