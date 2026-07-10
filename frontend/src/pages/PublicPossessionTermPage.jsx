import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { possessionAPI } from '../api/possession'
import { officialBrand } from '../constants/officialBrand'
import { getApiErrorMessage } from '../utils/apiError'
import {
  downloadPossessionTermDocument,
  getPossessionTermLabel,
  previewPossessionTermDocument,
  resolvePossessionTermValidationUrl,
} from '../utils/possessionTermDocument'

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return '-'
  return `${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`
}

export default function PublicPossessionTermPage({ termType }) {
  const { validationCode } = useParams()
  const [term, setTerm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const title = getPossessionTermLabel(termType)

  useEffect(() => {
    async function loadTerm() {
      try {
        setLoading(true)
        setError('')
        const { data } = await possessionAPI.getPublicTerm(termType, validationCode)
        setTerm(data)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível validar o termo público da posse.'))
      } finally {
        setLoading(false)
      }
    }

    loadTerm()
  }, [termType, validationCode])

  const publicUrl = useMemo(
    () => resolvePossessionTermValidationUrl(term?.public_validation_path),
    [term?.public_validation_path],
  )

  async function handleCopyLink() {
    if (!publicUrl) return
    if (!navigator.clipboard) {
      setFeedback(`Link público: ${publicUrl}`)
      return
    }
    try {
      await navigator.clipboard.writeText(publicUrl)
      setFeedback('Link público copiado para a área de transferência.')
    } catch {
      setFeedback(`Link público: ${publicUrl}`)
    }
  }

  async function handlePreview() {
    try {
      setError('')
      await previewPossessionTermDocument(term, termType)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível abrir o PDF do termo.'))
    }
  }

  async function handleDownload() {
    try {
      setError('')
      await downloadPossessionTermDocument(term, termType)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível baixar o PDF do termo.'))
    }
  }

  return (
    <div className="public-order-shell">
      <div className="public-order-card">
        <header className="public-order-header">
          <div>
            <span className="public-order-eyebrow">{officialBrand.systemName} . validação pública</span>
            <h1>{title} de veículo</h1>
            <p>
              Consulte a autenticidade do termo emitido pelo sistema oficial da frota municipal, sem necessidade de login.
            </p>
          </div>
          <div className="public-order-brand">
            <strong>{officialBrand.municipality}</strong>
            <span>CNPJ {officialBrand.cnpj}</span>
          </div>
        </header>

        {loading ? <div className="alert alert-info">Validando autenticidade do termo...</div> : null}
        {!loading && error ? <div className="alert alert-error">{error}</div> : null}
        {!loading && feedback ? <div className="alert alert-info">{feedback}</div> : null}

        {!loading && term ? (
          <>
            <section className="public-order-summary">
              <div className="public-order-highlight">
                <span className="muted">Tipo do termo</span>
                <strong>{title}</strong>
                <span className="status-badge status-ATIVO">Autêntico</span>
              </div>
              <div className="public-order-highlight">
                <span className="muted">Código de validação</span>
                <strong>{term.validation_code}</strong>
                <span className="muted">Emitido a partir da posse criada em {formatDate(term.created_at)}</span>
              </div>
            </section>

            <section className="public-order-grid">
              <article className="public-order-block">
                <h2>Dados da posse</h2>
                <dl>
                  <div><dt>Veículo</dt><dd>{term.vehicle_description || term.vehicle_plate || '-'}</dd></div>
                  <div><dt>Marca</dt><dd>{term.vehicle_brand || '-'}</dd></div>
                  <div><dt>Modelo</dt><dd>{term.vehicle_model || '-'}</dd></div>
                  <div><dt>Condutor</dt><dd>{term.driver_name || '-'}</dd></div>
                  <div><dt>Documento</dt><dd>{term.driver_document_masked || '-'}</dd></div>
                </dl>
              </article>

              <article className="public-order-block">
                <h2>Controle operacional</h2>
                <dl>
                  <div><dt>Início da posse</dt><dd>{formatDate(term.start_date)}</dd></div>
                  <div><dt>Encerramento</dt><dd>{formatDate(term.end_date)}</dd></div>
                  <div><dt>Km inicial</dt><dd>{formatNumber(term.start_odometer_km)}</dd></div>
                  <div><dt>Km final</dt><dd>{formatNumber(term.end_odometer_km)}</dd></div>
                  <div><dt>Km rodados</dt><dd>{formatNumber(term.kilometers_driven)}</dd></div>
                </dl>
              </article>
            </section>

            {term.observation ? (
              <section className="public-order-notes">
                <h2>Observações</h2>
                <p>{term.observation}</p>
              </section>
            ) : null}

            {term.signature_summary?.document_id ? (
              <section className="public-order-notes">
                <h2>Assinaturas digitais internas</h2>
                <p>Hash SHA-256: <strong>{term.signature_summary.content_hash}</strong></p>
                <p>Status: {term.signature_summary.is_complete ? 'Concluída' : 'Pendente'}</p>
                {(term.signature_summary.signatures || []).map((signature) => (
                  <p key={signature.id}>{signature.signer_name} assinou em {formatDate(signature.signed_at)}.</p>
                ))}
              </section>
            ) : null}

            <section className="public-order-actions">
              <button type="button" className="app-button" onClick={handleDownload}>
                Baixar termo em PDF
              </button>
              <button type="button" className="secondary-button" onClick={handlePreview}>
                Pré-visualizar PDF
              </button>
              <button type="button" className="ghost-button" onClick={handleCopyLink}>
                Copiar link público
              </button>
            </section>

            <footer className="public-order-footer">
              <span>Endereço público de validação</span>
              <strong>{publicUrl}</strong>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}
