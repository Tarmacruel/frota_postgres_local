import IndicatorBar from '../components/ui/IndicatorBar'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import PageHeader from '../components/ui/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import Pagination from '../components/Pagination'
import api from '../api/client'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { getRoleLabel } from '../utils/roles'

const actionOptions = ['TODAS', 'CREATE', 'UPDATE', 'DELETE', 'RECTIFY', 'POSSESSION_CREATE', 'POSSESSION_REPLACE_ACTIVE', 'POSSESSION_RETURN_CONFIRMATION', 'POSSESSION_RETURN_CORRECTION', 'TERM_PREVIEW', 'TERM_DOWNLOAD', 'TRIP_CREATE', 'TRIP_DESTINATION_ADD', 'TRIP_END', 'TRIP_CANCEL', 'DELETE_DENIED', 'ORDER_CREATED', 'ORDER_CONFIRMED', 'ORDER_CONFIRM_RECTIFIED', 'ORDER_CANCELLED', 'ORDER_EXPIRED', 'ORDER_REOPENED', 'ORDER_DEADLINE_EXTENDED']
const entityOptions = ['TODOS', 'USER', 'VEHICLE', 'MAINTENANCE', 'POSSESSION', 'POSSESSION_TRIP', 'FUEL_STATION', 'FUEL_STATION_USER', 'FUEL_SUPPLY', 'FUEL_SUPPLY_ORDER']

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function summarizeDetails(details) {
  if (!details) return 'Sem detalhes adicionais'
  if (details.event === 'END_POSSESSION') {
    return `Encerramento registrado para ${details.end_date ? formatDate(details.end_date) : 'agora'}`
  }
  if (details.trip_sequence && details.return_at) {
    return `Retorno da rota ${details.trip_sequence} em ${formatDate(details.return_at)} · ${details.kilometers_driven || '-'} km`
  }
  if (details.trip_sequence && details.destination_count !== undefined) {
    return `Rota ${details.trip_sequence} · ${details.destination_count} destino(s)`
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
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators, select: selectIndicator } = useInteractiveKpis()

  const [logs, setLogs] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const requestId = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('TODAS')
  const [entityFilter, setEntityFilter] = useState('TODOS')
  const [organizationFilter, setOrganizationFilter] = useState('TODAS')
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })

  function getActorOrganization(log) {
    return { id: log.organization_id || '', name: log.organization_name || 'Sem secretaria' }
  }

  const filteredLogs = logs

  const queryParams = useCallback((page = 1, limit = 20) => ({ indicator: indicator === 'total' ? undefined : indicator,
      page, limit, search: search.trim() || undefined,
      action: actionFilter !== 'TODAS' ? actionFilter : undefined,
      entity_type: entityFilter !== 'TODOS' ? entityFilter : undefined,
      organization_id: !['TODAS', 'SEM_SECRETARIA'].includes(organizationFilter) ? organizationFilter : undefined,
      without_organization: organizationFilter === 'SEM_SECRETARIA' || undefined,
  }), [search, actionFilter, entityFilter, organizationFilter, indicator])

  async function allFilteredLogs() {
    const records = []
    let page = 1
    let pages
    do {
      const { data } = await api.get('/audit/paginated', { params: queryParams(page, 200) })
      records.push(...data.data)
      pages = data.pagination.pages
      page += 1
    } while (page <= pages)
    return records
  }

  const exportColumns = [
    { header: 'Data', value: (log) => formatDate(log.created_at) },
    { header: 'Ação', value: (log) => log.action },
    { header: 'Entidade', value: (log) => log.entity_type },
    { header: 'Registro', value: (log) => log.entity_label },
    { header: 'Ator', value: (log) => `${log.actor_name}${log.actor_email ? ` <${log.actor_email}>` : ''}` },
    { header: 'Perfil', value: (log) => getRoleLabel(log.actor_role) },
    { header: 'Secretaria', value: (log) => getActorOrganization(log).name },
    { header: 'Detalhes', value: (log) => summarizeDetails(log.details) },
  ]

  const loadAudit = useCallback(async (page = 1) => {
    const currentRequest = ++requestId.current
    try {
      setLoading(true)
      setError('')
      const { data } = await api.get('/audit/paginated', { params: queryParams(page) })
      if (currentRequest !== requestId.current) return
      setLogs(data.data || [])
      setPagination(data.pagination); setIndicators(data.indicators || null)
      if (page > 1 && page > data.pagination.pages) loadAudit(data.pagination.pages)
    } catch (err) {
      if (currentRequest === requestId.current) setError(getApiErrorMessage(err, 'Não foi possível carregar a trilha de auditoria.'))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [queryParams, setIndicators])

  useEffect(() => { loadAudit(1) }, [loadAudit])

  async function handleExportPdf() {
    if (pagination.total === 0) {
      setFeedback('Não há eventos de auditoria filtrados para pré-visualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const reportRows = await allFilteredLogs()
      await previewRowsToPdf({
        title: 'Frota PMTF - Auditoria',
        fileName: 'frota-pmtf-auditoria',
        subtitle: 'Relatório administrativo da trilha de auditoria filtrada.',
        columns: exportColumns,
        rows: reportRows,
        filters: [
          { label: 'Ação', value: actionFilter === 'TODAS' ? 'Todas' : actionFilter },
          { label: 'Entidade', value: entityFilter === 'TODOS' ? 'Todas' : entityFilter },
          {
            label: 'Secretaria',
            value:
              organizationFilter === 'TODAS'
                ? 'Todas as secretarias'
                : organizationFilter === 'SEM_SECRETARIA'
                  ? 'Sem secretaria'
                  : organizations.find((organization) => organization.id === organizationFilter)?.name || organizationFilter,
          },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Pré-visualização do PDF de auditoria aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF da auditoria.'))
    }
  }

  async function handleExportXlsx() {
    if (pagination.total === 0) {
      setFeedback('Não há eventos de auditoria filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const reportRows = await allFilteredLogs()
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-auditoria',
        sheetName: 'Auditoria',
        columns: exportColumns,
        rows: reportRows,
        filters: [
          { label: 'Ação', value: actionFilter === 'TODAS' ? 'Todas' : actionFilter },
          { label: 'Entidade', value: entityFilter === 'TODOS' ? 'Todas' : entityFilter },
          {
            label: 'Secretaria',
            value:
              organizationFilter === 'TODAS'
                ? 'Todas as secretarias'
                : organizationFilter === 'SEM_SECRETARIA'
                  ? 'Sem secretaria'
                  : organizations.find((organization) => organization.id === organizationFilter)?.name || organizationFilter,
          },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportação de auditoria em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar a auditoria em XLSX.'))
    }
  }

  return (
    <div className="surface-panel operation-page management-page management-page--audit">
      <PageHeader
        title="Auditoria administrativa"
        description="Acompanhe criações, edições e exclusões registradas nas áreas sensíveis do sistema."
        actions={<>
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </>}
      />

      <div className="toolbar-row operation-toolbar">
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por ator, secretaria, entidade, ação ou detalhes"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-select" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
            <option value="TODAS">Todas as secretarias</option>
            <option value="SEM_SECRETARIA">Sem secretaria</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
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

      <IndicatorBar state={{ selected: indicator, metadata: indicatorMetadata, select: selectIndicator }} loading={loading} error={error} resultCount={pagination.total} />

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide management-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Ação</th>
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
                    <td data-label="Ação"><span className={`status-badge audit-action-${log.action}`}>{log.action}</span></td>
                    <td data-label="Entidade">{log.entity_type}</td>
                    <td data-label="Registro"><strong>{log.entity_label}</strong></td>
                    <td data-label="Ator">
                      <div className="stack">
                        <strong>{log.actor_name}</strong>
                        <span className="muted">{log.actor_email || 'Sem e-mail'}</span>
                        <span className="muted">{getRoleLabel(log.actor_role)}</span>
                        <span className="muted">{getActorOrganization(log).name}</span>
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
      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadAudit} />
    </div>
  )
}
