import { useId, useRef, useState } from 'react'
import { claimsAPI } from '../api/claims'
import { getApiErrorMessage } from '../utils/apiError'

export const CLAIM_ATTACHMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MAX_CLAIM_ATTACHMENTS = 20
export const MAX_ATTACHMENT_BATCH_SIZE = 50 * 1024 * 1024
export const MAX_IMAGE_SIZE = 8 * 1024 * 1024
export const MAX_DOCUMENT_SIZE = 12 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  'application/msword',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const INLINE_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const MIME_ALIASES = { 'image/jpg': 'image/jpeg' }
const MIME_BY_EXTENSION = {
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export function formatAttachmentSize(size) {
  const value = Number(size) || 0
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentKey(file) {
  return [file.name, file.size, file.lastModified].join(':')
}

function createPendingAttachment(file, index) {
  const fallbackId = `${Date.now()}-${index}-${file.name}`
  return {
    id: globalThis.crypto?.randomUUID?.() || fallbackId,
    file,
  }
}

function fileKindLabel(mimeType, filename = '') {
  if (mimeType?.startsWith('image/')) return 'FOTO'
  const extension = filename.split('.').pop()?.toUpperCase()
  return extension && extension.length <= 4 ? extension : 'DOC'
}

function normalizeFileMime(file) {
  const supplied = MIME_ALIASES[file.type?.toLowerCase()] || file.type?.toLowerCase() || ''
  if (ALLOWED_MIME_TYPES.has(supplied)) return supplied
  if (supplied && supplied !== 'application/octet-stream') return supplied
  const filename = file.name?.toLowerCase() || ''
  const extension = filename.includes('.') ? `.${filename.split('.').pop()}` : ''
  return MIME_BY_EXTENSION[extension] || supplied
}

function validateFile(file) {
  const mimeType = normalizeFileMime(file)
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return `${file.name}: formato não permitido.`
  }
  const limit = mimeType.startsWith('image/') ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE
  if (!file.size) return `${file.name}: o arquivo está vazio.`
  if (file.size > limit) {
    return `${file.name}: excede o limite de ${limit / (1024 * 1024)} MB.`
  }
  return ''
}

function triggerBlob(blob, filename, download, previewWindow) {
  const objectUrl = URL.createObjectURL(blob)
  if (previewWindow && !previewWindow.closed) {
    previewWindow.location.href = objectUrl
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    return
  }
  const link = document.createElement('a')
  link.href = objectUrl
  link.rel = 'noopener'
  if (download) {
    link.download = filename
  } else {
    link.target = '_blank'
  }
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export default function ClaimAttachmentsField({
  claimId,
  existingAttachments = [],
  legacyReferences = [],
  legacyReferenceValue = null,
  onLegacyReferenceValueChange,
  pendingAttachments,
  onPendingAttachmentsChange,
  removedAttachmentIds,
  onRemovedAttachmentIdsChange,
  disabled = false,
  canManage = true,
}) {
  const inputId = useId()
  const inputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [fileError, setFileError] = useState('')
  const [accessingId, setAccessingId] = useState('')

  const removedIds = new Set(removedAttachmentIds)
  const activeExistingCount = existingAttachments.filter((attachment) => !removedIds.has(attachment.id)).length
  const activeCount = activeExistingCount + pendingAttachments.length

  function addFiles(fileList) {
    const candidates = Array.from(fileList || [])
    if (!candidates.length) return

    const existingKeys = new Set(pendingAttachments.map(({ file }) => attachmentKey(file)))
    const validFiles = []
    const errors = []

    candidates.forEach((file) => {
      const validationError = validateFile(file)
      if (validationError) {
        errors.push(validationError)
        return
      }
      if (existingKeys.has(attachmentKey(file))) {
        errors.push(`${file.name}: já foi selecionado.`)
        return
      }
      existingKeys.add(attachmentKey(file))
      validFiles.push(file)
    })

    const availableSlots = Math.max(0, MAX_CLAIM_ATTACHMENTS - activeCount)
    if (validFiles.length > availableSlots) {
      errors.push(`Cada sinistro pode ter no máximo ${MAX_CLAIM_ATTACHMENTS} anexos.`)
      validFiles.splice(availableSlots)
    }

    const currentBatchSize = pendingAttachments.reduce((total, item) => total + item.file.size, 0)
    let acceptedBatchSize = currentBatchSize
    const filesWithinBatchLimit = validFiles.filter((file) => {
      if (acceptedBatchSize + file.size > MAX_ATTACHMENT_BATCH_SIZE) {
        errors.push('O conjunto de novos anexos não pode ultrapassar 50 MB por envio.')
        return false
      }
      acceptedBatchSize += file.size
      return true
    })

    if (filesWithinBatchLimit.length) {
      onPendingAttachmentsChange([
        ...pendingAttachments,
        ...filesWithinBatchLimit.map(createPendingAttachment),
      ])
    }
    setFileError(errors[0] || '')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragActive(false)
    if (!disabled && canManage) addFiles(event.dataTransfer.files)
  }

  function removePending(id) {
    onPendingAttachmentsChange(pendingAttachments.filter((item) => item.id !== id))
    setFileError('')
  }

  function toggleExistingRemoval(attachmentId) {
    if (removedIds.has(attachmentId)) {
      onRemovedAttachmentIdsChange(removedAttachmentIds.filter((id) => id !== attachmentId))
    } else {
      onRemovedAttachmentIdsChange([...removedAttachmentIds, attachmentId])
    }
  }

  async function accessAttachment(attachment, download) {
    if (!claimId) return
    let previewWindow = null
    if (!download) {
      try {
        previewWindow = window.open('', '_blank')
        if (previewWindow) previewWindow.opener = null
      } catch {
        previewWindow = null
      }
    }
    try {
      setAccessingId(`${attachment.id}:${download ? 'download' : 'open'}`)
      setFileError('')
      const response = await claimsAPI.getAttachment(claimId, attachment.id, { download })
      triggerBlob(response.data, attachment.filename, download, previewWindow)
    } catch (error) {
      previewWindow?.close()
      setFileError(getApiErrorMessage(error, 'Não foi possível acessar o anexo.'))
    } finally {
      setAccessingId('')
    }
  }

  return (
    <div className="claim-attachments-shell">
      <div className="claim-attachments-heading">
        <div>
          <strong>Fotos e documentos</strong>
          <span>Inclua imagens do veículo, boletim de ocorrência, laudos ou outros comprovantes.</span>
        </div>
        <span className="claim-attachments-count">{activeCount}/{MAX_CLAIM_ATTACHMENTS}</span>
      </div>

      {canManage ? (
        <div
          className={`claim-upload-zone${dragActive ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragActive(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragActive(false) }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            id={inputId}
            className="claim-file-input"
            type="file"
            accept={CLAIM_ATTACHMENT_ACCEPT}
            multiple
            hidden
            disabled={disabled}
            onChange={(event) => addFiles(event.target.files)}
          />
          <span className="claim-upload-symbol" aria-hidden="true">+</span>
          <div className="claim-upload-copy">
            <strong>Arraste os arquivos para cá</strong>
            <span>JPG, PNG ou WEBP até 8 MB; PDF, DOC ou DOCX até 12 MB.</span>
          </div>
          <button className="secondary-button claim-upload-button" type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
            Selecionar arquivos
          </button>
        </div>
      ) : null}

      {fileError ? <div className="alert alert-error claim-attachment-alert" role="alert">{fileError}</div> : null}

      {existingAttachments.length ? (
        <div className="claim-attachment-group">
          <span className="claim-attachment-group-title">Anexos salvos</span>
          <div className="claim-attachment-list">
            {existingAttachments.map((attachment) => {
              const markedForRemoval = removedIds.has(attachment.id)
              const canOpenInline = INLINE_MIME_TYPES.has(attachment.mime_type)
              return (
                <article key={attachment.id} className={`claim-attachment-row${markedForRemoval ? ' is-removed' : ''}`}>
                  <span className={`claim-file-kind${attachment.kind === 'PHOTO' ? ' is-photo' : ''}`}>
                    {fileKindLabel(attachment.mime_type, attachment.filename)}
                  </span>
                  <div className="claim-attachment-meta">
                    <strong>{attachment.filename}</strong>
                    <span>{formatAttachmentSize(attachment.size_bytes)}{markedForRemoval ? ' · será removido ao salvar' : ' · salvo no registro'}</span>
                  </div>
                  <div className="claim-attachment-actions">
                    {!markedForRemoval && canOpenInline ? (
                      <button className="mini-button" type="button" disabled={disabled || Boolean(accessingId)} onClick={() => accessAttachment(attachment, false)}>
                        {accessingId === `${attachment.id}:open` ? 'Abrindo...' : 'Abrir'}
                      </button>
                    ) : null}
                    {!markedForRemoval ? (
                      <button className="ghost-button" type="button" disabled={disabled || Boolean(accessingId)} onClick={() => accessAttachment(attachment, true)}>
                        {accessingId === `${attachment.id}:download` ? 'Baixando...' : 'Baixar'}
                      </button>
                    ) : null}
                    {canManage ? (
                      <button className="ghost-button" type="button" disabled={disabled} onClick={() => toggleExistingRemoval(attachment.id)}>
                        {markedForRemoval ? 'Desfazer' : 'Remover'}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      ) : null}

      {pendingAttachments.length ? (
        <div className="claim-attachment-group">
          <span className="claim-attachment-group-title">Novos anexos</span>
          <div className="claim-attachment-list">
            {pendingAttachments.map(({ id, file }) => (
              <article key={id} className="claim-attachment-row is-pending">
                <span className={`claim-file-kind${normalizeFileMime(file).startsWith('image/') ? ' is-photo' : ''}`}>
                  {fileKindLabel(normalizeFileMime(file), file.name)}
                </span>
                <div className="claim-attachment-meta">
                  <strong>{file.name}</strong>
                  <span>{formatAttachmentSize(file.size)} · será enviado ao salvar</span>
                </div>
                <div className="claim-attachment-actions">
                  <button className="ghost-button" type="button" disabled={disabled} onClick={() => removePending(id)}>Remover</button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {legacyReferences.length || (canManage && legacyReferenceValue !== null) ? (
        <details className="claim-legacy-references">
          <summary>
            {legacyReferences.length
              ? `Referências antigas (${legacyReferences.length})`
              : 'Adicionar referência ou link (opcional)'}
          </summary>
          {canManage && legacyReferenceValue !== null ? (
            <div className="claim-legacy-editor">
              <label htmlFor={`${inputId}-legacy`}>Informe uma URL ou referência por linha.</label>
              <textarea
                id={`${inputId}-legacy`}
                className="app-textarea"
                rows="3"
                value={legacyReferenceValue}
                disabled={disabled}
                onChange={(event) => onLegacyReferenceValueChange?.(event.target.value)}
              />
            </div>
          ) : (
            <ul>
              {legacyReferences.map((reference, index) => <li key={`${reference}-${index}`}>{reference}</li>)}
            </ul>
          )}
        </details>
      ) : null}
    </div>
  )
}
