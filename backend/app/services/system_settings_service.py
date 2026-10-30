from copy import deepcopy
from datetime import datetime, timezone
import io
from pathlib import Path
import re
import time
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError
from sqlalchemy import select, text

from app.core.config import settings
from app.core.settings_catalog import DEFAULT_SETTINGS, FORM_FIELDS, ICON_KEYS, NAVIGATION, merged_settings
from app.models.system_settings import SystemSettings

_runtime_values = merged_settings()
_loaded_at = 0.0


def runtime_settings():
    return _runtime_values


def publish_runtime(values):
    global _runtime_values, _loaded_at
    _runtime_values = merged_settings(values)
    _loaded_at = time.monotonic()


async def refresh_runtime(db):
    if settings.APP_ENV == 'testing' or time.monotonic() - _loaded_at < 5:
        return
    row = await db.get(SystemSettings, 1)
    publish_runtime(row.values if row else None)


def logo_directory():
    return Path(settings.STORAGE_DIR) / 'system-identity'


def logo_file(token):
    if not re.fullmatch(r'[a-f0-9]{32}\.png', token):
        raise HTTPException(404, 'Imagem não encontrada')
    path = logo_directory() / token
    if not path.is_file():
        raise HTTPException(404, 'Imagem não encontrada. Envie a logo novamente.')
    return path


class SystemSettingsService:
    def __init__(self, db):
        self.db = db

    async def get(self, *, catalog=False):
        row = await self.db.get(SystemSettings, 1)
        values = merged_settings(row.values if row else None)
        publish_runtime(values)
        response = {'revision': row.revision if row else 0, 'values': values,
                    'updated_at': row.updated_at if row else None,
                    'form_catalog': {module: [{'key': key, 'label': label, 'required': required, 'locked_visibility': module == 'vehicle_loans' and key == 'delivery_condition'}
                                             for key, label, required in fields] for module, fields in FORM_FIELDS.items()}}
        if catalog:
            response.update(defaults=deepcopy(DEFAULT_SETTINGS), icons=list(ICON_KEYS), navigation=NAVIGATION,
                            form_catalog={module: [{'key': key, 'label': label, 'required': required, 'locked_visibility': module == 'vehicle_loans' and key == 'delivery_condition'}
                                                   for key, label, required in fields] for module, fields in FORM_FIELDS.items()})
        return response

    async def update(self, data, actor):
        from app.services.audit_service import AuditService
        # Serialize first insert as well as updates without lost writes.
        await self.db.execute(text("SELECT pg_advisory_xact_lock(630029001)"))
        row = await self.db.scalar(select(SystemSettings).where(SystemSettings.id == 1).with_for_update()
                                   .execution_options(populate_existing=True))
        revision = row.revision if row else 0
        if revision != data.expected_revision:
            raise HTTPException(409, 'Os parâmetros foram alterados por outra sessão. Seu rascunho foi mantido; atualize a referência e confira as diferenças antes de salvar.')
        values = data.values.model_dump()
        logo = values['identity']['logoPath']
        if logo != '/brasao-pmtf.png':
            logo_file(logo.rsplit('/', 1)[-1])
        before = merged_settings(row.values if row else None)
        if row is None:
            row = SystemSettings(id=1, values=values, revision=1)
            self.db.add(row)
        else:
            row.values = values
            row.revision += 1
        row.updated_by = actor.id
        row.updated_at = datetime.now(timezone.utc)
        await AuditService(self.db).record(actor=actor, action='UPDATE', entity_type='SYSTEM_SETTINGS',
            entity_id=UUID(int=1), entity_label='Parâmetros do sistema',
            details={'before': before, 'after': values, 'revision': row.revision, 'justification': data.justification})
        await self.db.commit()
        publish_runtime(values)
        return await self.get(catalog=True)

    async def upload_logo(self, upload: UploadFile, actor):
        from app.services.audit_service import AuditService
        content = await upload.read(2 * 1024 * 1024 + 1)
        if not content or len(content) > 2 * 1024 * 1024:
            raise HTTPException(422, 'Escolha uma imagem PNG, JPG ou WEBP de até 2 MB.')
        try:
            with Image.open(io.BytesIO(content)) as source:
                if source.format not in ('PNG', 'JPEG', 'WEBP') or source.width * source.height > 16_000_000:
                    raise ValueError()
                source.load()
                image = source.convert('RGBA')
                image.thumbnail((1600, 1600))
                output = io.BytesIO()
                image.save(output, format='PNG')
        except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
            raise HTTPException(422, 'Não foi possível abrir a imagem. Use um arquivo PNG, JPG ou WEBP válido.') from exc
        directory = logo_directory()
        directory.mkdir(parents=True, exist_ok=True)
        token = f'{uuid4().hex}.png'
        (directory / token).write_bytes(output.getvalue())
        # Upload is a draft asset. Publishing requires the reviewed settings update.
        await AuditService(self.db).record(actor=actor, action='UPLOAD', entity_type='SYSTEM_LOGO',
            entity_id=uuid4(), entity_label='Logo preparada para prévia', details={'asset': token})
        await self.db.commit()
        return {'logoPath': f'/api/system-settings/logo/{token}'}
