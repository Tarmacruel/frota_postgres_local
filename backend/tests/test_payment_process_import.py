from datetime import date
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.payment_process import PaymentChecklistStatus, PaymentContract, PaymentContractStatus, PaymentProcess, PaymentProcessChecklistItem, PaymentProcessKind, PaymentProcessStage
from app.models.user import UserRole
from app.schemas.payment_process import PaymentProcessDelete
from app.services.payment_process_service import PaymentProcessService


ROOT = Path(__file__).resolve().parents[2]


class FakeDb:
    def __init__(self):
        self.committed = False
        self.rolled_back = False

    async def commit(self):
        self.committed = True

    async def rollback(self):
        self.rolled_back = True


class FakeAudit:
    def __init__(self):
        self.records = []

    async def record(self, **kwargs):
        self.records.append(kwargs)


class FakeUpload:
    def __init__(self, content: bytes, filename: str = "processos.xlsx"):
        self.content = content
        self.filename = filename
        self.closed = False

    async def read(self):
        return self.content

    async def close(self):
        self.closed = True


class FakePaymentProcessRepository:
    def __init__(self, existing_key):
        self.existing_key = existing_key
        self.created = []
        self.suppliers = []
        self.contracts = []
        self.existing = PaymentProcess(
            id=uuid4(),
            import_key=existing_key,
            process_number="PMTF-PR-2/2026",
            kind=PaymentProcessKind.FUEL,
        )

    async def flush(self):
        return None

    async def get_by_import_key(self, import_key):
        if import_key == self.existing_key:
            return self.existing
        return None

    async def create(self, record):
        record.id = uuid4()
        self.created.append(record)
        return record

    async def create_supplier(self, supplier):
        supplier.id = uuid4()
        self.suppliers.append(supplier)
        return supplier

    async def get_supplier_by_name(self, name):
        for supplier in self.suppliers:
            if supplier.name.upper() == name.upper():
                return supplier
        return None

    async def get_supplier_by_cnpj(self, cnpj):
        for supplier in self.suppliers:
            if supplier.cnpj == cnpj:
                return supplier
        return None

    async def get_supplier(self, supplier_id):
        for supplier in self.suppliers:
            if supplier.id == supplier_id:
                return supplier
        return None

    async def create_contract(self, contract):
        contract.id = uuid4()
        contract.supplier = next((supplier for supplier in self.suppliers if supplier.id == contract.supplier_id), None)
        self.contracts.append(contract)
        return contract

    async def get_contract_by_supplier_number(self, supplier_id, number):
        for contract in self.contracts:
            if contract.supplier_id == supplier_id and contract.number.upper() == number.upper():
                return contract
        return None

    async def get_contract(self, contract_id):
        for contract in self.contracts:
            if contract.id == contract_id:
                return contract
        return None

    async def contract_process_totals(self, contract_id):
        processes = [self.existing, *self.created]
        consumed = sum(
            (
                Decimal(str(process.amount or 0))
                for process in processes
                if process.contract_id == contract_id and process.stage not in {PaymentProcessStage.CANCELLED, PaymentProcessStage.RETURNED}
            ),
            Decimal("0"),
        )
        paid = sum(
            (
                Decimal(str(process.amount or 0))
                for process in processes
                if process.contract_id == contract_id and process.stage in {PaymentProcessStage.PAID, PaymentProcessStage.ARCHIVED}
            ),
            Decimal("0"),
        )
        return {"consumed_amount": consumed, "paid_amount": paid, "pending_amount": max(consumed - paid, Decimal("0"))}


class FakeDeletePaymentProcessRepository:
    def __init__(self, record):
        self.record = record
        self.deleted = None

    async def get_by_id(self, process_id):
        if self.record and self.record.id == process_id:
            return self.record
        return None

    async def delete(self, record):
        self.deleted = record

    async def get_contract(self, contract_id):
        return None


