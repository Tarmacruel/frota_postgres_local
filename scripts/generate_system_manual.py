from __future__ import annotations

import html
import re
from datetime import datetime
from pathlib import Path

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILE = ROOT / "docs" / "manual_sistema_frotas.md"
OUTPUT_DIR = ROOT / "output" / "doc"
OUTPUT_FILE = OUTPUT_DIR / "manual_sistema_frotas.pdf"
LOGO_PATH = ROOT / "frontend" / "public" / "brasao-pmtf.png"

PAGE_SIZE = landscape(A4)
PAGE_WIDTH, PAGE_HEIGHT = PAGE_SIZE

PRIMARY = colors.HexColor("#2452E8")
PRIMARY_DARK = colors.HexColor("#1739B7")
PRIMARY_DEEP = colors.HexColor("#0D2272")
INK = colors.HexColor("#20304A")
SOFT_INK = colors.HexColor("#66758C")
LINE = colors.HexColor("#D9E2F3")
LIGHT = colors.HexColor("#F5F8FF")
WARNING = colors.HexColor("#FFF4D9")
SUCCESS = colors.HexColor("#E7F6EF")


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="CoverKicker",
            parent=styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=PRIMARY,
            alignment=TA_LEFT,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CoverTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=29,
            textColor=INK,
            alignment=TA_LEFT,
            spaceAfter=10,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Subtitle",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=12,
            leading=17,
            textColor=SOFT_INK,
            alignment=TA_LEFT,
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SectionTitle",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=16,
            leading=20,
            textColor=PRIMARY_DEEP,
            spaceBefore=2,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SubsectionTitle",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=PRIMARY_DEEP,
            spaceBefore=4,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Body",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=14,
            textColor=INK,
            spaceAfter=7,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Small",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=12,
            textColor=SOFT_INK,
            spaceAfter=5,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Caption",
            parent=styles["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=SOFT_INK,
            alignment=TA_CENTER,
            spaceBefore=4,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Box",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK,
            spaceAfter=0,
        )
    )
    styles.add(
        ParagraphStyle(
            name="CodeBlock",
            parent=styles["BodyText"],
            fontName="Courier",
            fontSize=8.5,
            leading=11,
            textColor=INK,
            spaceAfter=0,
        )
    )
    return styles


STYLES = build_styles()


def header_footer(canvas, doc):
    canvas.saveState()
    left = doc.leftMargin
    right = PAGE_WIDTH - doc.rightMargin
    top = PAGE_HEIGHT - 13 * mm
    bottom = 10 * mm

    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.7)
    canvas.line(left, top, right, top)
    canvas.line(left, bottom + 4 * mm, right, bottom + 4 * mm)

    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), left, PAGE_HEIGHT - 18 * mm, width=9 * mm, height=9 * mm, preserveAspectRatio=True, mask="auto")

    canvas.setFillColor(INK)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(left + 12 * mm, PAGE_HEIGHT - 14 * mm, "Prefeitura Municipal de Teixeira de Freitas")
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(SOFT_INK)
    canvas.drawString(left + 12 * mm, PAGE_HEIGHT - 18 * mm, "Manual completo de uso do sistema FROTAS")
    canvas.drawRightString(right, PAGE_HEIGHT - 14 * mm, "Frota PMTF")

    canvas.setFont("Helvetica", 8)
    canvas.drawString(left, bottom, "Documento operacional para treinamento e consulta.")
    canvas.drawRightString(right, bottom, f"Página {doc.page}")
    canvas.restoreState()


def inline_markup(text: str) -> str:
    text = html.escape(text.strip())
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"`(.+?)`", r'<font name="Courier">\1</font>', text)
    return text.replace("  ", " ")


def info_box(title: str, body: str, background=LIGHT):
    table = Table(
        [[Paragraph(f"<b>{inline_markup(title)}</b>", STYLES["SubsectionTitle"])], [Paragraph(inline_markup(body), STYLES["Box"])]],
        colWidths=[PAGE_WIDTH - 42 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), background),
                ("BOX", (0, 0), (-1, -1), 1, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                ("TOPPADDING", (0, 0), (-1, -1), 9),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
            ]
        )
    )
    return table


def scaled_image(path: Path, max_width: float, max_height: float) -> Image:
    with PILImage.open(path) as image:
        width, height = image.size
    scale = min(max_width / width, max_height / height)
    return Image(str(path), width=width * scale, height=height * scale)


def image_block(caption: str, image_path: Path):
    if not image_path.exists():
        return info_box("Captura não encontrada", f"A imagem esperada não foi localizada: {image_path}", WARNING)
    return KeepTogether(
        [
            scaled_image(image_path, max_width=PAGE_WIDTH - 42 * mm, max_height=96 * mm),
            Paragraph(inline_markup(caption), STYLES["Caption"]),
        ]
    )


def table_from_rows(rows: list[list[str]]):
    if not rows:
        return Spacer(1, 0)
    max_cols = max(len(row) for row in rows)
    normalized = [row + [""] * (max_cols - len(row)) for row in rows]
    width = PAGE_WIDTH - 42 * mm
    col_widths = [width / max_cols] * max_cols
    data = [[Paragraph(inline_markup(cell), STYLES["Small"]) for cell in row] for row in normalized]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, LINE),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return table


def parse_table(lines: list[str], start: int):
    rows = []
    i = start
    while i < len(lines) and lines[i].strip().startswith("|"):
        cells = [cell.strip() for cell in lines[i].strip().strip("|").split("|")]
        if not all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            rows.append(cells)
        i += 1
    return table_from_rows(rows), i


