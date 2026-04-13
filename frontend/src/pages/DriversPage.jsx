import { useEffect, useState } from 'react'
import AccordionSection from '../components/AccordionSection'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { driversAPI } from '../api/drivers'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const initialForm = {
  nome_completo: '',
  documento: '',
  contato: '',
  email: '',
  cnh_categoria: 'B',
  cnh_validade: '',
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR')
}

function getCnhAlert(cnhDate) {
  if (!cnhDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const validade = new Date(cnhDate)
  validade.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((validade - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: 'CNH vencida', tone: 'alert-error' }
  if (diffDays <= 30) return { label: `Vence em ${diffDays} dias`, tone: 'alert-error' }
  if (diffDays <= 60) return { label: `Vence em ${diffDays} dias`, tone: 'alert-info' }
  return null
}

function getDaysToExpire(cnhDate) {
  if (!cnhDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const validade = new Date(cnhDate)
  validade.setHours(0, 0, 0, 0)
  return Math.floor((validade - today) / (1000 * 60 * 60 * 24))
}

export default function DriversPage() {
  const { canWrite, isAdmin } = useAuth()
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 })
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('ATIVOS')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)

  const exportColumns = [
    { header: 'Nome completo', value: (item) => item.nome_completo },
    { header: 'Documento', value: (item) => item.documento },
    { header: 'Contato', value: (item) => item.contato || '-' },
    { header: 'E-mail', value: (item) => item.email || '-' },
    { header: 'CNH', value: (item) => item.cnh_categoria },
    { header: 'Validade CNH', value: (item) => formatDate(item.cnh_validade) },
    { header: 'Status', value: (item) => (item.ativo ? 'ATIVO' : 'INATIVO') },
  ]

  async function loadDrivers(page = pagination.page) {
    try {
      setLoading(true)
      setError('')
      const { data } = await driversAPI.list({
        page,
        limit: 10,
        search: search || undefined,
        active: activeFilter === 'TODOS' ? undefined : activeFilter === 'ATIVOS',
      })
      setRecords(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os condutores.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDrivers(1)
  }, [search, activeFilter])

  function openCreateModal() {
    setEditingRecord(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  function openEditModal(record) {
    setEditingRecord(record)
    setForm({
      nome_completo: record.nome_completo,
      documento: record.documento,
      contato: record.contato || '',
      email: record.email || '',
      cnh_categoria: record.cnh_categoria,
      cnh_validade: record.cnh_validade || '',
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setEditingRecord(null)
    setForm(initialForm)
    setIsModalOpen(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      const payload = {
        ...form,
        contato: form.contato || null,
        email: form.email || null,
        cnh_validade: form.cnh_validade || null,
      }
      if (editingRecord) {
        await driversAPI.update(editingRecord.id, payload)
        setFeedback('Condutor atualizado com sucesso.')
      } else {
        await driversAPI.create(payload)
        setFeedback('Condutor cadastrado com sucesso.')
      }
      closeModal()
      await loadDrivers(editingRecord ? pagination.page : 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o condutor.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(record) {
    if (!window.confirm(`Inativar o condutor ${record.nome_completo}?`)) return
    try {
      await driversAPI.remove(record.id)
      setFeedback('Condutor inativado com sucesso.')
      await loadDrivers(pagination.page)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel inativar o condutor.'))
    }
  }

  async function handlePreviewPdf() {
    if (!records.length) return
    await previewRowsToPdf({
      title: 'Frota PMTF - Condutores cadastrados',
      fileName: 'frota-pmtf-condutores-cadastrados',
      subtitle: 'Relatorio da pagina atual dos condutores cadastrados.',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: activeFilter },
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  async function handleExportXlsx() {
    if (!records.length) return
    await exportRowsToXlsx({
      fileName: 'frota-pmtf-condutores-cadastrados',
      sheetName: 'Condutores',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: activeFilter },
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Condutores cadastrados</h2>
          <p className="section-copy">Mantenha a base reutilizavel de condutores para posse, busca e futuros modulos operacionais.</p>
        </div>
        <div className="actions-inline">
          {canWrite ? <button className="app-button" type="button" onClick={openCreateModal}>Novo condutor</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Previsualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="status-pills">
            {['ATIVOS', 'TODOS', 'INATIVOS'].map((option) => (
              <button key={option} type="button" className={`status-pill${activeFilter === option ? ' active' : ''}`} onClick={() => setActiveFilter(option)}>
                {option}
              </button>
            ))}
          </div>
          <div className="filter-inline">
            <input className="app-input" placeholder="Buscar por nome ou documento" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{pagination.total}</strong>
          <span>condutores no filtro</span>
        </div>
        <div className="metric-inline">
          <strong>{records.filter((item) => getCnhAlert(item.cnh_validade)?.label === 'CNH vencida').length}</strong>
          <span>CNHs vencidas</span>
        </div>
        <div className="metric-inline">
          <strong>{records.filter((item) => {
            const days = getDaysToExpire(item.cnh_validade)
            return days !== null && days >= 0 && days <= 30
          }).length}</strong>
          <span>CNHs em até 30 dias</span>
        </div>
        <div className="metric-inline">
          <strong>{records.filter((item) => {
            const days = getDaysToExpire(item.cnh_validade)
            return days !== null && days > 30 && days <= 60
          }).length}</strong>
          <span>CNHs em até 60 dias</span>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Documento</th>
                <th>Contato</th>
                <th>E-mail</th>
                <th>CNH</th>
                <th>Alerta CNH</th>
                <th>Status</th>
                {canWrite ? <th>Acoes</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite ? 8 : 7} className="muted">Carregando condutores...</td></tr>
              ) : !records.length ? (
                <tr><td colSpan={canWrite ? 8 : 7}><div className="empty-state">Nenhum condutor encontrado para o filtro atual.</div></td></tr>
              ) : (
                records.map((record) => {
                  const cnhAlert = getCnhAlert(record.cnh_validade)
                  return (
                  <tr key={record.id}>
                    <td data-label="Nome"><strong>{record.nome_completo}</strong></td>
                    <td data-label="Documento">{record.documento}</td>
                    <td data-label="Contato">{record.contato || '-'}</td>
                    <td data-label="E-mail">{record.email || '-'}</td>
                    <td data-label="CNH">{record.cnh_categoria} {record.cnh_validade ? `| validade ${formatDate(record.cnh_validade)}` : ''}</td>
                    <td data-label="Alerta CNH">
                      {cnhAlert ? <span className={`alert ${cnhAlert.tone}`}>{cnhAlert.label}</span> : '-'}
                    </td>
                    <td data-label="Status"><span className={`status-badge ${record.ativo ? 'status-ATIVO' : 'status-INATIVO'}`}>{record.ativo ? 'ATIVO' : 'INATIVO'}</span></td>
                    {canWrite ? (
                      <td data-label="Acoes">
                        <div className="actions-inline">
                          <button type="button" className="mini-button" onClick={() => openEditModal(record)}>Editar</button>
                          {isAdmin && record.ativo ? <button type="button" className="mini-button danger" onClick={() => handleDeactivate(record)}>Inativar</button> : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadDrivers} />

      <Modal
        open={isModalOpen}
        title={editingRecord ? 'Editar condutor' : 'Novo condutor'}
        description="Agrupe os dados em blocos simples para manter o cadastro mais limpo e escalavel."
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="stack">
          <AccordionSection title="Dados basicos" subtitle="Identificacao e contato" open>
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label htmlFor="driver-name">Nome completo</label>
                <input id="driver-name" className="app-input" value={form.nome_completo} onChange={(event) => setForm({ ...form, nome_completo: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="driver-document">Documento</label>
                <input id="driver-document" className="app-input" value={form.documento} onChange={(event) => setForm({ ...form, documento: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="driver-contact">Contato</label>
                <input id="driver-contact" className="app-input" value={form.contato} onChange={(event) => setForm({ ...form, contato: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="driver-email">E-mail</label>
                <input id="driver-email" className="app-input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="CNH" subtitle="Categoria e vencimento">
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label htmlFor="driver-license">Categoria</label>
                <select id="driver-license" className="app-select" value={form.cnh_categoria} onChange={(event) => setForm({ ...form, cnh_categoria: event.target.value })}>
                  {['A', 'B', 'C', 'D', 'E'].map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="driver-expiry">Validade da CNH</label>
                <input id="driver-expiry" type="date" className="app-input" value={form.cnh_validade} onChange={(event) => setForm({ ...form, cnh_validade: event.target.value })} />
              </div>
            </div>
          </AccordionSection>

          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : editingRecord ? 'Atualizar condutor' : 'Cadastrar condutor'}</button>
            <button className="ghost-button" type="button" onClick={closeModal}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
