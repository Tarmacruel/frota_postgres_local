from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Any, Callable

from app.models.possession import VehiclePossession
from app.models.possession_trip import VehiclePossessionReturnConfirmation, VehiclePossessionTrip
from app.models.user import UserRole
from app.schemas.possession_report import PossessionReportMode, PossessionReportPreset


class ReportColumnCategory(str, Enum):
    POSSESSION = "POSSESSION"
    TRIP = "TRIP"
    DESTINATION = "DESTINATION"
    RETURN = "RETURN"
    AUDIT = "AUDIT"


class ReportDataClassification(str, Enum):
    ADMINISTRATIVE = "ADMINISTRATIVE"
    PERSONAL = "PERSONAL"
    PERSONAL_HIGH_CRITICALITY = "PERSONAL_HIGH_CRITICALITY"
    OPERATIONAL_SENSITIVE = "OPERATIONAL_SENSITIVE"
    SECURITY_METADATA = "SECURITY_METADATA"


class ReportValueKind(str, Enum):
    TEXT = "TEXT"
    INTEGER = "INTEGER"
    DECIMAL = "DECIMAL"
    DATETIME = "DATETIME"
    STATUS = "STATUS"


@dataclass(frozen=True, slots=True)
class ReportRowContext:
    possession: VehiclePossession
    trip: VehiclePossessionTrip | None = None


@dataclass(frozen=True, slots=True)
class ReportColumn:
    key: str
    title: str
    category: ReportColumnCategory
    value_kind: ReportValueKind
    extractor: Callable[[ReportRowContext], Any]
    roles: frozenset[UserRole]
    presets: frozenset[PossessionReportPreset]
    modes: frozenset[PossessionReportMode]
    classification: ReportDataClassification = ReportDataClassification.ADMINISTRATIVE
    contains_personal_data: bool = False
    masking_rule: str = "NONE"
    suggested_width: int = 16
    manual_only: bool = False


ALL_REPORT_ROLES = frozenset({UserRole.ADMIN, UserRole.PRODUCAO, UserRole.PADRAO})
OPERATIONAL_REPORT_ROLES = frozenset({UserRole.ADMIN, UserRole.PRODUCAO})
ADMIN_REPORT_ROLES = frozenset({UserRole.ADMIN})
ALL_MODES = frozenset({PossessionReportMode.POSSESSION, PossessionReportMode.TRIP})
POSSESSION_MODE = frozenset({PossessionReportMode.POSSESSION})
TRIP_MODE = frozenset({PossessionReportMode.TRIP})
SUMMARY_COMPLETE = frozenset({PossessionReportPreset.SUMMARY, PossessionReportPreset.OPERATIONAL, PossessionReportPreset.COMPLETE})
OPERATIONAL_COMPLETE = frozenset({PossessionReportPreset.OPERATIONAL, PossessionReportPreset.COMPLETE})
COMPLETE_ONLY = frozenset({PossessionReportPreset.COMPLETE})


def _enum_value(value: Any) -> Any:
    return getattr(value, "value", value)


def _current_confirmation(context: ReportRowContext) -> VehiclePossessionReturnConfirmation | None:
    return next((item for item in context.possession.return_confirmations if item.is_current), None)


def _trip_distance(trip: VehiclePossessionTrip | None) -> Decimal | None:
    if trip is None or trip.end_odometer_km is None or trip.start_odometer_km is None:
        return None
    return Decimal(trip.end_odometer_km) - Decimal(trip.start_odometer_km)


def _total_trip_distance(context: ReportRowContext) -> Decimal:
    return sum((_trip_distance(trip) or Decimal("0")) for trip in context.possession.trips)


def _ordered_destinations(trip: VehiclePossessionTrip | None) -> str:
    if trip is None:
        return ""
    return " | ".join(
        f"{destination.sequence_number}. {destination.description}"
        for destination in sorted(trip.destinations, key=lambda item: item.sequence_number)
    )


def _possession_destinations(context: ReportRowContext) -> str:
    parts: list[str] = []
    for trip in sorted(context.possession.trips, key=lambda item: item.sequence_number):
        destinations = _ordered_destinations(trip)
        if destinations:
            parts.append(f"Rota {trip.sequence_number}: {destinations}")
    return " | ".join(parts)


def _possession_status(context: ReportRowContext) -> str:
    return "ATIVA" if context.possession.end_date is None else "ENCERRADA"


