from io import BytesIO

from openpyxl import Workbook

from app.models.data_import import DataImportEntityType
from app.models.fine import FineStatus
from app.services.data_import_service import DataImportService


def _fine_workbook_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "GERAL"
    for _ in range(5):
        sheet.append([])
    sheet.append([
        "PLACA",
        "RENAVAM",
        "VINCULO",
        "MODELO",
        "SECRETARIA",
        "A. INFRAÇÃO",
        "TIPO DA INFRAÇÃO",
        "DATA ",
        "HORA",
        "LOCAL",
        "C.I.",
        "ENVIADO",
        "PROCESSO",
        "V.MULTA",
        "SITUAÇÃO",
        "TIPO",
        "MOTORISTA",
        "OBS",
    ])
    sheet.append([
        "ABC-1D23",
        "123456789",
        "LOCALIZA",
        "VW/POLO",
        "SEC.ADM",
        "S049803328",
        "TRANS VELOC SUP ATE 20%",
        "2026-05-08",
        "09:40",
        "BR367 KM25",
        "442/26",
        "2026-05-28",
        "PR-44259/26",
        130.16,
        "A PAGAR",
        "VEICULO",
        "MAGNO",
        "OBS IMPORTADA",
    ])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _empty_context():
    return {
        "vehicles_by_plate": {},
        "vehicles_by_chassis": {},
        "vehicles_by_renavam": {},
        "drivers_by_document": {},
        "drivers_by_cnh": {},
        "drivers_by_name": {},
        "fines_by_ticket_vehicle": {},
        "infractions_by_code": {},
        "infractions_by_description": {},
        "infractions": [],
        "allocations": {},
        "organizations": {},
    }


def test_detects_legacy_fines_report_header_and_rows():
    service = DataImportService(db=None)
    rows = service._read_upload_rows(_fine_workbook_bytes(), ".xlsx")
    entity_type, header_index, header = service._detect_header(rows)
    records = service._build_raw_records(rows, header_index, header)

    assert entity_type == DataImportEntityType.FINE
    assert header_index == 5
    assert "A. INFRAÇÃO" in header
    assert "V.MULTA" in header
    assert len(records) == 1
    assert records[0][1]["PLACA"] == "ABC-1D23"


def test_maps_legacy_fine_status_values():
    service = DataImportService(db=None)

    assert service._map_fine_status("A PAGAR") == FineStatus.PENDENTE.value
    assert service._map_fine_status("PAGO") == FineStatus.PAGA.value
    assert service._map_fine_status("PAGA") == FineStatus.PAGA.value
    assert service._map_fine_status("DEFERIDA") == FineStatus.DEFERIDA.value
    assert service._map_fine_status("") == FineStatus.PENDENTE.value


def test_maps_fine_row_with_provisional_vehicle_and_infraction():
    service = DataImportService(db=None)
    raw = {
        "PLACA": "ZZZ-1234",
        "RENAVAM": "998877",
        "VINCULO": "LOCALIZA",
        "MODELO": "VW/POLO",
        "A. INFRAÇÃO": "AUTO-1",
        "TIPO DA INFRAÇÃO": "INFRAÇÃO NOVA",
        "DATA ": "08/05/2026",
        "V.MULTA": "130,16",
        "SITUAÇÃO": "DEFERIDA",
        "TIPO": "VEICULO",
    }
    key_counts = service._build_key_counts(DataImportEntityType.FINE, [(7, raw)])

    mapped, official, triage, errors, conflicts = service._map_fine(raw, key_counts, _empty_context())

    assert errors == []
    assert mapped["status"] == FineStatus.DEFERIDA.value
    assert mapped["provisional_vehicle"]["plate"] == "ZZZ-1234"
    assert mapped["provisional_infraction"]["description"] == "INFRAÇÃO NOVA"
    assert official["source_status"] == "DEFERIDA"
    assert triage["RENAVAM"] == "998877"
    assert any("provis" in conflict.lower() for conflict in conflicts)
