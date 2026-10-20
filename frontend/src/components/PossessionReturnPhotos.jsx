import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE = 8 * 1024 * 1024
const MAX_TOTAL = 32 * 1024 * 1024

export default function PossessionReturnPhotos({ files, onChange, disabled = false, supplemental = false }) {
  const inputRef = useRef(null)
  const cameraRef = useRef(null)
  const [error, setError] = useState('')
  const [previews, setPreviews] = useState([])
  const [preview, setPreview] = useState(null)

  useEffect(() => {
    const next = files.map((file) => ({ file, url: URL.createObjectURL(file) }))
    setPreviews(next)
    return () => next.forEach(({ url }) => URL.revokeObjectURL(url))
  }, [files])

  function addFiles(selected) {
    if (disabled) return
    const next = [...files]
    const errors = []
    for (const file of Array.from(selected || [])) {
      if (!TYPES.includes(file.type)) { errors.push(`${file.name}: use JPG, PNG ou WEBP.`); continue }
      if (!file.size || file.size > MAX_FILE) { errors.push(`${file.name}: o arquivo deve ter conteúdo e até 8 MB.`); continue }
      if (next.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) continue
      if (next.length >= 10) { errors.push('Anexe no máximo 10 fotos.'); break }
      if (next.reduce((total, item) => total + item.size, 0) + file.size > MAX_TOTAL) { errors.push('O limite total é de 32 MB.'); continue }
      next.push(file)
    }
    setError(errors.join(' '))
    onChange(next)
  }

  function handleFiles(event) {
    addFiles(event.target.files)
    event.target.value = ''
  }

  return (
    <section className="possession-return-photos modal-field-span" aria-labelledby="return-photos-title">
      <div className="possession-return-photo-heading">
        <strong id="return-photos-title">{supplemental ? 'Fotos adicionais' : <>Fotos da devolução <span className="muted">(opcional)</span></>}</strong>
        <span className="helper-text" aria-live="polite">{files.length} de 10 fotos</span>
      </div>
      <p className="helper-text">{supplemental ? 'As imagens serão registradas como anexos posteriores ao encerramento.' : 'Anexe imagens das condições do veículo. Elas ficarão vinculadas a este encerramento.'}</p>
      <div className="possession-return-photo-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files) }}>
        <span className="helper-text">JPG, PNG ou WEBP · até 8 MB por foto e 32 MB no total.</span>
        <div className="actions-inline">
          <button type="button" className="ghost-button" onClick={() => inputRef.current?.click()} disabled={disabled}>Selecionar fotos</button>
          <button type="button" className="ghost-button" onClick={() => cameraRef.current?.click()} disabled={disabled}>Usar câmera</button>
        </div>
      </div>
      <input ref={inputRef} type="file" hidden multiple accept={TYPES.join(',')} onChange={handleFiles} disabled={disabled} aria-label="Selecionar fotos da devolução" />
      <input ref={cameraRef} type="file" hidden accept={TYPES.join(',')} capture="environment" onChange={handleFiles} disabled={disabled} aria-label="Fotografar veículo na devolução" />
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="possession-return-photo-grid">
        {previews.map(({ file, url }, index) => (
          <figure className="possession-return-photo-item" key={url}>
            <button type="button" className="possession-return-photo-preview" onClick={() => setPreview({ file, url })} disabled={disabled} aria-label={`Ampliar ${file.name}`}>
              <img src={url} alt={`Foto selecionada: ${file.name}`} />
            </button>
            <figcaption><span title={file.name}>{file.name}</span><button type="button" className="mini-button" disabled={disabled} aria-label={`Remover ${file.name}`} onClick={() => { onChange(files.filter((_, current) => current !== index)); setError('') }}>Remover</button></figcaption>
          </figure>
        ))}
      </div>
      <p className="helper-text">As fotos complementam a devolução. Para registrar um sinistro, utilize o módulo Sinistros.</p>
      <Modal open={Boolean(preview)} title="Foto da devolução" description={preview?.file.name} onClose={() => setPreview(null)}>
        {preview ? <img className="possession-return-photo-full" src={preview.url} alt={preview.file.name} /> : null}
      </Modal>
    </section>
  )
}
