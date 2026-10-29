from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
import math
from uuid import UUID
from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import Boolean, Date, DateTime, Enum, Float, Integer, Numeric, String, func, inspect, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.record_catalog import record_modules
from app.models.system_settings import RecordControl
from app.services.audit_service import AuditService
from app.services.system_settings_service import runtime_settings

FIELD_LABELS = {
    'nome_completo': 'Nome completo', 'documento': 'Documento', 'matricula': 'Matrícula', 'registro': 'Registro',
    'cargo': 'Cargo', 'contato': 'Contato', 'email': 'E-mail', 'cnh_numero': 'Número da CNH',
    'cnh_categoria': 'Categoria da CNH', 'cnh_validade': 'Validade da CNH', 'rg': 'RG',
    'data_nascimento': 'Nascimento', 'data_emissao_cnh': 'Emissão da CNH', 'ativo': 'Cadastro ativo',
    'organization_id': 'Secretaria', 'driver_name': 'Condutor', 'driver_document': 'Documento do condutor',
    'driver_contact': 'Contato do condutor', 'observation': 'Observação', 'reason': 'Motivo',
    'delivery_condition': 'Condições de entrega', 'return_condition': 'Condições de devolução',
    'expected_return_at': 'Devolução prevista', 'descricao': 'Descrição', 'local': 'Local',
    'boletim_ocorrencia': 'Boletim de ocorrência', 'valor_estimado': 'Prejuízo estimado (R$)',
    'justificativa_encerramento': 'Justificativa de encerramento', 'ticket_number': 'Auto de infração',
    'description': 'Descrição', 'location': 'Local', 'notes': 'Observações', 'service_description': 'Serviço',
    'parts_replaced': 'Peças', 'plate': 'Placa', 'chassis_number': 'Chassi', 'brand': 'Marca', 'model': 'Modelo',
    'process_number': 'Processo', 'invoice_number': 'Nota fiscal', 'billing_number': 'Fatura',
    'object_description': 'Objeto', 'responsible_name': 'Responsável', 'name': 'Nome', 'trade_name': 'Nome fantasia',
    'address': 'Endereço', 'phone': 'Telefone',
    'year': 'Ano', 'prefix': 'Prefixo', 'patrimonio_numero_frota': 'Patrimônio / número da frota',
    'color': 'Cor', 'fuel_type': 'Combustível', 'tank_capacity_liters': 'Capacidade do tanque (L)',
    'renavam': 'Renavam', 'transmission': 'Transmissão', 'city': 'Município', 'state': 'UF',
    'registered_detran': 'Registrado no Detran', 'engine_spec': 'Motorização',
}


def spec_for(module):
    spec = record_modules().get(module)
    if not spec:
        raise HTTPException(404, 'Módulo não encontrado')
    return spec


def field_catalog(spec):
    columns = inspect(spec.model).columns
    result = []
    for key in spec.editable:
        if key not in columns:
            continue
        col = columns[key]
        kind = 'text'
        options = None
        if isinstance(col.type, Enum):
            kind, options = 'select', list(col.type.enums)
        elif isinstance(col.type, Boolean): kind = 'boolean'
        elif isinstance(col.type, DateTime): kind = 'datetime-local'
        elif isinstance(col.type, Date): kind = 'date'
        elif isinstance(col.type, (Numeric, Float, Integer)): kind = 'number'
        result.append({'key': key, 'label': FIELD_LABELS.get(key, key.replace('_', ' ').capitalize()),
                       'type': kind, 'required': not col.nullable, 'options': options,
                       'max_length': getattr(col.type, 'length', None)})
    return result


