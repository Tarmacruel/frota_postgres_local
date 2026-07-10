import { useEffect, useMemo, useState } from 'react'
import { documentSignaturesAPI } from '../api/documentSignatures'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
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

export default function DocumentSignaturePanel({ documentType, sourceId, summary, title, onChanged }) {
  const { user, isAdmin } = useAuth()
  const [documentSummary, setDocumentSummary] = useState(summary || null)
  const [signers, setSigners] = useState([])
  const [password, setPassword] = useState('')
  const [selectedSignerId, setSelectedSignerId] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    setDocumentSummary(summary || null)
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
    loadSigners()
    return () => {
      mounted = false
    }
  }, [])

  const hasDocument = Boolean(documentSummary?.document_id)
  const hasSigned = useMemo(
    () => Boolean(documentSummary?.signatures?.some((signature) => signature.signer_user_id === user?.id)),
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

  function updateSummary(nextSummary, nextFeedback = '') {
    setDocumentSummary(nextSummary)
    setFeedback(nextFeedback)
    onChanged?.(nextSummary)
  }

  async function ensureDocument() {
    if (documentSummary?.document_id) return documentSummary
    const { data } = await documentSignaturesAPI.createDocument({ document_type: documentType, source_id: sourceId })
    updateSummary(data, 'Documento digital emitido para assinatura.')
    return data
  }

  async function handleCreateDocument() {
    try {
      setLoading(true)
      setError('')
      await ensureDocument()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível emitir o documento digital.'))
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
      updateSummary(data, 'Assinatura registrada com sucesso.')
    } catch (err) {
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
          <strong>{title || 'Assinatura digital interna'}</strong>
          <span className="muted">Status: {getStatusLabel(documentSummary?.status)}</span>
        </div>
        {hasDocument ? (
          <span className={`status-badge status-${documentSummary?.is_complete ? 'ATIVO' : 'MANUTENCAO'}`}>
            {documentSummary?.signed_count || 0}/{documentSummary?.required_signatures || 1}
          </span>
        ) : (
          <button type="button" className="secondary-button" disabled={loading} onClick={handleCreateDocument}>
            Emitir
          </button>
        )}
      </div>

      {documentSummary?.content_hash_short ? (
        <div className="signature-hash-line">
          <span>Hash</span>
          <code>{documentSummary.content_hash_short}</code>
        </div>
      ) : null}

      {error ? <div className="alert alert-error evidence-alert">{error}</div> : null}
      {feedback ? <div className="alert alert-info evidence-alert">{feedback}</div> : null}

      {hasDocument ? (
        <>
          <div className="signature-list">
            {(documentSummary.signatures || []).length === 0 ? (
              <span className="muted">Nenhuma assinatura registrada.</span>
            ) : documentSummary.signatures.map((signature) => (
              <div key={signature.id} className="signature-row">
                <span><strong>{signature.signer_name}</strong> assinou em {formatDate(signature.signed_at)}</span>
                <code>{String(signature.signature_fingerprint || '').slice(0, 12)}</code>
              </div>
            ))}
          </div>

          {(documentSummary.requests || []).length > 0 ? (
            <div className="signature-list">
              {documentSummary.requests.map((request) => (
                <div key={request.id} className="signature-row">
                  <span>
                    {request.requested_signer_name || 'Servidor'}: {getRequestStatusLabel(request.status)}
                  </span>
                  <div className="actions-inline">
                    {request.status === 'PENDING' && request.requested_signer_user_id === user?.id ? (
                      <button type="button" className="mini-button" disabled={loading} onClick={() => handleDeclineRequest(request.id)}>
                        Recusar
                      </button>
                    ) : null}
                    {request.status === 'PENDING' && (request.requested_by_user_id === user?.id || isAdmin) ? (
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

      {hasDocument && !hasSigned ? (
        <form className="signature-form" onSubmit={handleSign}>
          <label>
            <span>{pendingForMe ? 'Assinar solicitação pendente' : 'Assinar com sua ID Digital'}</span>
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
            {loading ? 'Processando...' : 'Assinar'}
          </button>
        </form>
      ) : null}

      {hasDocument ? (
        <form className="signature-form" onSubmit={handleRequestSignature}>
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
