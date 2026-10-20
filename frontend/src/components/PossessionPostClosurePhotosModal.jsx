import Modal from './Modal'
import PossessionReturnPhotos from './PossessionReturnPhotos'

export default function PossessionPostClosurePhotosModal({ record, files, onFilesChange, saving, error, onClose, onSubmit }) {
  if (!record) return null
  return (
    <Modal open title="Adicionar fotos à posse encerrada" description={`Posse nº ${record.public_number} · ${record.vehicle_plate} · ${record.driver_name}`} onClose={onClose} canClose={!saving}>
      <form className="form-grid modal-form-grid possession-return-form" onSubmit={onSubmit}>
        <p className="helper-text modal-field-span">As fotos serão anexadas à posse com a data do envio. Os dados, a declaração e a versão do encerramento serão preservados.</p>
        <PossessionReturnPhotos supplemental files={files} onChange={onFilesChange} disabled={saving} />
        <div className="modal-field-span" role="status" aria-live="polite">
          {saving ? <p className="helper-text">Salvando fotos adicionais…</p> : null}
          {error ? <div className="alert alert-error">{error}</div> : null}
        </div>
        <div className="actions-inline modal-actions modal-field-span">
          <button type="submit" className="app-button" disabled={saving || !files.length}>{saving ? 'Salvando…' : 'Salvar fotos'}</button>
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