def normalize_changes(spec, changes):
    allowed = {field['key']: field for field in field_catalog(spec)}
    if not set(changes) <= allowed.keys():
        raise HTTPException(422, 'Há campos protegidos neste envio. Utilize a ação própria para estados, valores executados, vínculos e documentos.')
    result = {}
    for key, value in changes.items():
        field = allowed[key]
        if value is None or value == '':
            if field['required']:
                raise HTTPException(422, f"{field['label']}: informe um valor antes de salvar.")
            result[key] = None
            continue
        try:
            if field['type'] == 'boolean':
                if not isinstance(value, bool): raise ValueError()
            elif field['type'] == 'number':
                value = Decimal(str(value))
                if not value.is_finite() or value < 0: raise ValueError()
                numeric = inspect(spec.model).columns[key].type
                if isinstance(numeric, Numeric) and numeric.precision and value >= Decimal(10) ** (numeric.precision - (numeric.scale or 0)):
                    raise ValueError()
                if isinstance(numeric, Integer):
                    if value != value.to_integral_value() or value > 2147483647: raise ValueError()
                    value = int(value)
            elif field['type'] == 'datetime-local':
                value = datetime.fromisoformat(value.replace('Z', '+00:00'))
                if value.tzinfo is None: raise ValueError()
            elif field['type'] == 'date': value = date.fromisoformat(value)
            elif field['type'] == 'select':
                if value not in field['options']: raise ValueError()
                enum = inspect(spec.model).columns[key].type.enum_class
                value = enum[value] if enum else value
            elif key.endswith('_id'): value = UUID(str(value))
            else:
                if not isinstance(value, str): raise ValueError()
                value = value.strip()
                if (field['required'] and not value) or len(value) > (field['max_length'] or 4000): raise ValueError()
                if spec.model.__tablename__ == 'users' and key == 'email':
                    from app.schemas.common import normalize_email
                    value = normalize_email(value)
        except (ValueError, TypeError, InvalidOperation) as exc:
            raise HTTPException(422, f"{field['label']}: valor inválido. Confira o formato e tente novamente.") from exc
        result[key] = value
    return result


def validate_custom(module, values, *, require_all=False):
    config = runtime_settings()['forms'].get(module, {}).get('custom', [])
    fields = {field['key']: field for field in config if field.get('active', True)}
    if not set(values) <= fields.keys():
        raise HTTPException(422, 'Um campo adicional foi alterado na configuração. Atualize o formulário; seu preenchimento foi mantido.')
    for key, field in fields.items():
        value = values.get(key)
        if require_all and field.get('required') and (value is None or value == ''):
            raise HTTPException(422, f"Preencha {field['label']} antes de salvar.")
        if value is None or value == '': continue
        if field['type'] == 'text' and (not isinstance(value, str) or len(value) > 2000):
            raise HTTPException(422, f"{field['label']}: utilize um texto de até 2.000 caracteres.")
        if field['type'] == 'number' and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
            raise HTTPException(422, f"{field['label']}: informe um número.")
        if field['type'] == 'boolean' and not isinstance(value, bool):
            raise HTTPException(422, f"{field['label']}: selecione sim ou não.")
        if field['type'] == 'date':
            try: date.fromisoformat(value)
            except (ValueError, TypeError) as exc: raise HTTPException(422, f"{field['label']}: informe uma data válida.") from exc
    return values