def _return_status(context: ReportRowContext) -> str:
    if _current_confirmation(context):
        return "DEVOLUÇÃO_CONFIRMADA"
    if context.possession.end_date is not None:
        return "ENCERRADA_SEM_CONFIRMAÇÃO_VERSIONADA"
    return "AGUARDANDO_DEVOLUÇÃO"


def _first_departure(context: ReportRowContext) -> datetime | None:
    values = [trip.departure_at for trip in context.possession.trips if trip.departure_at]
    return min(values) if values else None


def _last_return(context: ReportRowContext) -> datetime | None:
    values = [trip.return_at for trip in context.possession.trips if trip.return_at]
    return max(values) if values else None


def _destination_count(context: ReportRowContext) -> int:
    if context.trip is not None:
        return len(context.trip.destinations)
    return sum(len(trip.destinations) for trip in context.possession.trips)


def _vehicle_identification(context: ReportRowContext) -> str:
    vehicle = context.possession.vehicle
    details = [vehicle.brand, vehicle.model, vehicle.prefix, vehicle.patrimonio_numero_frota]
    return " / ".join(str(item) for item in details if item)


POSSESSION_REPORT_COLUMNS: tuple[ReportColumn, ...] = (
    ReportColumn("possession_number", "Nº da posse", ReportColumnCategory.POSSESSION, ReportValueKind.INTEGER, lambda c: c.possession.public_number, ALL_REPORT_ROLES, SUMMARY_COMPLETE, ALL_MODES, suggested_width=13),
    ReportColumn("vehicle_plate", "Placa", ReportColumnCategory.POSSESSION, ReportValueKind.TEXT, lambda c: c.possession.vehicle.plate, ALL_REPORT_ROLES, SUMMARY_COMPLETE, ALL_MODES, suggested_width=12),
    ReportColumn("vehicle_identification", "Identificação do veículo", ReportColumnCategory.POSSESSION, ReportValueKind.TEXT, _vehicle_identification, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, ALL_MODES, suggested_width=28),
    ReportColumn("driver_name", "Condutor", ReportColumnCategory.POSSESSION, ReportValueKind.TEXT, lambda c: c.possession.driver_name, OPERATIONAL_REPORT_ROLES, SUMMARY_COMPLETE, ALL_MODES, ReportDataClassification.PERSONAL, True, "FORBIDDEN_TO_STANDARD_ROLE", 24),
    ReportColumn("driver_document", "Documento do condutor", ReportColumnCategory.POSSESSION, ReportValueKind.TEXT, lambda c: c.possession.driver_document, OPERATIONAL_REPORT_ROLES, COMPLETE_ONLY, ALL_MODES, ReportDataClassification.PERSONAL_HIGH_CRITICALITY, True, "FORBIDDEN_TO_STANDARD_ROLE", 20),
    ReportColumn("driver_contact", "Contato do condutor", ReportColumnCategory.POSSESSION, ReportValueKind.TEXT, lambda c: c.possession.driver_contact, OPERATIONAL_REPORT_ROLES, COMPLETE_ONLY, ALL_MODES, ReportDataClassification.PERSONAL, True, "FORBIDDEN_TO_STANDARD_ROLE", 18),
    ReportColumn("possession_start", "Início da posse", ReportColumnCategory.POSSESSION, ReportValueKind.DATETIME, lambda c: c.possession.start_date, ALL_REPORT_ROLES, SUMMARY_COMPLETE, ALL_MODES, suggested_width=20),
    ReportColumn("possession_end", "Fim da posse", ReportColumnCategory.POSSESSION, ReportValueKind.DATETIME, lambda c: c.possession.end_date, ALL_REPORT_ROLES, SUMMARY_COMPLETE, ALL_MODES, suggested_width=20),
    ReportColumn("possession_status", "Status da posse", ReportColumnCategory.POSSESSION, ReportValueKind.STATUS, _possession_status, ALL_REPORT_ROLES, SUMMARY_COMPLETE, ALL_MODES, suggested_width=16),
    ReportColumn("possession_start_odometer", "Hodômetro inicial da posse", ReportColumnCategory.POSSESSION, ReportValueKind.DECIMAL, lambda c: c.possession.start_odometer_km, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, POSSESSION_MODE, suggested_width=18),
    ReportColumn("possession_end_odometer", "Hodômetro final da posse", ReportColumnCategory.POSSESSION, ReportValueKind.DECIMAL, lambda c: c.possession.end_odometer_km, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, POSSESSION_MODE, suggested_width=18),
    ReportColumn("trip_count", "Quantidade de rotas", ReportColumnCategory.TRIP, ReportValueKind.INTEGER, lambda c: len(c.possession.trips), ALL_REPORT_ROLES, SUMMARY_COMPLETE, POSSESSION_MODE, suggested_width=15),
    ReportColumn("destination_count", "Quantidade de destinos", ReportColumnCategory.DESTINATION, ReportValueKind.INTEGER, _destination_count, ALL_REPORT_ROLES, OPERATIONAL_COMPLETE, ALL_MODES, suggested_width=17),
    ReportColumn("total_trip_kilometers", "Quilômetros totais", ReportColumnCategory.TRIP, ReportValueKind.DECIMAL, _total_trip_distance, ALL_REPORT_ROLES, SUMMARY_COMPLETE, POSSESSION_MODE, suggested_width=16),
    ReportColumn("first_trip_departure", "Primeira saída", ReportColumnCategory.TRIP, ReportValueKind.DATETIME, _first_departure, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, POSSESSION_MODE, suggested_width=20),
    ReportColumn("last_trip_return", "Último retorno", ReportColumnCategory.TRIP, ReportValueKind.DATETIME, _last_return, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, POSSESSION_MODE, suggested_width=20),
    ReportColumn("destinations", "Destinos", ReportColumnCategory.DESTINATION, ReportValueKind.TEXT, lambda c: _ordered_destinations(c.trip) if c.trip else _possession_destinations(c), OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, ALL_MODES, ReportDataClassification.OPERATIONAL_SENSITIVE, False, "FORBIDDEN_TO_STANDARD_ROLE", 36),
    ReportColumn("possession_observation", "Observações da posse", ReportColumnCategory.POSSESSION, ReportValueKind.TEXT, lambda c: c.possession.observation, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, POSSESSION_MODE, ReportDataClassification.PERSONAL, True, "OPERATIONAL_CAUTION", 32),
    ReportColumn("return_status", "Situação da devolução", ReportColumnCategory.RETURN, ReportValueKind.STATUS, _return_status, ALL_REPORT_ROLES, COMPLETE_ONLY, POSSESSION_MODE, suggested_width=28),
    ReportColumn("return_condition_notes", "Condições na devolução", ReportColumnCategory.RETURN, ReportValueKind.TEXT, lambda c: getattr(_current_confirmation(c), "vehicle_condition_notes", None), OPERATIONAL_REPORT_ROLES, COMPLETE_ONLY, POSSESSION_MODE, ReportDataClassification.PERSONAL, True, "OPERATIONAL_CAUTION", 34),
    ReportColumn("trip_sequence", "Nº da rota", ReportColumnCategory.TRIP, ReportValueKind.INTEGER, lambda c: c.trip.sequence_number if c.trip else None, ALL_REPORT_ROLES, SUMMARY_COMPLETE, TRIP_MODE, suggested_width=11),
    ReportColumn("trip_status", "Status da rota", ReportColumnCategory.TRIP, ReportValueKind.STATUS, lambda c: _enum_value(c.trip.status) if c.trip else None, ALL_REPORT_ROLES, SUMMARY_COMPLETE, TRIP_MODE, suggested_width=16),
    ReportColumn("trip_origin", "Origem", ReportColumnCategory.TRIP, ReportValueKind.TEXT, lambda c: c.trip.origin if c.trip else None, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, TRIP_MODE, ReportDataClassification.OPERATIONAL_SENSITIVE, False, "FORBIDDEN_TO_STANDARD_ROLE", 24),
    ReportColumn("trip_purpose", "Finalidade", ReportColumnCategory.TRIP, ReportValueKind.TEXT, lambda c: c.trip.purpose if c.trip else None, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, TRIP_MODE, ReportDataClassification.OPERATIONAL_SENSITIVE, False, "FORBIDDEN_TO_STANDARD_ROLE", 28),
    ReportColumn("trip_departure", "Saída", ReportColumnCategory.TRIP, ReportValueKind.DATETIME, lambda c: c.trip.departure_at if c.trip else None, ALL_REPORT_ROLES, SUMMARY_COMPLETE, TRIP_MODE, suggested_width=20),
    ReportColumn("trip_return", "Retorno", ReportColumnCategory.TRIP, ReportValueKind.DATETIME, lambda c: c.trip.return_at if c.trip else None, ALL_REPORT_ROLES, SUMMARY_COMPLETE, TRIP_MODE, suggested_width=20),
    ReportColumn("trip_start_odometer", "Hodômetro de saída", ReportColumnCategory.TRIP, ReportValueKind.DECIMAL, lambda c: c.trip.start_odometer_km if c.trip else None, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, TRIP_MODE, suggested_width=18),
    ReportColumn("trip_end_odometer", "Hodômetro de retorno", ReportColumnCategory.TRIP, ReportValueKind.DECIMAL, lambda c: c.trip.end_odometer_km if c.trip else None, OPERATIONAL_REPORT_ROLES, OPERATIONAL_COMPLETE, TRIP_MODE, suggested_width=18),
    ReportColumn("trip_kilometers", "Quilômetros da rota", ReportColumnCategory.TRIP, ReportValueKind.DECIMAL, lambda c: _trip_distance(c.trip), ALL_REPORT_ROLES, SUMMARY_COMPLETE, TRIP_MODE, suggested_width=17),
    ReportColumn("trip_observation", "Observações da rota", ReportColumnCategory.TRIP, ReportValueKind.TEXT, lambda c: c.trip.observation if c.trip else None, OPERATIONAL_REPORT_ROLES, COMPLETE_ONLY, TRIP_MODE, ReportDataClassification.PERSONAL, True, "OPERATIONAL_CAUTION", 32),
    ReportColumn("trip_cancellation_reason", "Justificativa de cancelamento", ReportColumnCategory.TRIP, ReportValueKind.TEXT, lambda c: c.trip.cancellation_reason if c.trip else None, OPERATIONAL_REPORT_ROLES, COMPLETE_ONLY, TRIP_MODE, ReportDataClassification.OPERATIONAL_SENSITIVE, False, "FORBIDDEN_TO_STANDARD_ROLE", 34),
    ReportColumn("capture_latitude", "Latitude da entrega", ReportColumnCategory.AUDIT, ReportValueKind.DECIMAL, lambda c: c.possession.capture_latitude, OPERATIONAL_REPORT_ROLES, frozenset(), POSSESSION_MODE, ReportDataClassification.OPERATIONAL_SENSITIVE, True, "MANUAL_SELECTION_ONLY", 18, True),
    ReportColumn("capture_longitude", "Longitude da entrega", ReportColumnCategory.AUDIT, ReportValueKind.DECIMAL, lambda c: c.possession.capture_longitude, OPERATIONAL_REPORT_ROLES, frozenset(), POSSESSION_MODE, ReportDataClassification.OPERATIONAL_SENSITIVE, True, "MANUAL_SELECTION_ONLY", 18, True),
    ReportColumn("return_confirmation_hash", "Hash da confirmação", ReportColumnCategory.AUDIT, ReportValueKind.TEXT, lambda c: getattr(_current_confirmation(c), "canonical_payload_hash", None), ADMIN_REPORT_ROLES, frozenset(), POSSESSION_MODE, ReportDataClassification.SECURITY_METADATA, False, "ADMIN_MANUAL_SELECTION_ONLY", 32, True),
    ReportColumn("return_request_id", "Request ID da confirmação", ReportColumnCategory.AUDIT, ReportValueKind.TEXT, lambda c: getattr(_current_confirmation(c), "request_id", None), ADMIN_REPORT_ROLES, frozenset(), POSSESSION_MODE, ReportDataClassification.SECURITY_METADATA, False, "ADMIN_MANUAL_SELECTION_ONLY", 24, True),
    ReportColumn("return_ip_address", "IP da confirmação", ReportColumnCategory.AUDIT, ReportValueKind.TEXT, lambda c: str(value) if (value := getattr(_current_confirmation(c), "ip_address", None)) is not None else None, ADMIN_REPORT_ROLES, frozenset(), POSSESSION_MODE, ReportDataClassification.SECURITY_METADATA, False, "ADMIN_MANUAL_SELECTION_ONLY", 18, True),
    ReportColumn("return_user_agent", "User-Agent da confirmação", ReportColumnCategory.AUDIT, ReportValueKind.TEXT, lambda c: getattr(_current_confirmation(c), "user_agent", None), ADMIN_REPORT_ROLES, frozenset(), POSSESSION_MODE, ReportDataClassification.SECURITY_METADATA, False, "ADMIN_MANUAL_SELECTION_ONLY", 32, True),
)


REPORT_COLUMN_BY_KEY = {column.key: column for column in POSSESSION_REPORT_COLUMNS}


def columns_for_role_and_mode(role: UserRole, mode: PossessionReportMode) -> list[ReportColumn]:
    return [column for column in POSSESSION_REPORT_COLUMNS if role in column.roles and mode in column.modes]


def preset_columns(role: UserRole, mode: PossessionReportMode, preset: PossessionReportPreset) -> list[ReportColumn]:
    return [
        column
        for column in columns_for_role_and_mode(role, mode)
        if preset in column.presets and not column.manual_only
    ]
