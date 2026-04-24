import { useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { getRoleLabel } from '../utils/roles'

const actionOptions = ['TODAS', 'CREATE', 'UPDATE', 'DELETE', 'ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_CANCELLED', 'ORDER_EXPIRED']
const entityOptions = ['TODOS', 'USER', 'VEHICLE', 'MAINTENANCE', 'POSSESSION', 'FUEL_STATION', 'FUEL_STATION_USER', 'FUEL_SUPPLY', 'FUEL_SUPPLY_ORDER']

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function summarizeDetails(details) {
  if (!details) return 'Sem detalhes adicionais'
  if (details.event === 'END_POSSESSION') {
    return `Encerramento registrado para ${details.end_date ? formatDate(details.end_date) : 'agora'}`
  }
  if (details.reason) {
    return `Justificativa: ${details.reason}`
  }
  if (details.supply_id) {
    return `Abastecimento confirmado: ${details.supply_id}`
  }
  if (details.after?.role) {
    return `Perfil final ${getRoleLabel(details.after.role)}`
  }
  if (details.after?.status) {
    return `Status final ${details.after.status}`
  }
  if (details.service_description) {
    return details.service_description
  }
  if (details.driver_contact || details.driver_document) {
    return [details.driver_document, details.driver_contact].filter(Boolean).join(' | ')
  }
  return JSON.stringify(details)
}

export default function AuditPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('TODAS')
  const [entityFilter, setEntityFilter] = useState('TODOS')

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const term = search.trim().toLowerCase()
      const matchesSearch =
        !term ||
        [log.actor_name, log.actor_email, log.entity_label, log.entity_type, log.action, summarizeDetails(log.details)]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))

      const matchesAction = actionFilter === 'TODAS' || log.action === actionFilter
      const matchesEntity = entityFilter === 'TODOS' || log.entity_type === entityFilter
      return matchesSearch && matchesAction && matchesEntity
    })
  }, [logs, search, actionFilter, entityFilter])

  const exportColumns = [
    { header: 'Data', value: (log) => formatDate(log.created_at) },
    { header: 'Acao', value: (log) => log.action },
    { header: 'Entidade', value: (log) => log.entity_type },
    { header: 'Registro', value: (log) => log.entity_label },
    { header: 'Ator', value: (log) => `${log.actor_name}${log.actor_email ? ` <${log.actor_email}>` : ''}` },
    { header: 'Perfil', value: (log) => getRoleLabel(log.actor_role) },
    { header: 'Detalhes', value: (log) => summarizeDetails(log.details) },
  ]

  useEffect(() => {
    async function loadAudit() {
      try {
        setLoading(true)
        setError('')
        const { data } = await api.get('/audit', { params: { limit: 200 } })
        setLogs(data)
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar a trilha de auditoria.'))
      } finally {
        setLoading(false)
      }
    }

    loadAudit()
  }, [])

  async function handleExportPdf() {
    if (filteredLogs.length === 0) {
      setFeedback('Nao ha eventos de auditoria filtrados para previsualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Auditoria',
        fileName: 'frota-pmtf-auditoria',
        subtitle: 'Relatorio administrativo da trilha de auditoria filtrada.',
        columns: exportColumns,
        rows: filteredLogs,
        filters: [
          { label: 'Acao', value: actionFilter === 'TODAS' ? 'Todas' : actionFilter },
          { label: 'Entidade', value: entityFilter === 'TODOS' ? 'Todas' : entityFilter },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Pre-visualizacao do PDF de auditoria aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o PDF da auditoria.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredLogs.length === 0) {
      setFeedback('Nao ha eventos de auditoria filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-auditoria',
        sheetName: 'Auditoria',
        columns: exportColumns,
        rows: filteredLogs,
        filters: [
          { label: 'Acao', value: actionFilter === 'TODAS' ? 'Todas' : actionFilter },
          { label: 'Entidade', value: entityFilter === 'TODOS' ? 'Todas' : entityFilter },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportacao de auditoria em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar a auditoria em XLSX.'))
    }
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Auditoria administrativa</h2>
          <p className="section-copy">Acompanhe criacoes, edicoes e exclusoes registradas nas areas sensiveis do sistema.</p>
        </div>
        <div className="actions-inline">
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Previsualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por ator, entidade, acao ou detalhes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-select" value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
            {actionOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <select className="app-select" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
            {entityOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{filteredLogs.length}</strong>
          <span>eventos exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{filteredLogs.filter((log) => log.action === 'DELETE').length}</strong>
          <span>exclusoes registradas</span>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Data</th>
                <th>Acao</th>
                <th>Entidade</th>
                <th>Registro</th>
                <th>Ator</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="muted">Carregando auditoria...</td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">Nenhum evento de auditoria encontrado para os filtros atuais.</div>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id}>
                    <td data-label="Data">{formatDate(log.created_at)}</td>
                    <td data-label="Acao"><span className={`status-badge audit-action-${log.action}`}>{log.action}</span></td>
                    <td data-label="Entidade">{log.entity_type}</td>
                    <td data-label="Registro"><strong>{log.entity_label}</strong></td>
                    <td data-label="Ator">
                      <div className="stack">
                        <strong>{log.actor_name}</strong>
                        <span className="muted">{log.actor_email || 'Sem e-mail'}</span>
                        <span className="muted">{getRoleLabel(log.actor_role)}</span>
                      </div>
                    </td>
                    <td data-label="Detalhes">{summarizeDetails(log.details)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