def test_parses_real_payment_process_workbook():
    path = ROOT / "storage" / "CONTROLE DE PROCESSOS DE PAGAMENTO 2025 .xlsx"
    if not path.exists():
        pytest.skip("Planilha real de processos de pagamento nao encontrada em storage")

    service = PaymentProcessService(db=None)
    rows = service._parse_workbook(path.read_bytes(), path.name)
    valid_rows = [row for row in rows if not row.get("validation_error")]
    error_rows = [row for row in rows if row.get("validation_error")]

    assert len(rows) == 226
    assert len(valid_rows) == 224
    assert len(error_rows) == 2
    assert valid_rows[0]["data"]["supplier_name"] == "L J POSTO DE COMBUSTIVEIS LTDA"
    assert valid_rows[0]["data"]["contract_number"] == "2-914-2025"
    assert valid_rows[-1]["data"]["supplier_name"] == "PRIME CONSULTORIA E ASSESSORIA EMPRESARIAL LTDA"
    assert valid_rows[-1]["data"]["contract_number"] == "2-860-2022"
    assert all(row["data"]["kind"] == PaymentProcessKind.FUEL for row in valid_rows)


def test_maps_legacy_status_to_workflow_stage():
    service = PaymentProcessService(db=None)

    assert service._stage_from_status("PAGO") == PaymentProcessStage.PAID
    assert service._stage_from_status("LIQUIDADO") == PaymentProcessStage.LIQUIDATION
    assert service._stage_from_status("EMPENHADO") == PaymentProcessStage.COMMITMENT
    assert service._stage_from_status("DEVOLVIDO") == PaymentProcessStage.RETURNED
    assert service._stage_from_status("") == PaymentProcessStage.ASSEMBLY


def test_process_alerts_warn_without_blocking_missing_financial_steps():
    service = PaymentProcessService(db=None)
    process = PaymentProcess(
        id=uuid4(),
        import_key="test",
        process_number="PMTF-PR-1/2026",
        kind=PaymentProcessKind.FUEL,
        stage=PaymentProcessStage.PAYMENT,
        amount=Decimal("100.00"),
        invoice_number="10",
        competence_month=date(2026, 1, 1),
        due_date=date(2026, 1, 20),
    )
    contract_id = uuid4()
    process.contract_id = contract_id
    process.checklist_items.append(
        PaymentProcessChecklistItem(
            stage=PaymentProcessStage.PAYMENT,
            item_label="Ordem de pagamento informada",
            status=PaymentChecklistStatus.PENDING,
        )
    )
    process.contract = PaymentContract(
        id=contract_id,
        supplier_id=uuid4(),
        number="2-914-2025",
        status=PaymentContractStatus.SUSPENDED,
        value_updated=Decimal("50.00"),
        imported_balance=Decimal("-1.00"),
    )
    process.contract.processes.append(process)

    alerts = service._process_alerts(process)

    assert "Fornecedor nao vinculado." in alerts
    assert "Ordem de pagamento nao informada." in alerts
    assert "Contrato nao esta ativo." in alerts
    assert "Processos vinculados excedem o saldo do contrato." in alerts


def test_contract_loaded_balance_is_always_calculated_from_processes():
    service = PaymentProcessService(db=None)
    contract = PaymentContract(
        id=uuid4(),
        supplier_id=uuid4(),
        number="2-914-2025",
        value_updated=Decimal("1000.00"),
        imported_balance=Decimal("99999.00"),
        status=PaymentContractStatus.ACTIVE,
    )
    contract.processes = [
        PaymentProcess(stage=PaymentProcessStage.ASSEMBLY, amount=Decimal("100.00")),
        PaymentProcess(stage=PaymentProcessStage.PAID, amount=Decimal("250.00")),
        PaymentProcess(stage=PaymentProcessStage.ARCHIVED, amount=Decimal("50.00")),
        PaymentProcess(stage=PaymentProcessStage.RETURNED, amount=Decimal("80.00")),
        PaymentProcess(stage=PaymentProcessStage.CANCELLED, amount=Decimal("90.00")),
    ]

    assert service._contract_loaded_consumed(contract) == Decimal("400.00")
    assert service._contract_balance_from_loaded(contract) == Decimal("600.00")


