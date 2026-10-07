"""Private storage for scans of paper vehicle-loan terms."""
from hashlib import sha256
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException, UploadFile
from sqlalchemy import select

from app.core.config import settings
from app.models.vehicle_loan import VehicleLoanPrintedTerm
from app.services.audit_service import AuditService
from app.services.vehicle_loan_service import VehicleLoanService


MAX_TERM_BYTES = 10 * 1024 * 1024
TERM_FORMATS = {
    '.pdf': ('application/pdf', lambda data: data.startswith(b'%PDF-')),
    '.jpg': ('image/jpeg', lambda data: data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9')),
    '.jpeg': ('image/jpeg', lambda data: data.startswith(b'\xff\xd8\xff') and data.endswith(b'\xff\xd9')),
    '.png': ('image/png', lambda data: data.startswith(b'\x89PNG\r\n\x1a\n')),
}


class VehicleLoanPrintedTermService:
    def __init__(self, db):
        self.db = db
        self.loans = VehicleLoanService(db)

    async def list(self, loan_id: UUID, user):
        await self.loans.get(loan_id, user)
        rows = await self.db.scalars(select(VehicleLoanPrintedTerm)
            .where(VehicleLoanPrintedTerm.loan_id == loan_id)
            .order_by(VehicleLoanPrintedTerm.created_at, VehicleLoanPrintedTerm.id))
        return rows.all()

    async def get(self, loan_id: UUID, term_id: UUID, user):
        await self.loans.get(loan_id, user)
        term = await self.db.get(VehicleLoanPrintedTerm, term_id)
        if term is None or term.loan_id != loan_id:
            raise HTTPException(404, 'Termo impresso não encontrado')
        root = settings.STORAGE_DIR.resolve()
        path = (root / term.storage_path).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise HTTPException(404, 'Arquivo do termo impresso não encontrado')
        return term, path

    async def upload(self, loan_id: UUID, upload: UploadFile, user):
        await self.loans.get(loan_id, user)
        name = (upload.filename or '').replace('\\', '/').split('/')[-1].strip()
        extension = Path(name).suffix.lower()
        if not name or len(name) > 255 or extension not in TERM_FORMATS:
            raise HTTPException(400, 'Envie o termo impresso em PDF, JPG ou PNG')
        mime_type, valid = TERM_FORMATS[extension]
        try:
            content = await upload.read(MAX_TERM_BYTES + 1)
        finally:
            await upload.close()
        if not content:
            raise HTTPException(400, 'O arquivo está vazio')
        if len(content) > MAX_TERM_BYTES:
            raise HTTPException(413, 'O termo impresso deve ter até 10 MB')
        if not valid(content):
            raise HTTPException(400, 'O conteúdo não corresponde ao formato do arquivo')

        term_id = uuid4()
        relative = Path('vehicle_loan_terms') / str(loan_id) / f'{term_id}{extension}'
        root = settings.STORAGE_DIR.resolve()
        path = (root / relative).resolve()
        if not path.is_relative_to(root):
            raise HTTPException(500, 'Caminho de armazenamento inválido')
        term = VehicleLoanPrintedTerm(id=term_id, loan_id=loan_id, original_filename=name,
            storage_path=relative.as_posix(), mime_type=mime_type, size_bytes=len(content),
            sha256=sha256(content).hexdigest(), uploaded_by_user_id=user.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            with path.open('xb') as target:
                target.write(content)
            self.db.add(term)
            await AuditService(self.db).record(actor=user, action='UPLOAD_LOAN_PRINTED_TERM',
                entity_type='VEHICLE_LOAN', entity_id=loan_id, entity_label=name,
                details={'attachment_id': str(term_id), 'sha256': term.sha256, 'size_bytes': term.size_bytes})
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            path.unlink(missing_ok=True)
            raise
        await self.db.refresh(term)
        return term
