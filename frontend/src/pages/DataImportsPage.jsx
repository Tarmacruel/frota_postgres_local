import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import api from '../api/client'
import { dataImportsAPI } from '../api/dataImports'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const rowStatusOptions = [
  { value: '', label: 'Todas' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Reprovadas' },
  { value: 'APPLIED', label: 'Aplicadas' },
  { value: 'ERROR', label: 'Com erro' },
]

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function statusLabel(value) {
  const labels = {
    ANALYZED: 'Analisado',
    REVIEWING: 'Em revisão',
    APPLIED: 'Aplicado',
    CANCELLED: 'Cancelado',
    PENDING: 'Pendente',
    APPROVED: 'Aprovado',
    REJECTED: 'Reprovado',
    ERROR: 'Erro',
  }
  return labels[value] || value || '-'
}

function entityLabel(value) {
  return value === 'DRIVER' ? 'Condutores' : 'Veículos'
}

function actionLabel(value) {
  if (value === 'CREATE') return 'Criar'
  if (value === 'UPDATE') return 'Atualizar'
  if (value === 'SKIP') return 'Ignorar'
  return 'Revisar'
}

function downloadUrl(url) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.click()
}

function safeJson(value) {
  return JSON.stringify(value || {}, null, 2)
}

function parseJsonField(value, fallback) {
  try {
    return JSON.parse(value || '{}')
  } catch {
    return fallback
  }
}

