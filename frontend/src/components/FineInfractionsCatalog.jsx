import { useEffect, useMemo, useState } from 'react'
import Pagination from './Pagination'
import { finesAPI } from '../api/fines'
import { getApiErrorMessage } from '../utils/apiError'

const PAGE_SIZE = 12
const CATALOG_FETCH_LIMIT = 500

const initialInfractionForm = {
  id: null,
  code: '',
  desdobramento: '0',
  description: '',
  ctb_article: '',
  offender: '',
  severity: '',
  competent_body: '',
  default_amount: '',
  points: '',
  is_active: true,
  source: '',
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function toForm(item) {
  return {
    id: item.id,
    code: item.code,
    desdobramento: item.desdobramento,
    description: item.description,
    ctb_article: item.ctb_article || '',
    offender: item.offender || '',
    severity: item.severity || '',
    competent_body: item.competent_body || '',
    default_amount: item.default_amount ?? '',
    points: item.points ?? '',
    is_active: item.is_active,
    source: item.source || '',
  }
}

export default function FineInfractionsCatalog() {
  const [infractions, setInfractions] = useState([])
  const [form, setForm] = useState(initialInfractionForm)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const filteredInfractions = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return infractions
    return infractions.filter((item) => [
      item.code,
      item.desdobramento,
      item.description,
      item.ctb_article,
      item.severity,
      item.source,
    ].filter(Boolean).join(' ').toLowerCase().includes(term))
  }, [infractions, search])

  const totalPages = Math.max(1, Math.ceil(filteredInfractions.length / PAGE_SIZE))
  const paginatedInfractions = useMemo(() => {
    const startIndex = (page - 1) * PAGE_SIZE
    return filteredInfractions.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredInfractions, page])

  useEffect(() => {
    loadInfractions()
  }, [])

  useEffect(() => {
    setPage(1)
  }, [search])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  async function loadInfractions() {
    try {
      setLoading(true)
      setError('')
      const { data } = await finesAPI.listInfractions({ limit: CATALOG_FETCH_LIMIT, active_only: false })
      setInfractions(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as infrações CTB.'))
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm(initialInfractionForm)
    setError('')
  }

  function startEdit(item) {
    setError('')
    setFeedback('')
    setForm(toForm(item))
  }

  async function saveInfraction(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      const { id, ...formValues } = form
      const payload = {
        ...formValues,
        code: form.code.trim(),
        desdobramento: form.desdobramento.trim(),
        description: form.description.trim(),
        ctb_article: form.ctb_article.trim() || null,
        offender: form.offender.trim() || null,
        severity: form.severity.trim() || null,
        competent_body: form.competent_body.trim() || null,
        default_amount: form.default_amount === '' ? null : Number(form.default_amount),
        points: form.points === '' ? null : Number(form.points),
        source: form.source.trim() || null,
      }

      if (id) {
        await finesAPI.updateInfraction(id, payload)
        setFeedback('Enquadramento atualizado.')
      } else {
        await finesAPI.createInfraction(payload)
        setFeedback('Enquadramento cadastrado.')
      }

      resetForm()
      await loadInfractions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o enquadramento.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(item) {
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      await finesAPI.updateInfraction(item.id, { is_active: !item.is_active })
      setFeedback(item.is_active ? 'Enquadramento desativado.' : 'Enquadramento ativado.')
      await loadInfractions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível alterar o status do enquadramento.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {error ? <div className="alert alert-error" role="alert" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" role="status" aria-live="polite" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <form className="form-grid" onSubmit={saveInfraction}>
        <div className="form-field">
          <label htmlFor="fine-infraction-code">Código</label>
          <input id="fine-infraction-code" className="app-input" maxLength={40} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-breakdown">Desdobramento</label>
          <input id="fine-infraction-breakdown" className="app-input" maxLength={10} value={form.desdobramento} onChange={(event) => setForm({ ...form, desdobramento: event.target.value })} required />
        </div>
        <div className="form-field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="fine-infraction-description">Descrição</label>
          <textarea id="fine-infraction-description" className="app-textarea" rows="3" minLength={3} maxLength={4000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-article">Amparo CTB</label>
          <input id="fine-infraction-article" className="app-input" maxLength={120} value={form.ctb_article} onChange={(event) => setForm({ ...form, ctb_article: event.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-severity">Gravidade</label>
          <input id="fine-infraction-severity" className="app-input" maxLength={80} value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-amount">Valor padrão</label>
          <input id="fine-infraction-amount" type="number" min="0" step="0.01" inputMode="decimal" className="app-input" value={form.default_amount} onChange={(event) => setForm({ ...form, default_amount: event.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-points">Pontos</label>
          <input id="fine-infraction-points" type="number" min="0" max="99" step="1" inputMode="numeric" className="app-input" value={form.points} onChange={(event) => setForm({ ...form, points: event.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-offender">Infrator</label>
          <input id="fine-infraction-offender" className="app-input" maxLength={80} value={form.offender} onChange={(event) => setForm({ ...form, offender: event.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-competent-body">Órgão competente</label>
          <input id="fine-infraction-competent-body" className="app-input" maxLength={120} value={form.competent_body} onChange={(event) => setForm({ ...form, competent_body: event.target.value })} />
        </div>
        <div className="form-field">
          <label htmlFor="fine-infraction-source">Fonte</label>
          <input id="fine-infraction-source" className="app-input" maxLength={255} value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
        </div>
        <label className="section-copy" htmlFor="fine-infraction-active" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input id="fine-infraction-active" type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
          Ativo para seleção
        </label>
        <div className="actions-inline" style={{ gridColumn: '1 / -1' }}>
          <button className="app-button" type="submit" disabled={submitting}>
            {submitting ? 'Salvando...' : form.id ? 'Atualizar enquadramento' : 'Cadastrar enquadramento'}
          </button>
          {form.id ? <button className="ghost-button" type="button" onClick={resetForm}>Cancelar edição</button> : null}
        </div>
      </form>

      <div className="filter-inline" style={{ margin: '18px 0 12px' }}>
        <input
          id="search-infraction-input"
          className="app-input"
          placeholder="Buscar código, artigo, gravidade ou descrição"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="table-wrap table-wrap-wide">
        <table className="data-table data-table-wide">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descrição</th>
              <th>Gravidade</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}>Carregando infrações...</td></tr>
            ) : filteredInfractions.length === 0 ? (
              <tr><td colSpan={6}><div className="empty-state">Nenhuma infração encontrada.</div></td></tr>
            ) : paginatedInfractions.map((item) => (
              <tr key={item.id}>
                <td data-label="Código">
                  <strong>{item.code}/{item.desdobramento}</strong>
                  <br />
                  <span className="muted">{item.ctb_article || '-'}</span>
                </td>
                <td data-label="Descrição">{item.description}</td>
                <td data-label="Gravidade">{item.severity || '-'}</td>
                <td data-label="Valor">{formatMoney(item.default_amount)}</td>
                <td data-label="Status">
                  <span className={`status-badge status-${item.is_active ? 'ATIVO' : 'INATIVO'}`}>
                    {item.is_provisional ? 'Provisório' : item.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td data-label="Ações">
                  <div className="actions-inline">
                    <button type="button" className="mini-button" onClick={() => startEdit(item)}>Editar</button>
                    <button type="button" className="mini-button" onClick={() => toggleActive(item)} disabled={submitting}>
                      {item.is_active ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
    </>
  )
}
