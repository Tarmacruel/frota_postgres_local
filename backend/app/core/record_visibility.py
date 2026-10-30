"""Hide archived presentation rows, preserving the operational/financial ledger.

GETs exclude inactive business records, including SQL aggregates and eager loads.
Writes retain integrity checks over the complete history; their explicit input IDs
are checked before reaching services. Loan responsibility calculations deliberately
keep effective handoffs; only the loan presentation is filtered.
"""
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy import event, select, or_
from sqlalchemy.orm import Session, with_loader_criteria
from app.models.system_settings import RecordControl


def visible_record(model, module):
    return ~select(RecordControl.record_id).where(RecordControl.module == module,
        RecordControl.record_id == model.id, RecordControl.inactive.is_(True)).exists()


def visible_source(source_id, vehicle_id):
    return ~select(RecordControl.record_id).where(RecordControl.inactive.is_(True),
        or_(RecordControl.record_id == source_id, RecordControl.record_id == vehicle_id)).exists()


@event.listens_for(Session, 'do_orm_execute')
def apply_visibility(state):
    if not state.is_select or state.execution_options.get('include_inactive'):
        return
    info = state.session.info
    if info.get('visibility_role') == 'SUPERUSER':
        return
    if info.get('presentation_read'):
        from app.core.record_catalog import record_modules
        for module, spec in record_modules().items():
            if module != 'vehicle_loans':
                state.statement = state.statement.options(with_loader_criteria(spec.model,
                    visible_record(spec.model, module), include_aliases=True))
        from app.models.document_signature import DigitalDocument
        from app.models.audit_log import AuditLog
        state.statement = state.statement.options(with_loader_criteria(DigitalDocument,
            ~select(RecordControl.record_id).where(RecordControl.record_id == DigitalDocument.source_id,
                RecordControl.inactive.is_(True)).exists(), include_aliases=True))
        state.statement = state.statement.options(with_loader_criteria(AuditLog,
            ~select(RecordControl.record_id).where(RecordControl.record_id == AuditLog.entity_id,
                RecordControl.inactive.is_(True)).exists(), include_aliases=True))
    # Imports contain confidential raw rows. Scope every access, including writes.
    if info.get('visibility_role') in ('ADMIN', 'PRODUCAO', 'PADRAO'):
        from app.models.data_import import DataImportBatch, DataImportRow
        org = info.get('organization_id')
        condition = DataImportBatch.organization_id == org if org else False
        batches = select(DataImportBatch.id).where(condition)
        state.statement = state.statement.options(
            with_loader_criteria(DataImportBatch, condition, include_aliases=True),
            with_loader_criteria(DataImportRow, DataImportRow.batch_id.in_(batches), include_aliases=True))


def identifiers(value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key.endswith('_id') or key in ('id', 'record_id'):
                yield from identifiers(child)
    elif isinstance(value, list):
        for child in value:
            yield from identifiers(child)
    elif isinstance(value, (str, UUID)):
        try:
            yield UUID(str(value))
        except ValueError:
            pass


async def guard_inactive_inputs(db, request, user):
    if await db.scalar(select(RecordControl.record_id).where(RecordControl.module == 'users',
            RecordControl.record_id == user.id, RecordControl.inactive.is_(True))):
        raise HTTPException(403, 'Esta conta está inativa. Solicite a reativação ao superusuário do sistema.')
    if user.role.value == 'SUPERUSER':
        return
    ids = set(identifiers(dict(request.path_params))) | set(identifiers(dict(request.query_params)))
    if request.method not in ('GET', 'HEAD') and request.headers.get('content-type', '').startswith('application/json'):
        try:
            ids.update(identifiers(await request.json()))
        except (ValueError, TypeError):
            pass
    ids.add(user.id)
    hidden = await db.scalar(select(RecordControl.record_id).where(
        RecordControl.record_id.in_(ids), RecordControl.inactive.is_(True)).limit(1))
    if hidden:
        raise HTTPException(404, 'Registro não encontrado ou indisponível. Atualize a lista e selecione um registro ativo.')