export default function DataImportsPage() {
  const [batches, setBatches] = useState([])
  const [selectedBatch, setSelectedBatch] = useState(null)
  const [rows, setRows] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [rowStatus, setRowStatus] = useState('')
  const [activeTab, setActiveTab] = useState('review')
  const [uploadFile, setUploadFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [editingRow, setEditingRow] = useState(null)
  const [editDraft, setEditDraft] = useState({ mapped: '{}', official: '{}', triage: '{}', notes: '' })

  const summary = selectedBatch?.summary || {}
  const statusCounts = summary.statuses || {}
  const actionCounts = summary.actions || {}

  const selectedRowsForExport = useMemo(() => rows.map((row) => ({
    linha: row.row_number,
    status: statusLabel(row.status),
    acao: actionLabel(row.suggested_action),
    match: row.matched_entity_id || '-',
    dados: safeJson(row.mapped_data),
    extras: safeJson(row.official_extra_data),
    conflitos: (row.conflicts || []).join('; '),
    erros: (row.validation_errors || []).join('; '),
  })), [rows])

  async function loadBatches(selectId = selectedBatch?.id) {
    try {
      setLoading(true)
      setError('')
      const { data } = await dataImportsAPI.list()
      setBatches(data)
      const nextSelected = data.find((batch) => batch.id === selectId) || data[0] || null
      setSelectedBatch(nextSelected)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar os lotes de importação.'))
    } finally {
      setLoading(false)
    }
  }

  async function loadRows(page = 1) {
    if (!selectedBatch) {
      setRows([])
      return
    }
    try {
      setRowsLoading(true)
      setError('')
      const { data } = await dataImportsAPI.rows(selectedBatch.id, {
        page,
        limit: 50,
        status: rowStatus || undefined,
      })
      setRows(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as linhas do lote.'))
    } finally {
      setRowsLoading(false)
    }
  }

  useEffect(() => {
    loadBatches()
  }, [])

  useEffect(() => {
    loadRows(1)
  }, [selectedBatch?.id, rowStatus])

  async function handleUpload(event) {
    event.preventDefault()
    if (!uploadFile) {
      setError('Selecione um arquivo XLSX ou CSV para importar.')
      return
    }

    try {
      setUploading(true)
      setError('')
      setFeedback('')
      const { data } = await dataImportsAPI.upload(uploadFile)
      setUploadFile(null)
      setSelectedBatch(data)
      setFeedback('Arquivo analisado e enviado para revisão manual.')
      await loadBatches(data.id)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível analisar o arquivo.'))
    } finally {
      setUploading(false)
    }
  }

  async function updateRowStatus(row, nextStatus) {
    try {
      setError('')
      setFeedback('')
      await dataImportsAPI.updateRow(selectedBatch.id, row.id, { status: nextStatus })
      setFeedback(nextStatus === 'APPROVED' ? 'Linha aprovada para integração.' : 'Linha marcada para não importar.')
      await loadBatches(selectedBatch.id)
      await loadRows(pagination.page)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível atualizar a decisão da linha.'))
    }
  }

  function openEditRow(row) {
    setEditingRow(row)
    setEditDraft({
      mapped: safeJson(row.mapped_data),
      official: safeJson(row.official_extra_data),
      triage: safeJson(row.triage_extra_data),
      notes: row.manager_notes || '',
    })
  }

  async function saveEditRow(event) {
    event.preventDefault()
    if (!editingRow) return

    const mapped_data = parseJsonField(editDraft.mapped, editingRow.mapped_data)
    const official_extra_data = parseJsonField(editDraft.official, editingRow.official_extra_data)
    const triage_extra_data = parseJsonField(editDraft.triage, editingRow.triage_extra_data)

    try {
      setError('')
      setFeedback('')
      await dataImportsAPI.updateRow(selectedBatch.id, editingRow.id, {
        mapped_data,
        official_extra_data,
        triage_extra_data,
        manager_notes: editDraft.notes,
      })
      setFeedback('Linha atualizada para revisão.')
      setEditingRow(null)
      await loadBatches(selectedBatch.id)
      await loadRows(pagination.page)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar os ajustes da linha.'))
    }
  }

  async function applyBatch() {
    if (!selectedBatch || !window.confirm('Aplicar todas as linhas aprovadas no cadastro oficial?')) return

    try {
      setApplying(true)
      setError('')
      setFeedback('')
      const { data } = await dataImportsAPI.apply(selectedBatch.id)
      setFeedback(`Importação aplicada: ${data.created} criados, ${data.updated} atualizados, ${data.errors} erros.`)
      await loadBatches(selectedBatch.id)
      await loadRows(pagination.page)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível aplicar o lote.'))
    } finally {
      setApplying(false)
    }
  }

  async function exportCurrentOfficial(entityType, format) {
    try {
      setError('')
      setFeedback('')
      const response = entityType === 'VEHICLE'
        ? await api.get('/vehicles', { params: { limit: 1000 } })
        : await api.get('/drivers', { params: { limit: 1000 } })
      const rowsToExport = Array.isArray(response.data) ? response.data : response.data.data
      const columns = entityType === 'VEHICLE'
        ? [
          { header: 'Placa', value: (item) => item.plate },
          { header: 'Marca', value: (item) => item.brand },
          { header: 'Modelo', value: (item) => item.model },
          { header: 'Chassi', value: (item) => item.chassis_number || '-' },
          { header: 'Renavam', value: (item) => item.renavam || '-' },
          { header: 'Combustível', value: (item) => item.fuel_type || '-' },
          { header: 'Status', value: (item) => item.status },
        ]
        : [
          { header: 'Nome', value: (item) => item.nome_completo },
          { header: 'CPF', value: (item) => item.documento },
          { header: 'CNH', value: (item) => item.cnh_numero || '-' },
          { header: 'Categoria', value: (item) => item.cnh_categoria },
          { header: 'Secretaria', value: (item) => item.organization_name || '-' },
          { header: 'Status', value: (item) => (item.ativo ? 'ATIVO' : 'INATIVO') },
        ]
      const options = {
        fileName: entityType === 'VEHICLE' ? 'frota-veiculos-oficiais' : 'frota-condutores-oficiais',
        sheetName: entityType === 'VEHICLE' ? 'Veículos' : 'Condutores',
        title: entityType === 'VEHICLE' ? 'Frota PMTF - Veículos oficiais' : 'Frota PMTF - Condutores oficiais',
        columns,
        rows: rowsToExport,
      }
      if (format === 'pdf') {
        await previewRowsToPdf(options)
      } else {
        await exportRowsToXlsx(options)
      }
      setFeedback('Exportação dos dados oficiais iniciada.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar os dados oficiais.'))
    }
  }

  async function exportVisibleRows(format) {
    const columns = [
      { header: 'Linha', value: (item) => item.linha },
      { header: 'Status', value: (item) => item.status },
      { header: 'Ação', value: (item) => item.acao },
      { header: 'Match', value: (item) => item.match },
      { header: 'Conflitos', value: (item) => item.conflitos },
      { header: 'Erros', value: (item) => item.erros },
    ]
    const options = {
      fileName: 'frota-revisao-importacao',
      sheetName: 'Revisão',
      title: 'Frota PMTF - Revisão de importação',
      columns,
      rows: selectedRowsForExport,
    }
    if (format === 'pdf') {
      await previewRowsToPdf(options)
    } else {
      await exportRowsToXlsx(options)
    }
  }

  return (
    <div className="page-shell">
      <section className="panel-heading">
        <div>
          <h1 className="section-title">Importação e exportação de dados</h1>
          <p className="section-copy">Analise relatórios externos, aprove linha a linha e integre somente dados revisados ao cadastro oficial.</p>
        </div>
      </section>

      {error ? <div className="alert alert-error">{error}</div> : null}
      {feedback ? <div className="alert alert-success">{feedback}</div> : null}

      <div className="metrics-grid">
        <div className="metric-card">
          <span>Lotes</span>
          <strong>{batches.length}</strong>
        </div>
        <div className="metric-card">
          <span>Linhas no lote</span>
          <strong>{summary.total_rows || 0}</strong>
        </div>
        <div className="metric-card">
          <span>Conflitos</span>
          <strong>{summary.conflicts || 0}</strong>
        </div>
        <div className="metric-card">
          <span>Erros</span>
          <strong>{summary.errors || 0}</strong>
        </div>
      </div>

      <div className="toolbar-card">
        <form className="toolbar-row" onSubmit={handleUpload}>
          <input
            type="file"
            className="app-input"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
          />
          <button className="app-button" type="submit" disabled={uploading}>
            {uploading ? 'Analisando...' : 'Enviar para triagem'}
          </button>
          <button type="button" className="secondary-button" onClick={() => downloadUrl(dataImportsAPI.templateUrl('VEHICLE'))}>Modelo veículos</button>
          <button type="button" className="secondary-button" onClick={() => downloadUrl(dataImportsAPI.templateUrl('DRIVER'))}>Modelo condutores</button>
        </form>
      </div>

      <div className="panel-grid">
        <section className="toolbar-card">
          <h2 className="section-title">Lotes</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Arquivo</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Linhas</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4}>Carregando...</td></tr>
                ) : batches.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty-state">Nenhum lote enviado.</div></td></tr>
                ) : batches.map((batch) => (
                  <tr key={batch.id} className={selectedBatch?.id === batch.id ? 'is-focused-row' : ''} onClick={() => setSelectedBatch(batch)}>
                    <td><strong>{batch.source_filename}</strong><br /><span className="muted">{formatDate(batch.created_at)}</span></td>
                    <td>{entityLabel(batch.entity_type)}</td>
                    <td><span className={`status-badge status-${batch.status === 'APPLIED' ? 'ATIVO' : 'MANUTENCAO'}`}>{statusLabel(batch.status)}</span></td>
                    <td>{batch.summary?.total_rows || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="toolbar-card">
          <div className="status-pills">
            <button type="button" className={`status-pill ${activeTab === 'review' ? 'active' : ''}`} onClick={() => setActiveTab('review')}>Revisão</button>
            <button type="button" className={`status-pill ${activeTab === 'fields' ? 'active' : ''}`} onClick={() => setActiveTab('fields')}>Campos extras</button>
            <button type="button" className={`status-pill ${activeTab === 'exports' ? 'active' : ''}`} onClick={() => setActiveTab('exports')}>Exportar</button>
          </div>

          {!selectedBatch ? (
            <div className="empty-state">Selecione ou envie um lote para iniciar a revisão.</div>
          ) : activeTab === 'review' ? (
            <>
              <div className="filter-row">
                <label className="filter-inline">
                  <span>Status</span>
                  <select className="app-select" value={rowStatus} onChange={(event) => setRowStatus(event.target.value)}>
                    {rowStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <button type="button" className="app-button" onClick={applyBatch} disabled={applying}>
                  {applying ? 'Aplicando...' : 'Aplicar aprovadas'}
                </button>
                <button type="button" className="secondary-button" onClick={() => downloadUrl(dataImportsAPI.exportUrl(selectedBatch.id))}>Baixar CSV do lote</button>
              </div>
              <div className="panel-metrics">
                <span className="metric-inline"><strong>{statusCounts.APPROVED || 0}</strong><span>aprovadas</span></span>
                <span className="metric-inline"><strong>{statusCounts.PENDING || 0}</strong><span>pendentes</span></span>
                <span className="metric-inline"><strong>{actionCounts.CREATE || 0}</strong><span>criar</span></span>
                <span className="metric-inline"><strong>{actionCounts.UPDATE || 0}</strong><span>atualizar</span></span>
              </div>
              <div className="table-wrap table-wrap-wide">
                <table className="data-table data-table-wide">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Ação</th>
                      <th>Status</th>
                      <th>Dados oficiais</th>
                      <th>Alertas</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rowsLoading ? (
                      <tr><td colSpan={6}>Carregando linhas...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={6}><div className="empty-state">Nenhuma linha encontrada para o filtro.</div></td></tr>
                    ) : rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.row_number}</td>
                        <td>{actionLabel(row.suggested_action)}<br /><span className="muted">{row.matched_by || 'sem match'}</span></td>
                        <td><span className={`status-badge status-${row.status === 'APPROVED' || row.status === 'APPLIED' ? 'ATIVO' : row.status === 'ERROR' || row.status === 'REJECTED' ? 'INATIVO' : 'MANUTENCAO'}`}>{statusLabel(row.status)}</span></td>
                        <td>
                          <div className="stack">
                            {Object.entries(row.mapped_data || {}).slice(0, 6).map(([key, value]) => <span key={key}><strong>{key}:</strong> {String(value)}</span>)}
                          </div>
                        </td>
                        <td>
                          <div className="stack">
                            {(row.conflicts || []).map((item) => <span key={item} className="muted">{item}</span>)}
                            {(row.validation_errors || []).map((item) => <span key={item} className="muted">{item}</span>)}
                          </div>
                        </td>
                        <td>
                          <div className="actions-inline">
                            <button type="button" className="mini-button" onClick={() => openEditRow(row)}>Ajustar</button>
                            <button type="button" className="mini-button" onClick={() => updateRowStatus(row, 'APPROVED')}>Aprovar</button>
                            <button type="button" className="mini-button danger" onClick={() => updateRowStatus(row, 'REJECTED')}>Reprovar</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadRows} />
            </>
          ) : activeTab === 'fields' ? (
            <div className="evidence-gallery-grid">
              <article className="evidence-meta-card">
                <strong>Importáveis no cadastro atual</strong>
                <div className="stack">{(selectedBatch.importable_fields || []).map((field) => <span key={field}>{field}</span>)}</div>
              </article>
              <article className="evidence-meta-card">
                <strong>Adicionados como oficiais</strong>
                <div className="stack">{(selectedBatch.official_extra_fields || []).map((field) => <span key={field}>{field}</span>)}</div>
              </article>
              <article className="evidence-meta-card">
                <strong>Mantidos na triagem</strong>
                <div className="stack">{(selectedBatch.triage_extra_fields || []).map((field) => <span key={field}>{field}</span>)}</div>
              </article>
            </div>
          ) : (
            <div className="evidence-gallery-grid">
              <article className="evidence-meta-card">
                <strong>Lote revisado</strong>
                <div className="actions-inline">
                  <button type="button" className="secondary-button" onClick={() => downloadUrl(dataImportsAPI.exportUrl(selectedBatch.id))}>CSV completo</button>
                  <button type="button" className="secondary-button" onClick={() => exportVisibleRows('xlsx')}>XLSX visível</button>
                  <button type="button" className="secondary-button" onClick={() => exportVisibleRows('pdf')}>PDF visível</button>
                </div>
              </article>
              <article className="evidence-meta-card">
                <strong>Base oficial atual</strong>
                <div className="actions-inline">
                  <button type="button" className="secondary-button" onClick={() => exportCurrentOfficial('VEHICLE', 'xlsx')}>Veículos XLSX</button>
                  <button type="button" className="secondary-button" onClick={() => exportCurrentOfficial('DRIVER', 'xlsx')}>Condutores XLSX</button>
                  <button type="button" className="secondary-button" onClick={() => exportCurrentOfficial('VEHICLE', 'pdf')}>Veículos PDF</button>
                  <button type="button" className="secondary-button" onClick={() => exportCurrentOfficial('DRIVER', 'pdf')}>Condutores PDF</button>
                </div>
              </article>
            </div>
          )}
        </section>
      </div>

      <Modal open={Boolean(editingRow)} title="Ajustar linha de importação" description={editingRow ? `Linha ${editingRow.row_number}` : ''} onClose={() => setEditingRow(null)}>
        <form className="form-grid modal-form-grid" onSubmit={saveEditRow}>
          <div className="form-field modal-field-span">
            <label htmlFor="mapped-json">Dados importáveis</label>
            <textarea id="mapped-json" className="app-textarea" rows="8" value={editDraft.mapped} onChange={(event) => setEditDraft({ ...editDraft, mapped: event.target.value })} />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="official-json">Campos oficiais novos</label>
            <textarea id="official-json" className="app-textarea" rows="6" value={editDraft.official} onChange={(event) => setEditDraft({ ...editDraft, official: event.target.value })} />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="triage-json">Extras de triagem</label>
            <textarea id="triage-json" className="app-textarea" rows="5" value={editDraft.triage} onChange={(event) => setEditDraft({ ...editDraft, triage: event.target.value })} />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="manager-notes">Observação do gestor</label>
            <textarea id="manager-notes" className="app-textarea" rows="3" value={editDraft.notes} onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })} />
          </div>
          <div className="actions-inline modal-actions">
            <button type="submit" className="app-button">Salvar ajustes</button>
            <button type="button" className="ghost-button" onClick={() => setEditingRow(null)}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
