from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from contextlib import contextmanager
from contextvars import ContextVar
from functools import wraps

_frozen_identity = ContextVar('frozen_institutional_identity', default=None)


def current_identity():
    from app.services.system_settings_service import runtime_settings
    return _frozen_identity.get() or runtime_settings()


@contextmanager
def using_brand_snapshot(values=None):
    from app.core.settings_catalog import merged_settings
    token = _frozen_identity.set(merged_settings(values))
    try: yield
    finally: _frozen_identity.reset(token)


def frozen_document_brand(function):
    @wraps(function)
    def render(*args, **kwargs):
        snapshot = kwargs.get('snapshot') or next((value for value in args if isinstance(value, dict)), {})
        with using_brand_snapshot(snapshot.get('institutional_identity')):
            return function(*args, **kwargs)
    return render


INSTITUTIONAL_TIMEZONE = ZoneInfo("America/Bahia")

PDF_FONT_REGULAR = "PMTF-Roboto"
PDF_FONT_BOLD = "PMTF-Roboto-Bold"

COLOR_INK = "#20304A"
COLOR_MUTED = "#66758C"
COLOR_BORDER = "#D1D5DB"
COLOR_SURFACE = "#F3F4F6"


def __getattr__(name):
    values = current_identity()
    mapping = {'MUNICIPALITY_NAME': 'municipality', 'MUNICIPALITY_CNPJ': 'cnpj',
               'SYSTEM_NAME': 'systemName', 'MUNICIPALITY_CITY': 'city', 'MUNICIPALITY_STATE': 'state',
               'MUNICIPALITY_ADDRESS': 'addressLine', 'ADMINISTRATION_SECRETARIAT': 'administrationSecretariat',
               'FLEET_DEPARTMENT': 'fleetDepartment'}
    if name in mapping:
        return values['identity'][mapping[name]]
    if name in ('COLOR_BLUE', 'COLOR_NAVY'):
        return values['appearance']['primary'] if name == 'COLOR_BLUE' else '#17365D'
    raise AttributeError(name)


def institutional_datetime(value: datetime) -> datetime:
    """Convert an aware instant to the municipality's presentation timezone."""
    if value.tzinfo is None:
        raise ValueError("Institutional dates must be timezone-aware")
    return value.astimezone(INSTITUTIONAL_TIMEZONE)


def crest_path() -> Path:
    """Return the tracked municipal crest used by server-generated documents."""
    from app.services.system_settings_service import logo_file
    path = current_identity()['identity']['logoPath']
    if path.startswith('/api/system-settings/logo/'):
        return logo_file(path.rsplit('/', 1)[-1])
    repository_root = Path(__file__).resolve().parents[3]
    candidate = repository_root / "brasao-pmtf.png"
    if candidate.is_file():
        return candidate
    raise FileNotFoundError("Brasão institucional não encontrado no pacote da aplicação")


def institutional_footer() -> str:
    return f"{__getattr__('MUNICIPALITY_NAME')} | {__getattr__('MUNICIPALITY_ADDRESS')} | CNPJ {__getattr__('MUNICIPALITY_CNPJ')}"


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
