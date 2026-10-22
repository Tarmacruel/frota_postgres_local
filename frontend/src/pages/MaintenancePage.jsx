import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Modal from '../components/Modal'
import MaintenanceForm from '../components/MaintenanceForm'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { maintenanceAPI } from '../api/maintenance'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { ResponsiveRecord, MobileFilters, ActionMenu, PageHeader, StatusChip, VehicleThumbnail } from '../components/ui'

const statusOptions = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUÍDAS', label: 'Concluídas' },
]

const unassignedOrganizationFilter = 'SEM_SECRETARIA'

function formatDate(value) {
  if (!value) return 'Em andamento'
  return new Date(value).toLocaleString('pt-BR')
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  const organizationLabel = vehicle.current_location?.organization_name || 'Sem secretaria'
  return {
    value: vehicle.id, tags: vehicle.tags || [],
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type === 'LOCADO' ? 'Locado' : 'Próprio'} | ${organizationLabel} | ${locationLabel}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, organizationLabel, locationLabel].filter(Boolean).join(' '),
  }
}

export default function MaintenancePage() {
  const { canCreate, canEdit, canDeleteModule, isAdmin } = useAuth()
  const canCreateMaintenance = canCreate('maintenance')
  const canEditMaintenance = canEdit('maintenance')
  const canDeleteMaintenance = canDeleteModule('maintenance')
  const canManageMaintenanceActions = canEditMaintenance || canDeleteMaintenance
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODAS')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [startFilter, setStartFilter] = useState('')
  const [endFilter, setEndFilter] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pagination, setPagination] = useState({ pages: 1, total: 0 })
  const [summary, setSummary] = useState({ total: 0, open: 0, closed: 0 })
  const listRequest = useRef(0)
  const focusRecordId = searchParams.get('focus')
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })

  const organizationFilterOptions = useMemo(() => {
    return [
      { value: '', label: 'Todas as secretarias' },
      ...organizations.map((organization) => ({ value: organization.id, label: organization.name })),
      { value: unassignedOrganizationFilter, label: 'Sem secretaria' },
    ]
  }, [organizations])

  function getRecordVehicle(record) {
    return vehicles.find((vehicle) => vehicle.id === record.vehicle_id) || null
  }

  function getRecordOrganizationName(record) {
    return getRecordVehicle(record)?.current_location?.organization_name || 'Sem secretaria'
  }

  const exportColumns = [
    { header: 'Veículo', value: (record) => record.vehicle_plate },
    { header: 'Secretaria', value: (record) => getRecordOrganizationName(record) },
    { header: 'Início', value: (record) => formatDate(record.start_date) },
    { header: 'Conclusão', value: (record) => formatDate(record.end_date) },
    { header: 'Serviço', value: (record) => record.service_description },
    { header: 'Peças', value: (record) => record.parts_replaced || 'Sem observação' },
    { header: 'Custo', value: (record) => formatMoney(record.total_cost) },
    { header: 'Status', value: (record) => (record.end_date ? 'CONCLUÍDA' : 'EM ANDAMENTO') },
    { header: 'Atualizado em', value: (record) => formatDate(record.updated_at) },
  ]

  async function loadVehicles() {
    const { data } = await api.get('/vehicles/options')
    setVehicles(Array.isArray(data) ? data : [])
  }

  function buildListParams(page = currentPage) {
    const focused = Boolean(focusRecordId)
    return {
      page,
      limit: 10,
      vehicle_id: focused ? undefined : vehicleFilter || undefined,
      start: focused || !startFilter ? undefined : new Date(startFilter).toISOString(),
      end: focused || !endFilter ? undefined : new Date(endFilter).toISOString(),
      only_open: focused || statusFilter === 'TODAS' ? undefined : statusFilter === 'EM_ANDAMENTO',
      search: focused ? undefined : search.trim() || undefined,
      filter_organization_id: focused || !organizationFilter || organizationFilter === unassignedOrganizationFilter ? undefined : organizationFilter,
      unassigned: !focused && organizationFilter === unassignedOrganizationFilter ? true : undefined,
      focus_id: focusRecordId || undefined,
    }
  }

  async function loadRecords(page = currentPage) {
    const request = ++listRequest.current
    try {
      setLoading(true)
      setError('')
      const { data } = await maintenanceAPI.listPaginated(buildListParams(page))
      if (request !== listRequest.current) return
      if (page > data.pagination.pages) {
        setCurrentPage(data.pagination.pages)
        return
      }
      setRecords(data.data || [])
      setPagination(data.pagination)
      setSummary(data.summary || { total: data.pagination.total, open: 0, closed: 0 })
    } catch (err) {
      if (request === listRequest.current) setError(getApiErrorMessage(err, 'Não foi possível carregar as manutenções.'))
    } finally {
      if (request === listRequest.current) setLoading(false)
    }
  }

  useEffect(() => {
    async function loadPage() {
      try {
        await loadVehicles()
      } catch (err) {
        setError(getApiErrorMessage(err, 'Não foi possível carregar a frota para o formulário.'))
      }
    }
    loadPage()
  }, [])

  useEffect(() => {
    listRequest.current += 1
    const timer = setTimeout(() => loadRecords(), search.trim() ? 250 : 0)
    return () => clearTimeout(timer)
  }, [currentPage, vehicleFilter, startFilter, endFilter, search, statusFilter, organizationFilter, focusRecordId])

  useEffect(() => {
    if (!focusRecordId) return
    setSearch('')
    setStatusFilter('TODAS')
    setVehicleFilter('')
    setStartFilter('')
    setEndFilter('')
  }, [focusRecordId])

  const focusedRecord = focusRecordId ? records.find((record) => record.id === focusRecordId) || null : null
  const totalPages = pagination.pages
  const paginatedRecords = records

  useEffect(() => {
    setCurrentPage(1)
  }, [search, organizationFilter, statusFilter, vehicleFilter, startFilter, endFilter, focusRecordId])

  function buildFilterSummary() {
    return [
      { label: 'Status', value: statusOptions.find((option) => option.value === statusFilter)?.label || 'Todas' },
      ...(organizationFilter ? [{
        label: 'Secretaria',
        value: organizationFilter === unassignedOrganizationFilter
          ? 'Sem secretaria'
          : organizationFilterOptions.find((option) => option.value === organizationFilter)?.label || 'Selecionada',
      }] : []),
      ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((vehicle) => vehicle.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
      ...(startFilter ? [{ label: 'Início a partir de', value: formatDate(new Date(startFilter).toISOString()) }] : []),
      ...(endFilter ? [{ label: 'Fim até', value: formatDate(new Date(endFilter).toISOString()) }] : []),
      ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
    ]
  }

  function patchSearchParams(updates) {
    const next = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === undefined || value === '') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
    })
    setSearchParams(next)
  }

  function clearFocus() {
    patchSearchParams({ focus: null })
  }

  async function handleDelete(id) {
    if (!window.confirm('Confirma a exclusão deste registro de manutenção?')) return

    try {
      setError('')
      setFeedback('')
      await maintenanceAPI.remove(id)
      setFeedback('Manutenção removida com sucesso.')
      await loadRecords()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível remover a manutenção.'))
    }
  }

  function closeModal() {
    setEditingRecord(null)
    setIsModalOpen(false)
  }

  async function handleExportPdf() {
    if (summary.total === 0) {
      setFeedback('Não há manutenções filtradas para pré-visualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const rows = await loadAllFilteredRecords()
      await previewRowsToPdf({
        title: 'Frota PMTF - Manutenções',
        fileName: 'frota-pmtf-manutenções',
        subtitle: 'Relatório das manutenções filtradas no painel operacional.',
        columns: exportColumns,
        rows,
        filters: buildFilterSummary(),
      })
      setFeedback('Pré-visualização do PDF de manutenções aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF de manutenções.'))
    }
  }

  async function handleExportXlsx() {
    if (summary.total === 0) {
      setFeedback('Não há manutenções filtradas para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const rows = await loadAllFilteredRecords()
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-manutenções',
        sheetName: 'Manutenções',
        columns: exportColumns,
        rows,
        filters: buildFilterSummary(),
      })
      setFeedback('Exportação de manutenções em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar as manutenções em XLSX.'))
    }
  }

  async function loadAllFilteredRecords() {
    const rows = []
    let page = 1
    while (true) {
      const { data } = await maintenanceAPI.listPaginated({ ...buildListParams(page), limit: 100 })
      rows.push(...data.data)
      if (page >= data.pagination.pages) return rows
      page += 1
    }
  }

  const openCount = summary.open
  const closedCount = summary.closed

  return (
    <div className="surface-panel operation-page operation-page--maintenance">
      <PageHeader
        title="Manutenções"
        description="Acompanhe revisões concluídas e serviços ainda em aberto sem sair do painel principal."
        actions={(
          <>
          {canCreateMaintenance ? (
            <button className="app-button" type="button" onClick={() => setIsModalOpen(true)}>
              Nova manutenção
            </button>
          ) : null}
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
          </>
        )}
      />

      <div className="toolbar-card operation-toolbar">
        <div className="toolbar-row">
          <div className="status-pills">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`status-pill${statusFilter === option.value ? ' active' : ''}`}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="filter-inline">
            <input
              className="app-input"
              placeholder="Buscar por placa, secretaria, serviço ou peças"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <MobileFilters activeCount={[organizationFilter, vehicleFilter, startFilter, endFilter].filter(Boolean).length}>
            <SearchableSelect
              value={organizationFilter}
              onChange={setOrganizationFilter}
              options={organizationFilterOptions}
              placeholder="Filtrar secretaria"
              searchPlaceholder="Buscar secretaria"
            />
            <SearchableSelect
              value={vehicleFilter}
              onChange={setVehicleFilter}
              options={[{ value: '', label: 'Todos os veículos' }, ...vehicles.map(buildVehicleOption)]} onOpen={loadVehicles}
              placeholder="Filtrar veículo"
              searchPlaceholder="Buscar veículo por placa, modelo ou chassi"
            />
            <input type="datetime-local" className="app-input" value={startFilter} onChange={(event) => setStartFilter(event.target.value)} />
            <input type="datetime-local" className="app-input" value={endFilter} onChange={(event) => setEndFilter(event.target.value)} />
            </MobileFilters>
          </div>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{summary.total}</strong>
          <span>registros exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{openCount}</strong>
          <span>em andamento</span>
        </div>
        <div className="metric-inline">
          <strong>{closedCount}</strong>
          <span>concluídas</span>
        </div>
      </div>

      {focusedRecord ? (
        <div className="table-focus-banner">
          <div>
            <strong>Mostrando apenas a manutenção de {focusedRecord.vehicle_plate}</strong>
            <span>Este foco veio de uma navegação direta. Use o botao ao lado para voltar a lista completa.</span>
          </div>
          <button className="ghost-button" type="button" onClick={clearFocus}>Reexibir todas</button>
        </div>
      ) : null}

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested operation-table-card">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide operation-table">
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Início</th>
                <th>Conclusão</th>
                <th>Serviço</th>
                <th>Peças</th>
                <th>Custo</th>
                <th>Status</th>
                {canManageMaintenanceActions ? <th>Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManageMaintenanceActions ? 8 : 7} className="muted">Carregando manutenções...</td>
                </tr>
              ) : pagination.total === 0 ? (
                <tr>
                  <td colSpan={canManageMaintenanceActions ? 8 : 7}>
                    <div className="empty-state">Nenhum registro encontrado para os filtros atuais.</div>
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((record) => (
                  <ResponsiveRecord key={record.id} className={focusedRecord?.id === record.id ? 'is-focused-row' : ''} label={`manutenção ${record.vehicle_plate}`} identityLabel="Veículo" summaryLabels={["Serviço", "Início"]}>
                    <td data-label="Veículo">
                      <div className="operation-vehicle-identity">
                        <VehicleThumbnail vehicleType={record.vehicle_type ?? getRecordVehicle(record)?.vehicle_type} plate={record.vehicle_plate} />
                        <span>
                          <strong>{record.vehicle_plate}</strong>
                          <small className="muted">{getRecordOrganizationName(record)}</small>
                        </span>
                      </div>
                    </td>
                    <td data-label="Início">{formatDate(record.start_date)}</td>
                    <td data-label="Conclusão">{formatDate(record.end_date)}</td>
                    <td data-label="Serviço">
                      <div className="stack">
                        <strong>{record.service_description}</strong>
                        <span className="muted">Atualizado em {formatDate(record.updated_at)}</span>
                        {isAdmin ? <span className="muted">Criado em {formatDate(record.created_at)}</span> : null}
                      </div>
                    </td>
                    <td data-label="Peças">{record.parts_replaced || 'Sem observação'}</td>
                    <td data-label="Custo">{formatMoney(record.total_cost)}</td>
                    <td data-label="Status">
                      <StatusChip tone={record.end_date ? 'success' : 'warning'}>{record.end_date ? 'CONCLUÍDA' : 'EM ANDAMENTO'}</StatusChip>
                    </td>
                    {canManageMaintenanceActions ? (
                      <td data-label="Ações">
                        <div className="operation-row-actions">
                          <ActionMenu
                            label={`Mais ações da manutenção de ${record.vehicle_plate}`}
                            items={[
                              { key: 'edit', label: 'Editar', icon: 'maintenance', hidden: !canEditMaintenance, onClick: () => { setEditingRecord(record); setIsModalOpen(true) } },
                              { key: 'delete', label: 'Excluir', icon: 'close', tone: 'danger', hidden: !canDeleteMaintenance, onClick: () => handleDelete(record.id) },
                            ]}
                          />
                        </div>
                      </td>
                    ) : null}
                  </ResponsiveRecord>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!focusedRecord ? <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} /> : null}

      <Modal
        open={isModalOpen}
        title={editingRecord ? 'Atualizar manutenção' : 'Nova manutenção'}
        description="Registre serviços, custo e conclusão para manter o histórico mecânico confiável."
        onClose={closeModal}
      >
        <MaintenanceForm
          onVehicleOptionsOpen={loadVehicles}
          vehicles={vehicles}
          initialData={editingRecord}
          onClose={closeModal}
          onSuccess={async (message) => {
            setFeedback(message)
            await loadRecords()
          }}
        />
      </Modal>
    </div>
  )
}
