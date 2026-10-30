import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import './ReceiptAttachmentField.css'

const MAX_SIZE = 8 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const TYPES = ['application/pdf', ...IMAGE_TYPES]

function AttachmentIcon({ camera = false }) {
  return <svg className="receipt-attachment__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {camera ? <><path d="M8 6 9.5 3.5h5L16 6h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" /><circle cx="12" cy="13" r="3.5" /></> : <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>}
  </svg>
}

export default function ReceiptAttachmentField({ id, file, onChange, required = false, disabled = false, error = '' }) {
  const inputRef = useRef(null)
  const cameraRef = useRef(null)
  const chooseRef = useRef(null)
  const [fileError, setFileError] = useState('')
  const [preview, setPreview] = useState({ file: null, url: '' })
  const [expanded, setExpanded] = useState(false)
  const message = fileError || error
  const image = Boolean(file && IMAGE_TYPES.includes(file.type))
  const previewUrl = preview.file === file ? preview.url : ''
  const description = `${id}-help${message ? ` ${id}-error` : ''}`

  useEffect(() => {
    if (!file || !IMAGE_TYPES.includes(file.type) || typeof URL.createObjectURL !== 'function') {
      setPreview({ file: null, url: '' })
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreview({ file, url })
    return () => URL.revokeObjectURL(url)
  }, [file])

  function selectFile(event) {
    if (disabled) return
    const selected = event.target.files?.[0]
    if (!selected) return // Canceling the picker keeps the previous selection.
    let nextError = ''
    if (!TYPES.includes(selected.type)) nextError = 'Comprovante deve ser PDF, JPG, PNG ou WEBP.'
    else if (!selected.size) nextError = 'O comprovante está vazio. Selecione outro arquivo.'
    else if (selected.size > MAX_SIZE) nextError = 'Comprovante deve ter no máximo 8 MB.'
    event.target.value = ''
    setExpanded(false)
    setFileError(nextError)
    onChange(nextError ? null : selected)
  }

  function removeFile() {
    if (disabled) return
    if (inputRef.current) inputRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
    setExpanded(false)
    setFileError('')
    onChange(null)
    chooseRef.current?.focus()
  }

  return <div className="form-field modal-field-span receipt-attachment" role="group" aria-labelledby={`${id}-label`}>
    <label id={`${id}-label`} htmlFor={id}>Comprovante{required ? <span className="guided-form__required" aria-hidden="true"> *</span> : null}</label>
    <div className="receipt-attachment__body">
      {file ? <div className="receipt-attachment__preview">
        {image && previewUrl ? <button className="receipt-attachment__thumbnail" type="button" onClick={() => setExpanded(true)} disabled={disabled} aria-label="Ampliar foto do comprovante"><img src={previewUrl} alt="Prévia da foto do comprovante" /></button> : <span className="receipt-attachment__document" aria-hidden="true"><AttachmentIcon />{image ? 'FOTO' : 'PDF'}</span>}
        <div className="receipt-attachment__metadata"><strong>{file.name}</strong><span>{(file.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB{image ? ' · Toque na foto para ampliar' : ' · Documento PDF'}</span></div>
        <button className="ghost-button receipt-attachment__remove" type="button" onClick={removeFile} disabled={disabled} aria-label="Remover comprovante">Remover</button>
      </div> : <p className="receipt-attachment__empty">Anexe o comprovante ou tire uma foto legível.</p>}
      <div className="receipt-attachment__actions">
        <button ref={chooseRef} type="button" className="ghost-button" onClick={() => inputRef.current?.click()} disabled={disabled} aria-label={file ? 'Trocar comprovante' : 'Anexar comprovante'} aria-describedby={description} data-form-required={required ? 'true' : undefined} data-form-value={file ? 'selected' : ''} data-required-message="Envie o comprovante para confirmar o abastecimento."><AttachmentIcon />{file ? 'Trocar arquivo' : 'Anexar arquivo'}</button>
        <button type="button" className="ghost-button" onClick={() => cameraRef.current?.click()} disabled={disabled} aria-describedby={`${id}-help`}><AttachmentIcon camera />Tirar foto</button>
      </div>
    </div>
    <small id={`${id}-help`} className="receipt-attachment__help">{required ? 'Obrigatório. ' : ''}PDF, JPG, PNG ou WEBP · até 8 MB. A câmera abre em dispositivos compatíveis.</small>
    <input id={id} ref={inputRef} hidden type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={selectFile} disabled={disabled} aria-label="Comprovante" aria-required={required} aria-describedby={description} />
    <input ref={cameraRef} hidden type="file" accept={IMAGE_TYPES.join(',')} capture="environment" onChange={selectFile} disabled={disabled} aria-label="Fotografar comprovante" />
    {message ? <small id={`${id}-error`} className="form-error receipt-attachment__error" role="alert">{message}</small> : null}
    <Modal open={Boolean(expanded && image && previewUrl)} title="Foto do comprovante" description={file?.name} onClose={() => setExpanded(false)}><img className="receipt-attachment__full" src={previewUrl || undefined} alt="Foto do comprovante ampliada" /></Modal>
  </div>
}
