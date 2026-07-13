from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


MUNICIPALITY_NAME = "Prefeitura Municipal de Teixeira de Freitas"
MUNICIPALITY_CNPJ = "13.650.403/0001-28"
MUNICIPALITY_ADDRESS = (
    "Avenida Marechal Castelo Branco, 145 - Centro, "
    "Teixeira de Freitas - BA, CEP 45995-041"
)
ADMINISTRATION_SECRETARIAT = "Secretaria Municipal de Administração"
FLEET_DEPARTMENT = "Setor de Frotas"
INSTITUTIONAL_TIMEZONE = ZoneInfo("America/Bahia")

PDF_FONT_REGULAR = "PMTF-Roboto"
PDF_FONT_BOLD = "PMTF-Roboto-Bold"

COLOR_NAVY = "#17365D"
COLOR_BLUE = "#2452E8"
COLOR_INK = "#20304A"
COLOR_MUTED = "#66758C"
COLOR_BORDER = "#D1D5DB"
COLOR_SURFACE = "#F3F4F6"


def institutional_datetime(value: datetime) -> datetime:
    """Convert an aware instant to the municipality's presentation timezone."""
    if value.tzinfo is None:
        raise ValueError("Institutional dates must be timezone-aware")
    return value.astimezone(INSTITUTIONAL_TIMEZONE)


def crest_path() -> Path:
    """Return the tracked municipal crest used by server-generated documents."""
    repository_root = Path(__file__).resolve().parents[3]
    candidate = repository_root / "brasao-pmtf.png"
    if candidate.is_file():
        return candidate
    raise FileNotFoundError("Brasão institucional não encontrado no pacote da aplicação")


def institutional_footer() -> str:
    return f"{MUNICIPALITY_NAME} | {MUNICIPALITY_ADDRESS} | CNPJ {MUNICIPALITY_CNPJ}"


def ensure_pdf_fonts() -> tuple[str, str]:
    """Register the embedded, cross-platform institutional PDF font family."""
    import font_roboto
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    registered = set(pdfmetrics.getRegisteredFontNames())
    if PDF_FONT_REGULAR not in registered:
        pdfmetrics.registerFont(TTFont(PDF_FONT_REGULAR, font_roboto.Roboto))
    if PDF_FONT_BOLD not in registered:
        pdfmetrics.registerFont(TTFont(PDF_FONT_BOLD, font_roboto.RobotoBold))
    pdfmetrics.registerFontFamily(
        "PMTF-Roboto",
        normal=PDF_FONT_REGULAR,
        bold=PDF_FONT_BOLD,
        italic=PDF_FONT_REGULAR,
        boldItalic=PDF_FONT_BOLD,
    )
    return PDF_FONT_REGULAR, PDF_FONT_BOLD
