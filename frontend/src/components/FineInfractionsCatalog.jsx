import { useEffect, useMemo, useState } from 'react'
import Pagination from './Pagination'
import { finesAPI } from '../api/fines'
import { getApiErrorMessage } from '../utils/apiError'

const PAGE_SIZE = 12

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
    default_amount: item.default_amount || '',
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
      const { data } = await finesAPI.listInfractions({ limit: 1000, active_only: false })
      setInfractions(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as infrações CTB.'))
    } finally {
      setLoading(false)
    }
  }

  function resetForm() {
    setForm(initialInfractionForm)
  }

  function startEdit(item) {
    setForm(toForm(item))
  }

  async function saveInfraction(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      const payload = {
        ...form,
        default_amount: form.default_amount === '' ? null : Number(form.default_amount),
        points: form.points === '' ? null : Number(form.points),
        source: form.source || null,
      }

      if (form.id) {
        await finesAPI.updateInfraction(form.id, payload)
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
      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <form className="form-grid" onSubmit={saveInfraction}>
        <div className="form-field">
          <label>Código</label>
          <input className="app-input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
        </div>
        <div className="form-field">
          <label>Desdobramento</label>
          <input className="app-input" value={form.desdobramento} onChange={(event) => setForm({ ...form, desdobramento: event.target.value })} required />
        </div>
        <div className="form-field" style={{ gridColumn: '1 / -1' }}>
          <label>Descrição</label>
          <textarea className="app-textarea" rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        </div>
        <div className="form-field">
          <label>Amparo CTB</label>
          <input className="app-input" value={form.ctb_article} onChange={(event) => setForm({ ...form, ctb_article: event.target.value })} />
        </div>
        <div className="form-field">
          <label>Gravidade</label>
          <input className="app-input" value={form.severity} onChange={(event) => setForm({ ...form, severity: event.target.value })} />
        </div>
        <div className="form-field">
          <label>Valor padrão</label>
          <input type="number" min="0" step="0.01" className="app-input" value={form.default_amount} onChange={(event) => setForm({ ...form, default_amount: event.target.value })} />
        </div>
        <div className="form-field">
          <label>Pontos</label>
          <input type="number" min="0" className="app-input" value={form.points} onChange={(event) => setForm({ ...form, points: event.target.value })} />
        </div>
        <div className="form-field">
          <label>Infrator</label>
          <input className="app-input" value={form.offender} onChange={(event) => setForm({ ...form, offender: event.target.value })} />
        </div>
        <div className="form-field">
          <label>Órgão competente</label>
          <input className="app-input" value={form.competent_body} onChange={(event) => setForm({ ...form, competent_body: event.target.value })} />
        </div>
        <div className="form-field">
          <label>Fonte</label>
          <input className="app-input" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
        </div>
        <label className="section-copy" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
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