class RecordAdminService:
    def __init__(self, db): self.db = db

    async def _control(self, module, record_id, *, lock=False):
        query = select(RecordControl).where(RecordControl.module == module, RecordControl.record_id == record_id)
        if lock: query = query.with_for_update().execution_options(populate_existing=True)
        return await self.db.scalar(query)

    async def get(self, module, record_id, *, lock=False):
        spec = spec_for(module)
        query = select(spec.model).where(spec.model.id == record_id)
        if lock: query = query.with_for_update().execution_options(populate_existing=True)
        row = await self.db.scalar(query)
        if row is None: raise HTTPException(404, 'Registro não encontrado')
        return row

    def label(self, row, spec):
        return ' · '.join(str(getattr(row, key))[:100] for key in spec.search[:2] if getattr(row, key, None)) or str(row.id)

    async def list(self, module, *, search=None, inactive=None, page=1, limit=20):
        spec = spec_for(module)
        model = spec.model
        query = select(model).outerjoin(RecordControl, (RecordControl.module == module) & (RecordControl.record_id == model.id))
        if inactive is True: query = query.where(RecordControl.inactive.is_(True))
        elif inactive is False: query = query.where(or_(RecordControl.inactive.is_(False), RecordControl.inactive.is_(None)))
        if search:
            term = '%' + search.strip().replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_') + '%'
            conditions = [getattr(model, key).ilike(term, escape='\\') for key in spec.search if hasattr(model, key)]
            try: conditions.append(model.id == UUID(search))
            except ValueError: pass
            if hasattr(model, 'vehicle_id'):
                from app.models.vehicle import Vehicle
                conditions.append(model.vehicle_id.in_(select(Vehicle.id).where(Vehicle.plate.ilike(term, escape='\\'))))
            query = query.where(or_(*conditions))
        total = await self.db.scalar(select(func.count()).select_from(query.subquery()))
        rows = (await self.db.scalars(query.order_by(model.created_at.desc(), model.id).offset((page - 1) * limit).limit(limit))).all()
        ids = [row.id for row in rows]
        controls = {row.record_id: row for row in (await self.db.scalars(select(RecordControl).where(
            RecordControl.module == module, RecordControl.record_id.in_(ids)))).all()} if ids else {}
        return {'data': [{'id': row.id, 'label': self.label(row, spec), 'inactive': bool(controls.get(row.id) and controls[row.id].inactive),
                          'updated_at': getattr(row, 'updated_at', None)} for row in rows], 'total': total, 'page': page}

    async def detail(self, module, record_id):
        spec = spec_for(module)
        row = await self.get(module, record_id)
        control = await self._control(module, record_id)
        return jsonable_encoder({'id': row.id, 'label': self.label(row, spec), 'module': module,
            'fields': field_catalog(spec), 'values': {field['key']: getattr(row, field['key']) for field in field_catalog(spec)},
            'custom_fields': control.custom_fields if control else {}, 'inactive': control.inactive if control else False,
            'revision': control.revision if control else 0, 'updated_at': getattr(row, 'updated_at', None),
            'reason': control.reason if control else None,
            'lifecycle': {key: value for key, value in (await self.lifecycle_plan(module, row, control)).items() if not key.startswith('_')},
            'protected_hint': 'Estados, datas efetivas, valores executados e documentos são conferidos pelo fluxo de inativação ou pelas ações do próprio módulo.'})

    async def lifecycle_plan(self, module, row, control=None):
        from app.services.record_lifecycle_service import RecordLifecycleService
        return await RecordLifecycleService(self.db).plan(module, row, control)

    async def change(self, module, record_id, data, actor, *, deleting=False):
        spec = spec_for(module)
        if module == 'users':
            from sqlalchemy import text
            await self.db.execute(text('SELECT pg_advisory_xact_lock(630029002)'))
        row = await self.get(module, record_id, lock=True)
        control = await self._control(module, record_id, lock=True)
        if (control.revision if control else 0) != data.expected_revision or (
            data.expected_updated_at and str(jsonable_encoder(getattr(row, 'updated_at', None))) != data.expected_updated_at):
            raise HTTPException(409, 'Este registro mudou em outra sessão. Recarregue os dados e confira as diferenças; seu rascunho foi mantido.')
        if deleting:
            if data.confirmation != 'EXCLUIR': raise HTTPException(422, 'Digite EXCLUIR para confirmar a exclusão permanente.')
            if module == 'users':
                from app.services.user_service import UserService
                await UserService(self.db).delete(record_id, actor)
                return {'message': 'Usuário excluído'}
            await self._ensure_deletable(module, row)
            try:
                await AuditService(self.db).record(actor=actor, action='DELETE', entity_type='ADMIN_' + module.upper(),
                    entity_id=row.id, entity_label=self.label(row, spec), details={'justification': data.justification})
                # Explicit SQL deletion cannot silently invoke ORM delete-orphan cascades.
                from sqlalchemy import delete
                await self.db.execute(delete(spec.model).where(spec.model.id == row.id))
                if control: await self.db.delete(control)
                await self.db.commit()
            except IntegrityError as exc:
                await self.db.rollback()
                raise HTTPException(409, 'Este registro possui vínculos ou histórico. Inative-o para ocultar sem apagar os registros relacionados.') from exc
            return {'message': 'Registro excluído'}
        changes = normalize_changes(spec, data.changes)
        custom = validate_custom(module, data.custom_fields)
        before = {key: getattr(row, key) for key in changes}
        if control is None:
            control = RecordControl(module=module, record_id=row.id, revision=0, custom_fields={}, lifecycle_effects={}, inactive=False)
            self.db.add(control)
        previous_inactive = control.inactive
        if module == 'users' and data.inactive and not previous_inactive:
            from app.core.roles import is_superuser
            if row.id == actor.id:
                raise HTTPException(409, 'Você está usando esta conta. Use outro superusuário para inativá-la sem encerrar sua própria administração.')
            if is_superuser(row):
                from app.services.user_service import UserService
                await UserService(self.db)._keep_superuser()
        effects = None
        if data.inactive is not None and data.inactive != previous_inactive:
            from app.services.record_lifecycle_service import RecordLifecycleService
            effects = await RecordLifecycleService(self.db).apply(module, row, control, data, actor)
        for key, value in changes.items(): setattr(row, key, value)
        if changes and hasattr(row, 'updated_at'): row.updated_at = datetime.now(timezone.utc)
        if changes and module == 'vehicle_loans': row.version += 1
        if changes and module == 'possession': row.revision += 1
        control.custom_fields = {**control.custom_fields, **custom}
        if data.inactive is not None: control.inactive = data.inactive
        control.revision += 1
        control.reason = data.justification.strip()
        control.updated_by, control.updated_at = actor.id, datetime.now(timezone.utc)
        try:
            await AuditService(self.db).record(actor=actor,
                action=('INACTIVATE' if control.inactive else 'REACTIVATE') if previous_inactive != control.inactive else 'CORRECT',
                entity_type='ADMIN_' + module.upper(), entity_id=row.id, entity_label=self.label(row, spec),
                details={'before': before, 'after': changes, 'inactive_before': previous_inactive,
                         'inactive_after': control.inactive, 'custom_fields': custom, 'justification': data.justification,
                         'effects': {key: value for key, value in (effects or {}).items() if not key.startswith('_')}})
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(409, 'A correção conflita com um cadastro ou vínculo existente. Confira os identificadores e tente novamente.') from exc
        return await self.detail(module, record_id)

    async def _ensure_deletable(self, module, row):
        # Check *all* incoming FKs even if their on-delete behavior is CASCADE/SET NULL.
        from app.db.base import Base
        from app.models.contract_balance import ContractOperation, ContractReservation
        lifecycle = await self.lifecycle_plan(module, row, await self._control(module, row.id))
        if lifecycle['has_effects'] or lifecycle['children'] or not lifecycle['can_confirm']:
            raise HTTPException(409, 'Há efeitos ou registros operacionais vinculados. Use Inativar e siga a conferência dos efeitos antes de concluir.')
        for table in Base.metadata.tables.values():
            for col in table.columns:
                for fk in col.foreign_keys:
                    if fk.column.table.name == row.__tablename__ and fk.column.name == 'id':
                        if await self.db.scalar(select(col).where(col == row.id).limit(1)) is not None:
                            raise HTTPException(409, 'Este registro possui vínculos ou histórico. Use Inativar; os vínculos precisam ser tratados antes da exclusão permanente.')
        if module in ('possession', 'vehicle_loans') and (
            getattr(row, 'started_at', None) or getattr(row, 'end_date', None) is None and module == 'possession'):
            raise HTTPException(409, 'Há responsabilidade operacional registrada. Encerre ou corrija pelo módulo e utilize Inativar para preservar o histórico.')
        for model in (ContractOperation, ContractReservation):
            if await self.db.scalar(select(model.id).where(model.source_id == row.id).limit(1)):
                raise HTTPException(409, 'Há movimentação de contrato vinculada. Utilize Inativar ou a retificação financeira do módulo.')
