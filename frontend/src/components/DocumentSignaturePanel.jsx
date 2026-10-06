import { useEffect, useMemo, useState } from 'react'
import { documentSignaturesAPI, SIGNATURE_METHODS } from '../api/documentSignatures'
import { environmentFlagEnabled } from '../config/environment'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { downloadBlobResponse } from '../utils/downloadResponse'
import CertificateSignatureFlow from './CertificateSignatureFlow'
import SearchableSelect from './SearchableSelect'

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function getStatusLabel(status) {
  if (status === 'COMPLETED') return 'Concluída'
  if (status === 'PENDING') return 'Pendente'
  if (status === 'SUPERSEDED') return 'Obsoleta'
  if (status === 'UNSIGNED') return 'Não emitida'
  if (status === 'CANCELLED') return 'Cancelada'
  return status || '-'
}

function getRequestStatusLabel(status) {
  if (status === 'SIGNED') return 'Assinada'
  if (status === 'DECLINED') return 'Recusada'
  if (status === 'CANCELLED') return 'Cancelada'
  if (status === 'SUPERSEDED') return 'Obsoleta'
  return 'Pendente'
}

function signatureMethodOf(signature) {
  return signature?.method || signature?.signature_method || SIGNATURE_METHODS.INTERNAL_PASSWORD
}

function getMethodLabel(method) {
  return method === SIGNATURE_METHODS.ICP_BRASIL_PADES ? 'Certificado ICP-Brasil (PAdES)' : 'Senha institucional'
}

function certificateSigningEnabled(summary) {
  const capability = summary?.capabilities?.certificate_signing
    ?? summary?.certificate_signing_enabled
    ?? summary?.certificate_signing?.enabled
  if (typeof capability === 'boolean') return capability && summary?.canonical_artifact_available !== false
  if (summary?.canonical_artifact_available === false) return false
  return environmentFlagEnabled(import.meta.env.VITE_CERTIFICATE_SIGNING_ENABLED)
}

function methodCountsOf(summary) {
  const explicit = summary?.signature_counts_by_method || summary?.signature_counts || summary?.signatures_by_method || {}
  const internal = Number(explicit.INTERNAL_PASSWORD ?? explicit.internal_password ?? 0)
  const certificate = Number(explicit.ICP_BRASIL_PADES ?? explicit.icp_brasil_pades ?? 0)
  if (internal || certificate) {
    return { internal, certificate }
  }
  return (summary?.signatures || []).reduce((counts, signature) => {
    if (signatureMethodOf(signature) === SIGNATURE_METHODS.ICP_BRASIL_PADES) counts.certificate += 1
    else counts.internal += 1
    return counts
  }, { internal: 0, certificate: 0 })
}

function certificateSessionOf(summary) {
  return summary?.active_certificate_session
    || summary?.certificate_session
    || summary?.certificate_signing_session
    || null
}

