"""Prepare private return evidence; the caller owns the database transaction."""
import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.models.possession_photo import VehiclePossessionPhoto
from app.repositories.possession_trip_repository import PossessionReturnConfirmationRepository
from app.services.audit_service import AuditService
from app.services.possession_service import PossessionService

MAX_RETURN_PHOTOS = 10
MAX_RETURN_PHOTO_TOTAL = 32 * 1024 * 1024


class PossessionReturnPhotoService:
    def __init__(self, db):
        self.db = db
        self.storage = PossessionService(db)

    async def prepare(self, photos: list[UploadFile]) -> list[dict]:
        try:
            if len(photos) > MAX_RETURN_PHOTOS:
                raise HTTPException(400, 'Anexe no máximo 10 fotos da devolução.')
            payloads = []
            total = 0
            for photo in photos:
                content, mime = await self.storage._read_and_validate_photo(photo)
                total += len(content)
                if total > MAX_RETURN_PHOTO_TOTAL:
                    raise HTTPException(413, 'As fotos da devolução excedem o limite total de 32 MB.')
                payloads.append({'id': uuid4(), 'content': content, 'mime_type': mime,
                                 'size_bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()})
            return payloads
        finally:
            for photo in photos:
                await photo.close()

    @staticmethod
    def manifest(payloads: list[dict]) -> list[dict]:
        return [{'id': str(p['id']), 'sha256': p['sha256'], 'size_bytes': p['size_bytes'],
                 'mime_type': p['mime_type']} for p in payloads]

    def store(self, payloads, *, possession, confirmation, user, stored_paths: list[Path], evidence_stage="return"):
        for payload in payloads:
            relative, absolute = self.storage._build_photo_storage_paths(payload['id'], payload['mime_type'])
            # Track before writing so a partial filesystem write is cleaned up as well.
            stored_paths.append(absolute)
            self.storage._store_file(absolute, payload['content'])
            self.db.add(VehiclePossessionPhoto(
                id=payload['id'], possession_id=possession.id,
                evidence_stage=evidence_stage, return_confirmation_id=confirmation.id if confirmation else None,
                return_confirmation_version=confirmation.version if confirmation else None, uploaded_by_user_id=user.id,
                content_sha256=payload['sha256'], photo_path=relative,
                photo_mime_type=payload['mime_type'], photo_size_bytes=payload['size_bytes'],
                photo_captured_at=None, capture_latitude=None, capture_longitude=None,
                capture_accuracy_meters=None,
            ))

    def cleanup(self, paths):
        self.storage._cleanup_files(paths)


    async def append_to_closed(self, possession_id, photos, user) -> int:
        """Append later evidence without changing any closure or signed snapshot."""
        if not self.storage._can_view_personal_data(user):
            raise HTTPException(403, 'Acesso restrito a operadores de posse.')
        stored_paths = []
        try:
            possession = await self.storage.possessions.get_by_id_for_update(possession_id)
            if possession is None:
                raise HTTPException(404, 'Registro de posse não encontrado.')
            await self.storage._ensure_possession_visible_to_user(possession, user)
            if possession.end_date is None:
                raise HTTPException(409, 'Esta ação está disponível somente para posses encerradas.')
            if not photos:
                raise HTTPException(400, 'Selecione ao menos uma foto.')
            payloads = await self.prepare(photos)
            known = {photo.content_sha256 for photo in possession.photos
                     if getattr(photo, 'evidence_stage', None) == 'post_return'}
            new_payloads = []
            for payload in payloads:
                if payload['sha256'] not in known:
                    new_payloads.append(payload)
                    known.add(payload['sha256'])
            # The possession lock serializes concurrent uploads; content hashes also
            # make repeating the same upload after a network timeout safe.
            if not new_payloads:
                await self.db.commit()
                return 0
            confirmation = await PossessionReturnConfirmationRepository(self.db).get_current(possession_id)
            self.store(new_payloads, possession=possession, confirmation=confirmation, user=user,
                       stored_paths=stored_paths, evidence_stage='post_return')
            await AuditService(self.db).record(
                actor=user, action='POSSESSION_POST_CLOSURE_PHOTOS', entity_type='POSSESSION',
                entity_id=possession.id, entity_label=f'Posse {possession.public_number}',
                details={'added_count': len(new_payloads), 'evidence_stage': 'post_return',
                         'evidence': self.manifest(new_payloads), 'closure_unchanged': True,
                         'reference_confirmation_id': str(confirmation.id) if confirmation else None},
            )
            await self.db.flush()
            await self.db.commit()
            return len(new_payloads)
        except Exception:
            await self.db.rollback()
            self.cleanup(stored_paths)
            raise
        finally:
            for photo in photos:
                await photo.close()
