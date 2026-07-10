from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.data_import import DataImportBatchStatus, DataImportEntityType, DataImportRowStatus, DataImportSuggestedAction
from app.services.data_import_service import DataImportService


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


def build_row(status, action=DataImportSuggestedAction.CREATE):
    return SimpleNamespace(
        id=uuid4(),
        status=status,
        suggested_action=action,
        conflicts=[],
        validation_errors=[],
        applied_result=None,
        applied_at=None,
    )


@pytest.mark.asyncio
async def test_apply_integrates_only_approved_rows(monkeypatch):
    approved_create = build_row(DataImportRowStatus.APPROVED, DataImportSuggestedAction.CREATE)
    approved_update = build_row(DataImportRowStatus.APPROVED, DataImportSuggestedAction.UPDATE)
    pending = build_row(DataImportRowStatus.PENDING, DataImportSuggestedAction.CREATE)
    batch = SimpleNamespace(
        id=uuid4(),
        entity_type=DataImportEntityType.VEHICLE,
        status=DataImportBatchStatus.REVIEWING,
        source_filename="relatorio.xlsx",
        rows=[approved_create, approved_update, pending],
        applied_by_id=None,
        applied_at=None,
        summary={},
    )
    actor = SimpleNamespace(id=uuid4())
    service = DataImportService(db=FakeDb())
    service.audit = FakeAudit()

    async def fake_get_batch(_batch_id, *, with_rows=False):
        assert with_rows is True
        return batch

    async def fake_apply_row(_batch, row, _actor):
        return {"action": "UPDATE" if row is approved_update else "CREATE", "entity_id": str(uuid4())}

    monkeypatch.setattr(service, "_get_batch", fake_get_batch)
    monkeypatch.setattr(service, "_apply_row", fake_apply_row)

    result = await service.apply(batch.id, actor)

    assert result["created"] == 1
    assert result["updated"] == 1
    assert result["skipped"] == 1
    assert result["errors"] == 0
    assert approved_create.status == DataImportRowStatus.APPLIED
    assert approved_update.status == DataImportRowStatus.APPLIED
    assert pending.status == DataImportRowStatus.PENDING
    assert batch.status == DataImportBatchStatus.APPLIED
    assert batch.applied_by_id == actor.id
    assert isinstance(batch.applied_at, datetime)
    assert service.db.committed is True
    assert service.audit.records[0]["details"]["event"] == "APPLY_IMPORT"
