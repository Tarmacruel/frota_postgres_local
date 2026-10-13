"""Civil dates and comparison rules shared by V2 only."""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from app.core.official_identity import INSTITUTIONAL_TIMEZONE
from app.schemas.analytics_v2 import AnalyticsV2Comparison, AnalyticsV2Period


def period(date_from: date, date_to: date) -> AnalyticsV2Period:
    return AnalyticsV2Period(
        date_from=date_from, date_to=date_to, days=(date_to - date_from).days + 1,
        start_at=datetime.combine(date_from, time.min, INSTITUTIONAL_TIMEZONE).astimezone(timezone.utc),
        end_exclusive=datetime.combine(date_to + timedelta(days=1), time.min, INSTITUTIONAL_TIMEZONE).astimezone(timezone.utc),
    )


def equivalent_periods(date_from: date, date_to: date, *, now: datetime):
    if now.tzinfo is None:
        raise ValueError("O relógio deve conter fuso horário")
    if date_to >= now.astimezone(INSTITUTIONAL_TIMEZONE).date():
        raise ValueError("Use dias civis encerrados: date_to deve ser anterior a hoje em America/Bahia")
    current = period(date_from, date_to)
    previous_end = date_from - timedelta(days=1)
    return current, period(date_from - timedelta(days=current.days), previous_end)


def calendar_months(date_from: date, date_to: date):
    """Consecutive calendar buckets, clipped to the requested interval."""
    cursor = date_from.replace(day=1)
    while cursor <= date_to:
        next_month = date(cursor.year + (cursor.month == 12), cursor.month % 12 + 1, 1)
        yield cursor.strftime("%Y-%m"), max(cursor, date_from), min(next_month - timedelta(days=1), date_to)
        cursor = next_month


def compare(current: Decimal | None, previous: Decimal | None) -> AnalyticsV2Comparison:
    delta = current - previous if current is not None and previous is not None else None
    percent = delta / previous * 100 if delta is not None and previous != 0 else None
    return AnalyticsV2Comparison(value=previous, delta=delta, delta_percent=percent)


def valid_distance(start: Decimal | None, end: Decimal | None) -> Decimal | None:
    """No imputation: a missing/regressive/nonfinite reading is not zero km."""
    if start is None or end is None:
        return None
    start, end = Decimal(str(start)), Decimal(str(end))
    if not start.is_finite() or not end.is_finite() or start < 0 or end < start:
        return None
    return end - start
