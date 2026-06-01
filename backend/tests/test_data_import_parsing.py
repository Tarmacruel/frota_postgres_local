from pathlib import Path

import pytest

from app.models.data_import import DataImportEntityType
from app.services.data_import_service import DataImportService


ROOT = Path(__file__).resolve().parents[2]


def _load_xlsx(name_prefix: str):
    try:
        path = next((ROOT / "storage").glob(f"{name_prefix}*.xlsx"))
    except StopIteration:
        pytest.skip(f"Relatorio real {name_prefix}*.xlsx nao encontrado em storage")
    service = DataImportService(db=None)
    rows = service._read_upload_rows(path.read_bytes(), ".xlsx")
    entity_type, header_index, header = service._detect_header(rows)
    records = service._build_raw_records(rows, header_index, header)
    return entity_type, header_index, header, records


def test_detects_vehicle_report_header_and_rows():
    entity_type, header_index, header, records = _load_xlsx("Relatorio_Ve")

    assert entity_type == DataImportEntityType.VEHICLE
    assert header_index == 6
    assert "Placa" in header
    assert "Chassi" in header
    assert "Renavam" in header
    assert len(records) == 573


def test_detects_driver_report_header_and_rows():
    entity_type, header_index, header, records = _load_xlsx("Relatorio_Condutores")

    assert entity_type == DataImportEntityType.DRIVER
    assert header_index == 5
    assert "Nome" in header
    assert "CPF" in header
    assert "CNH" in header
    assert len(records) == 558