def parse_list(lines: list[str], start: int):
    items = []
    ordered = False
    i = start
    while i < len(lines):
        stripped = lines[i].strip()
        ordered_match = re.match(r"^\d+\.\s+(.+)$", stripped)
        bullet_match = re.match(r"^[-*]\s+(.+)$", stripped)
        if ordered_match:
            ordered = True
            items.append(ordered_match.group(1))
        elif bullet_match:
            items.append(bullet_match.group(1))
        else:
            break
        i += 1
    flowable = ListFlowable(
        [ListItem(Paragraph(inline_markup(item), STYLES["Body"])) for item in items],
        bulletType="1" if ordered else "bullet",
        start="1",
        leftIndent=18,
    )
    return flowable, i


def parse_code(lines: list[str], start: int):
    code_lines = []
    i = start + 1
    while i < len(lines) and not lines[i].strip().startswith("```"):
        code_lines.append(lines[i].rstrip())
        i += 1
    content = "<br/>".join(html.escape(line) for line in code_lines)
    table = Table([[Paragraph(content, STYLES["CodeBlock"])]], colWidths=[PAGE_WIDTH - 42 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F2F4F8")),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return table, min(i + 1, len(lines))


def parse_markdown(source: Path):
    lines = source.read_text(encoding="utf-8").splitlines()
    story = []
    headings = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped.startswith("```"):
            flowable, i = parse_code(lines, i)
            story.append(flowable)
            story.append(Spacer(1, 7))
            continue

        if stripped.startswith("|"):
            flowable, i = parse_table(lines, i)
            story.append(flowable)
            story.append(Spacer(1, 8))
            continue

        if re.match(r"^(\d+\.|[-*])\s+", stripped):
            flowable, i = parse_list(lines, i)
            story.append(flowable)
            story.append(Spacer(1, 5))
            continue

        image_match = re.match(r"!\[(.*?)\]\((.*?)\)", stripped)
        if image_match:
            caption, raw_path = image_match.groups()
            image_path = (source.parent / raw_path).resolve()
            story.append(image_block(caption, image_path))
            story.append(Spacer(1, 6))
            i += 1
            continue

        if stripped.startswith(">"):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip().lstrip(">").strip())
                i += 1
            quote = " ".join(quote_lines)
            title = "Observação"
            body = quote
            title_match = re.match(r"\*\*(.+?)\:\*\*\s*(.+)", quote)
            if title_match:
                title, body = title_match.groups()
            story.append(info_box(title, body, SUCCESS if "Segurança" in title else LIGHT))
            story.append(Spacer(1, 8))
            continue

        if stripped.startswith("# "):
            title = stripped[2:].strip()
            headings.append(title)
            story.append(Paragraph(inline_markup(title), STYLES["CoverTitle"]))
            i += 1
            continue

        if stripped.startswith("## "):
            title = stripped[3:].strip()
            headings.append(title)
            if story:
                story.append(PageBreak())
            story.append(Paragraph(inline_markup(title), STYLES["SectionTitle"]))
            i += 1
            continue

        if stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:]), STYLES["SubsectionTitle"]))
            i += 1
            continue

        paragraph = [stripped]
        i += 1
        while i < len(lines):
            next_line = lines[i].strip()
            if not next_line or next_line.startswith(("#", "|", ">", "!", "```")) or re.match(r"^(\d+\.|[-*])\s+", next_line):
                break
            paragraph.append(next_line)
            i += 1
        story.append(Paragraph(inline_markup(" ".join(paragraph)), STYLES["Body"]))

    return story, headings


def cover_page(headings: list[str]):
    generated_at = datetime.now().strftime("%d/%m/%Y às %H:%M")
    content = []
    if LOGO_PATH.exists():
        content.append(Image(str(LOGO_PATH), width=20 * mm, height=20 * mm))
        content.append(Spacer(1, 8))
    content.extend(
        [
            Paragraph("Frota PMTF · manual operacional", STYLES["CoverKicker"]),
            Paragraph("Manual completo de uso do sistema FROTAS", STYLES["CoverTitle"]),
            Paragraph(
                "Documento de treinamento e consulta para usuários, operadores e administradores. "
                "Abrange acesso, operação da frota, abastecimentos, relatórios, auditoria e rotinas administrativas.",
                STYLES["Subtitle"],
            ),
            info_box("Escopo", "Uso do sistema na versão atual, com capturas reais e orientação operacional para cada módulo."),
            Spacer(1, 10),
            info_box("Geração", f"Arquivo fonte: docs/manual_sistema_frotas.md. Data de geração: {generated_at}."),
            Spacer(1, 12),
            Paragraph("Sumário", STYLES["SectionTitle"]),
        ]
    )
    summary_rows = [[Paragraph(inline_markup(title), STYLES["Small"])] for title in headings[:22]]
    summary = Table(summary_rows, colWidths=[PAGE_WIDTH - 42 * mm])
    summary.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    content.append(summary)
    return content


def main():
    if not SOURCE_FILE.exists():
        raise FileNotFoundError(f"Fonte do manual não encontrada: {SOURCE_FILE}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manual_story, headings = parse_markdown(SOURCE_FILE)
    story = cover_page(headings) + [PageBreak()] + manual_story
    doc = SimpleDocTemplate(
        str(OUTPUT_FILE),
        pagesize=PAGE_SIZE,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="Manual completo de uso do sistema FROTAS",
        author="Codex",
    )
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"PDF gerado em: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