@pytest.mark.asyncio
async def test_import_xlsx_creates_updates_skips_duplicates_and_reports_errors(monkeypatch):
    service = PaymentProcessService(db=FakeDb())
    service.audit = FakeAudit()
    actor = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)

    create_data = {
        "process_number": "PMTF-PR-1/2026",
        "kind": PaymentProcessKind.FUEL,
        "system": "IGOV",
        "status": "PAGO",
        "supplier_name": "POSTO L J",
        "contract_number": "2-914-2025",
        "invoice_number": "10",
        "unit_name": "SECRETARIA MUNICIPAL DE ADMINISTRACAO",
    }
    update_data = {
        "process_number": "PMTF-PR-2/2026",
        "kind": PaymentProcessKind.FUEL,
        "system": "IGOV",
        "status": "FINANCAS",
        "supplier_name": "PRIME",
        "contract_number": "2-860-2022",
        "billing_number": "200",
        "invoice_number": "20",
        "unit_name": "SECRETARIA MUNICIPAL DE SAUDE",
    }
    existing_key = service._build_import_key(update_data)
    service.repository = FakePaymentProcessRepository(existing_key)

    parsed_rows = [
        {"sheet": "L J", "row_number": 7, "data": create_data, "validation_error": None},
        {"sheet": "PRIME", "row_number": 8, "data": update_data, "validation_error": None},
        {"sheet": "L J", "row_number": 9, "data": create_data, "validation_error": None},
        {"sheet": "PRIME", "row_number": 10, "data": {"process_number": None}, "validation_error": "Linha sem numero do processo"},
    ]

    monkeypatch.setattr(service, "_parse_workbook", lambda _content, _filename: parsed_rows)

    async def fake_organization_lookup():
        return {}

    monkeypatch.setattr(service, "_organization_lookup", fake_organization_lookup)

    result = await service.import_xlsx(FakeUpload(b"xlsx"), actor)

    assert result["total_rows"] == 4
    assert result["created"] == 1
    assert result["updated"] == 1
    assert result["skipped"] == 1
    assert result["errors"] == 1
    assert service.db.committed is True
    assert len(service.repository.created) == 1
    assert len(service.repository.suppliers) == 2
    assert len(service.repository.contracts) == 2
    assert service.repository.existing.status == "FINANCAS"
    process_actions = [record["action"] for record in service.audit.records if record["entity_type"] == "PAYMENT_PROCESS"]
    assert process_actions == ["CREATE", "UPDATE"]
    assert service.repository.created[0].stage.value == "PAID"
    assert service.repository.existing.stage.value == "PAYMENT"


@pytest.mark.asyncio
async def test_delete_payment_process_requires_reason_records_audit_and_removes():
    process_id = uuid4()
    service = PaymentProcessService(db=FakeDb())
    service.audit = FakeAudit()
    record = SimpleNamespace(
        id=process_id,
        process_number="PMTF-PR-1/2026",
        kind=PaymentProcessKind.FUEL,
        stage=PaymentProcessStage.ASSEMBLY,
        status="DUPLICADO",
        supplier_id=None,
        supplier=None,
        supplier_name="POSTO L J",
        contract_id=None,
        contract=None,
        contract_number="2-914-2025",
        organization_id=None,
        organization=None,
        invoice_number="10",
        billing_number="200",
        competence_month=date(2026, 1, 1),
        due_date=date(2026, 1, 20),
        amount=Decimal("150.00"),
        source_filename="processos.xlsx",
        source_sheet="L J",
        references=[],
        checklist_items=[],
        stage_events=[],
    )
    service.repository = FakeDeletePaymentProcessRepository(record)
    actor = SimpleNamespace(id=uuid4(), role=UserRole.ADMIN)

    result = await service.delete(process_id, PaymentProcessDelete(reason="Cadastro duplicado na importacao"), actor)

    assert result == {"message": "Processo de pagamento excluido"}
    assert service.repository.deleted is record
    assert service.db.committed is True
    assert service.audit.records[0]["action"] == "DELETE"
    assert service.audit.records[0]["entity_type"] == "PAYMENT_PROCESS"
    assert service.audit.records[0]["entity_id"] == process_id
    assert service.audit.records[0]["details"]["reason"] == "Cadastro duplicado na importacao"
    assert service.audit.records[0]["details"]["amount"] == "150.00"