function DocumentArtifactControls({ documentId, summary }) {
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [validation, setValidation] = useState(null)
  const methodCounts = useMemo(() => methodCountsOf(summary), [summary])
  const canonicalAvailable = Boolean(
    summary?.canonical_artifact_available
    ?? summary?.artifacts?.canonical?.available
    ?? false,
  )
  const certifiedAvailable = Boolean(
    summary?.certified_artifact_available
    ?? summary?.artifacts?.certified?.available
    ?? (methodCounts.certificate > 0),
  )

  async function handleDownload(kind) {
    setLoading(kind)
    setError('')
    try {
      const response = await documentSignaturesAPI.downloadArtifact(documentId, kind)
      const suffix = kind === 'certified' ? 'certificado' : 'original'
      downloadBlobResponse(response, `documento-${suffix}.pdf`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível baixar o PDF solicitado.'))
    } finally {
      setLoading('')
    }
  }

  async function handleValidation() {
    setLoading('validation')
    setError('')
    try {
      const { data } = await documentSignaturesAPI.getValidation(documentId)
      setValidation(data?.validation || data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível consultar a validação do documento.'))
    } finally {
      setLoading('')
    }
  }

  const validationEntries = validation?.validations || validation?.signatures || []
  const derivedValidationStatus = validationEntries.some((item) => ['INVALID', 'FAILED', 'REVOKED'].includes(item.status))
    ? 'Inválida'
    : validationEntries.length > 0 && validationEntries.every((item) => ['VALID', 'TRUSTED'].includes(item.status))
      ? 'Válida'
      : 'Consultada'
  const validationStatus = validation?.overall_status || validation?.status
    || (validation?.valid === true ? 'Válida' : validation?.valid === false ? 'Inválida' : derivedValidationStatus)
  const validationCount = validationEntries.length || validation?.validated_signatures

  return (
    <div className="document-artifact-controls">
      <div className="actions-inline">
        {canonicalAvailable ? (
          <button type="button" className="ghost-button" disabled={Boolean(loading)} onClick={() => handleDownload('canonical')}>
            {loading === 'canonical' ? 'Baixando...' : 'Baixar PDF original'}
          </button>
        ) : null}
        {certifiedAvailable ? (
          <button type="button" className="secondary-button" disabled={Boolean(loading)} onClick={() => handleDownload('certified')}>
            {loading === 'certified' ? 'Baixando...' : 'Baixar PDF certificado'}
          </button>
        ) : null}
        {certifiedAvailable ? (
          <button type="button" className="ghost-button" disabled={Boolean(loading)} onClick={handleValidation}>
            {loading === 'validation' ? 'Validando...' : 'Consultar validação'}
          </button>
        ) : null}
      </div>
      {validation ? (
        <div className="certificate-validation-summary" role="status">
          <strong>Validação: {validationStatus || 'consultada'}</strong>
          {Number.isFinite(Number(validationCount)) ? <span>{Number(validationCount)} assinatura(s) verificada(s)</span> : null}
          {validation?.checked_at ? <span>Consulta em {formatDate(validation.checked_at)}</span> : null}
        </div>
      ) : null}
      {error ? <div className="alert alert-error evidence-alert">{error}</div> : null}
    </div>
  )
}

export default function DocumentSignaturePanel({ documentType, sourceId, summary, title, description, onChanged, readOnly = false }) {
  const { user, isAdmin } = useAuth()
  const [documentSummary, setDocumentSummary] = useState(summary || null)
  const [signers, setSigners] = useState([])
  const [password, setPassword] = useState('')
  const [selectedSignerId, setSelectedSignerId] = useState('')
  const [message, setMessage] = useState('')
  const [signatureMethod, setSignatureMethod] = useState(SIGNATURE_METHODS.INTERNAL_PASSWORD)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    setDocumentSummary(summary || null)
    if (certificateSessionOf(summary)) setSignatureMethod(SIGNATURE_METHODS.ICP_BRASIL_PADES)
  }, [summary])

  useEffect(() => {
    let mounted = true
    async function loadSigners() {
      try {
        const { data } = await documentSignaturesAPI.signers()
        if (mounted) setSigners(data)
      } catch {
        if (mounted) setSigners([])
      }
    }
    if (!readOnly) loadSigners()
    return () => {
      mounted = false
    }
  }, [readOnly])

  const hasDocument = Boolean(
    documentSummary?.document_id
    || (documentSummary?.status && documentSummary.status !== 'UNSIGNED'),
  )
  const hasSigned = useMemo(
    () => Boolean(documentSummary?.signatures?.some((signature) => (
      signature.signer_user_id || signature.signer_id || signature.user_id
    ) === user?.id)),
    [documentSummary, user?.id],
  )
  const pendingForMe = useMemo(
    () => (documentSummary?.requests || []).find((request) => request.status === 'PENDING' && request.requested_signer_user_id === user?.id),
    [documentSummary, user?.id],
  )
  const signerOptions = useMemo(
    () => signers.map((signer) => ({
      value: signer.id,
      label: signer.name,
      description: [signer.email, signer.organization_name].filter(Boolean).join(' | '),
      keywords: [signer.name, signer.email, signer.organization_name].filter(Boolean).join(' '),
    })),
    [signers],
  )
  const methodCounts = useMemo(() => methodCountsOf(documentSummary), [documentSummary])
  const certificateEnabled = certificateSigningEnabled(documentSummary)

  function updateSummary(nextSummary, nextFeedback = '') {
    setDocumentSummary(nextSummary)
    setFeedback(nextFeedback)
    onChanged?.(nextSummary)
  }

  function resetStaleDocument(err) {
    const detail = err?.response?.data?.detail
    if (err?.response?.status !== 409 || detail?.code !== 'DIGITAL_DOCUMENT_SOURCE_CHANGED') return false
    updateSummary({
      document_id: null,
      document_type: documentType,
      source_id: sourceId,
      status: 'UNSIGNED',
      required_signatures: 1,
      signed_count: 0,
      pending_count: 0,
      declined_count: 0,
      is_complete: false,
      signatures: [],
      requests: [],
    })
    setSignatureMethod(SIGNATURE_METHODS.INTERNAL_PASSWORD)
    return true
  }

  async function ensureDocument() {
    if (documentSummary?.document_id) return documentSummary
    const { data } = await documentSignaturesAPI.createDocument({ document_type: documentType, source_id: sourceId })
    updateSummary(data, 'Documento emitido para assinatura eletrônica.')
    return data
  }

  async function handleCreateDocument() {
    try {
      setLoading(true)
      setError('')
      await ensureDocument()
    } catch (err) {
      resetStaleDocument(err)
      setError(getApiErrorMessage(err, 'Não foi possível emitir o documento eletrônico.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSign(event) {
    event.preventDefault()
    try {
      setLoading(true)
      setError('')
      setFeedback('')
      const documentData = await ensureDocument()
      const { data } = await documentSignaturesAPI.sign(documentData.document_id, { current_password: password })
      setPassword('')
      updateSummary(data, 'Assinatura por senha registrada com sucesso.')
    } catch (err) {
      resetStaleDocument(err)
      setError(getApiErrorMessage(err, 'Não foi possível assinar o documento.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleRequestSignature(event) {
    event.preventDefault()
    if (!selectedSignerId) {
      setError('Selecione o servidor coassinante.')
      return
    }
    try {
      setLoading(true)
      setError('')
      setFeedback('')
      const documentData = await ensureDocument()
      const { data } = await documentSignaturesAPI.requestJointSignature(documentData.document_id, {
        requested_signer_user_id: selectedSignerId,
        message,
      })
      setSelectedSignerId('')
      setMessage('')
      updateSummary(data, 'Solicitação de coassinatura registrada.')
    } catch (err) {
      resetStaleDocument(err)
      setError(getApiErrorMessage(err, 'Não foi possível solicitar a coassinatura.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleDeclineRequest(requestId) {
    try {
      setLoading(true)
      setError('')
      await documentSignaturesAPI.declineRequest(requestId)
      const { data } = await documentSignaturesAPI.getDocument(documentSummary.document_id)
      updateSummary(data, 'Solicitação recusada.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível recusar a solicitação.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelRequest(requestId) {
    try {
      setLoading(true)
      setError('')
      await documentSignaturesAPI.cancelRequest(requestId)
      const { data } = await documentSignaturesAPI.getDocument(documentSummary.document_id)
      updateSummary(data, 'Solicitação cancelada.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível cancelar a solicitação.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="signature-panel">
      <div className="signature-panel-head">
        <div>
          <strong>{title || 'Assinatura eletrônica institucional'}</strong>
          {description ? <span className="muted">{description}</span> : null}
          <span className="muted">Status: {getStatusLabel(documentSummary?.status)}</span>
        </div>
        {hasDocument ? (
          <span className={`status-badge status-${documentSummary?.is_complete ? 'ATIVO' : 'MANUTENCAO'}`}>
            {documentSummary?.signed_count || 0}/{documentSummary?.required_signatures || 1}
          </span>
        ) : !readOnly ? (
          <button type="button" className="secondary-button" disabled={loading} onClick={handleCreateDocument}>
            Emitir
          </button>
        ) : null}
      </div>

      {documentSummary?.content_hash_short ? (
        <div className="signature-hash-line">
          <span>Código de integridade</span>
          <code>{documentSummary.content_hash_short}</code>
        </div>
      ) : null}

      {hasDocument && (methodCounts.internal > 0 || methodCounts.certificate > 0) ? (
        <div className="signature-method-counts" aria-label="Assinaturas por método">
          <span>Senha: <strong>{methodCounts.internal}</strong></span>
          <span>ICP-Brasil: <strong>{methodCounts.certificate}</strong></span>
        </div>
      ) : null}

      {error ? <div className="alert alert-error evidence-alert">{error}</div> : null}
      {feedback ? <div className="alert alert-info evidence-alert">{feedback}</div> : null}

      {hasDocument ? (
        <>
          <div className="signature-list">
            {(documentSummary.signatures || []).length === 0 ? (
              <span className="muted">
                {readOnly && (documentSummary?.signed_count || 0) > 0
                  ? 'Assinatura registrada; identificação protegida nesta consulta.'
                  : 'Nenhuma assinatura registrada.'}
              </span>
            ) : documentSummary.signatures.map((signature) => {
              const method = signatureMethodOf(signature)
              const fingerprint = signature.certificate_fingerprint_short
                || signature.certificate_fingerprint
                || signature.signature_fingerprint
                || ''
              return (
                <div key={signature.id} className="signature-row">
                  <div className="signature-row-copy">
                    <span><strong>{signature.signer_name}</strong> assinou em {formatDate(signature.signed_at)}</span>
                    <span className="muted">{getMethodLabel(method)}</span>
                    {method === SIGNATURE_METHODS.ICP_BRASIL_PADES && (signature.certificate_issuer_summary || signature.certificate_issuer) ? (
                      <span className="muted">Emissor: {signature.certificate_issuer_summary || signature.certificate_issuer}</span>
                    ) : null}
                    {method === SIGNATURE_METHODS.ICP_BRASIL_PADES && (signature.timestamped_at || signature.timestamp_status) ? (
                      <span className="muted">Carimbo de tempo: {signature.timestamped_at ? formatDate(signature.timestamped_at) : signature.timestamp_status}</span>
                    ) : null}
                    {method === SIGNATURE_METHODS.ICP_BRASIL_PADES && signature.validation_status ? (
                      <span className="muted">Validação: {signature.validation_status}</span>
                    ) : null}
                  </div>
                  {fingerprint ? <code>{String(fingerprint).slice(0, 12)}</code> : null}
                </div>
              )
            })}
          </div>

          {(documentSummary.requests || []).length > 0 ? (
            <div className="signature-list">
              {documentSummary.requests.map((request) => (
                <div key={request.id} className="signature-row">
                  <span>{request.requested_signer_name || 'Servidor'}: {getRequestStatusLabel(request.status)}</span>
                  <div className="actions-inline">
                    {!readOnly && request.status === 'PENDING' && request.requested_signer_user_id === user?.id ? (
                      <button type="button" className="mini-button" disabled={loading} onClick={() => handleDeclineRequest(request.id)}>
                        Recusar
                      </button>
                    ) : null}
                    {!readOnly && request.status === 'PENDING' && (request.requested_by_user_id === user?.id || isAdmin) ? (
                      <button type="button" className="mini-button danger" disabled={loading} onClick={() => handleCancelRequest(request.id)}>
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {!readOnly && hasDocument && !hasSigned ? (
        <>
          {certificateEnabled ? (
            <div className="signature-method-picker" role="group" aria-label="Método de assinatura">
              <button
                type="button"
                className={signatureMethod === SIGNATURE_METHODS.INTERNAL_PASSWORD ? 'is-active' : ''}
                aria-pressed={signatureMethod === SIGNATURE_METHODS.INTERNAL_PASSWORD}
                onClick={() => setSignatureMethod(SIGNATURE_METHODS.INTERNAL_PASSWORD)}
              >
                <strong>Assinar com senha</strong>
                <span>Evidência eletrônica interna</span>
              </button>
              <button
                type="button"
                className={signatureMethod === SIGNATURE_METHODS.ICP_BRASIL_PADES ? 'is-active' : ''}
                aria-pressed={signatureMethod === SIGNATURE_METHODS.ICP_BRASIL_PADES}
                onClick={() => setSignatureMethod(SIGNATURE_METHODS.ICP_BRASIL_PADES)}
              >
                <strong>Assinar com certificado ICP-Brasil</strong>
                <span>e-CPF no padrão PAdES</span>
              </button>
            </div>
          ) : null}

          {signatureMethod === SIGNATURE_METHODS.INTERNAL_PASSWORD || !certificateEnabled ? (
            <form className="signature-form" onSubmit={handleSign}>
              <label>
                <span>{pendingForMe ? 'Assinar solicitação pendente' : 'Registrar assinatura eletrônica'}</span>
                <input
                  className="app-input"
                  type="password"
                  placeholder="Confirme sua senha atual"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button type="submit" className="app-button" disabled={loading || password.length < 8}>
                {loading ? 'Processando...' : 'Assinar com senha'}
              </button>
            </form>
          ) : (
            <CertificateSignatureFlow
              documentId={documentSummary.document_id}
              contentHash={documentSummary.content_hash || documentSummary.content_hash_short}
              initialSession={certificateSessionOf(documentSummary)}
              onDocumentChanged={(nextSummary) => updateSummary(nextSummary)}
              onFeedback={setFeedback}
            />
          )}
        </>
      ) : null}

      {!readOnly && hasDocument && documentSummary?.document_id ? (
        <DocumentArtifactControls documentId={documentSummary.document_id} summary={documentSummary} />
      ) : null}

      {!readOnly && hasDocument ? (
        <form className="signature-form signature-request-form" onSubmit={handleRequestSignature}>
          <SearchableSelect
            value={selectedSignerId}
            onChange={setSelectedSignerId}
            options={signerOptions}
            placeholder="Solicitar coassinatura"
            searchPlaceholder="Buscar servidor"
          />
          <input
            className="app-input"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Mensagem opcional"
          />
          <button type="submit" className="secondary-button" disabled={loading || !selectedSignerId}>
            Solicitar
          </button>
        </form>
      ) : null}
    </section>
  )
}
