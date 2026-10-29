import { officialBrand } from '../constants/officialBrand'
import IndicatorBar from '../components/ui/IndicatorBar'
import ContractReturnBanner from '../components/contracts/ContractReturnBanner'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Modal from '../components/Modal'
import MaintenanceForm from '../components/MaintenanceForm'
import MaintenanceOrderActionDialog from '../components/contracts/MaintenanceOrderActionDialog'
import { filterUnstartedOrders, findMaintenanceOrder, loadMaintenanceWorkspace, loadUnstartedMaintenanceOrders, maintenanceState, orderIndicators } from '../utils/maintenanceWorkspace'
import { useContractControl } from '../hooks/useContractFunding'
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
  const contractMode = useContractControl()
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators, select: selectIndicator } = useInteractiveKpis()
  useEffect(() => { setCurrentPage(1) }, [indicator])

  const { canCreate, canEdit, canDeleteModule, isAdmin } = useAuth()
  const canCreateMaintenance = canCreate('maintenance')
  const canEditMaintenance = canEdit('maintenance')
  const canDeleteMaintenance = canDeleteModule('maintenance')
  const canManageMaintenanceActions = canEditMaintenance || canDeleteMaintenance || Boolean(contractMode.enabled)
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
  const [unstartedOrders, setUnstartedOrders] = useState({ authorized: [], cancelled: [] })
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [orderAction, setOrderAction] = useState(null)
  const [orderLookup, setOrderLookup] = useState('')
  const listRequest = useRef(0)
  const focusRecordId = searchParams.get('focus')
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })
  const visibleOrders = useMemo(() => filterUnstartedOrders(unstartedOrders, { search,
    unassigned: organizationFilter === unassignedOrganizationFilter, vehicles }), [unstartedOrders, search, organizationFilter, vehicles])
  const relevantOrders = contractMode.enabled ? visibleOrders : null
  const workspaceError = error || ordersError || contractMode.error

  function refreshWorkspace() { setRefreshKey((value) => value + 1) }
  function selectWorkspaceIndicator(value) { setStatusFilter('TODAS'); selectIndicator(value) }
  async function showOrder(record, action = 'details') {
    setError(''); setOrderLookup(record.id)
    try {
      const row = record._order || await findMaintenanceOrder(record)
      setOrderAction({ row, action })
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível consultar o pedido vinculado.')) }
    finally { setOrderLookup('') }
  }
  useEffect(() => {
    if (searchParams.get('action') !== 'create') return
    if (canCreateMaintenance) setIsModalOpen(true)
    const next = new URLSearchParams(searchParams)
    next.delete('action')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams, canCreateMaintenance])

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
    if (record._order) return record._order.organization_name || 'Sem secretaria'
    return getRecordVehicle(record)?.current_location?.organization_name || 'Sem secretaria'
  }

  const exportColumns = [
    { header: 'Veículo', value: (record) => record.vehicle_plate },
    { header: 'Secretaria', value: (record) => getRecordOrganizationName(record) },
    { header: 'Início', value: (record) => record._order ? 'Não iniciado' : formatDate(record.start_date) },
    { header: 'Conclusão', value: (record) => record._order ? '—' : formatDate(record.end_date) },
    { header: 'Serviço', value: (record) => record.service_description },
    { header: 'Peças', value: (record) => record.parts_replaced || 'Sem observação' },
    { header: 'Custo', value: (record) => record._order ? '—' : formatMoney(record.total_cost) },
    ...(contractMode.enabled ? [{ header: 'Orçamento previsto', value: (record) => record._order ? formatMoney(record.estimated_cost) : '—' }] : []),
    { header: 'Status', value: maintenanceState },
    { header: 'Atualizado em', value: (record) => formatDate(record.updated_at) },
  ]

  async function loadVehicles() {
    const { data } = await api.get('/vehicles/options')
    setVehicles(Array.isArray(data) ? data : [])
  }

  function buildListParams(page = currentPage) {
    const focused = Boolean(focusRecordId)
    return { indicator: indicator === 'total' || orderIndicators.includes(indicator) ? undefined : indicator,
      page,
      limit: 10,
      vehicle_id: focused ? undefined : vehicleFilter || undefined,
      start: focused || !startFilter ? undefined : new Date(startFilter).toISOString(),
      end: focused || !endFilter ? undefined : new Date(endFilter).toISOString(),
      only_open: focused || !['EM_ANDAMENTO', 'CONCLUÍDAS'].includes(statusFilter) ? undefined : statusFilter === 'EM_ANDAMENTO',
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
      const data = contractMode.enabled
        ? await loadMaintenanceWorkspace({ params: buildListParams(page), orders: visibleOrders, page, status: statusFilter, indicator })
        : (await maintenanceAPI.listPaginated(buildListParams(page))).data
      if (request !== listRequest.current) return
      if (page > data.pagination.pages) {
        setCurrentPage(data.pagination.pages)
        return
      }
      setRecords(data.data || [])
      setPagination(data.pagination); setIndicators(data.indicators || null)
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
    if (contractMode.enabled === null) return undefined
    if (!contractMode.enabled || focusRecordId) { setOrdersLoading(false); setOrdersError(''); return undefined }
    let active = true
    setOrdersLoading(true); setLoading(true); setOrdersError('')
    loadUnstartedMaintenanceOrders({ vehicle_id: vehicleFilter || undefined,
      organization_id: organizationFilter && organizationFilter !== unassignedOrganizationFilter ? organizationFilter : undefined,
      start: startFilter ? new Date(startFilter).toISOString() : undefined,
      end: endFilter ? new Date(endFilter).toISOString() : undefined }).then((rows) => { if (active) setUnstartedOrders(rows) })
      .catch((err) => { if (active) { setOrdersError(getApiErrorMessage(err, 'Não foi possível consultar as autorizações.')); setLoading(false) } })
      .finally(() => { if (active) setOrdersLoading(false) })
    return () => { active = false }
  }, [contractMode.enabled, vehicleFilter, organizationFilter, startFilter, endFilter, refreshKey, focusRecordId])

  useEffect(() => {
    listRequest.current += 1
    if (contractMode.enabled === null || ordersLoading || ordersError || contractMode.error) return undefined
    const timer = setTimeout(() => loadRecords(), search.trim() ? 250 : 0)
    return () => clearTimeout(timer)
  }, [currentPage, vehicleFilter, startFilter, endFilter, search, statusFilter, organizationFilter, focusRecordId, indicator, relevantOrders, ordersLoading, ordersError, contractMode.enabled, contractMode.error, refreshKey])

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
  }, [search, organizationFilter, statusFilter, vehicleFilter, startFilter, endFilter, focusRecordId, indicator])

  function buildFilterSummary() {
    return [
      { label: 'Status', value: statusOptions.find((option) => option.value === statusFilter)?.label || 'Todas' },
      ...(indicator !== 'total' ? [{ label: 'Indicador', value: indicatorMetadata?.items?.find((item) => item.key === indicator)?.label || indicator }] : []),
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
      refreshWorkspace()
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
        title: `${officialBrand.systemName} - Manutenções`,
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
      const data = contractMode.enabled
        ? await loadMaintenanceWorkspace({ params: buildListParams(page), orders: visibleOrders, page, limit: 100, status: statusFilter, indicator })
        : (await maintenanceAPI.listPaginated({ ...buildListParams(page), limit: 100 })).data
      rows.push(...data.data)
      if (page >= data.pagination.pages) return rows
      page += 1
    }
  }


  return (
    <div className={`surface-panel operation-page operation-page--maintenance${contractMode.enabled ? ' maintenance-unified' : ''}`}>
      <PageHeader
        title="Manutenções"
        actions={(
          <>
          {canCreateMaintenance ? (
            <button className="app-button" type="button" onClick={() => setIsModalOpen(true)}>
              {contractMode.enabled ? 'Novo pedido de manutenção' : 'Nova manutenção'}
            </button>
          ) : null}
          <button className="ghost-button" type="button" onClick={refreshWorkspace}>Atualizar</button>
          <button className="secondary-button" type="button" onClick={handleExportPdf} disabled={loading || Boolean(workspaceError)}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx} disabled={loading || Boolean(workspaceError)}>Exportar XLSX</button>
          </>
        )}
      />

      <ContractReturnBanner returnTo={searchParams.get('return_to')} />
      <div className="toolbar-card operation-toolbar">
        <div className="toolbar-row">
          <div className="status-pills">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`status-pill${statusFilter === option.value ? ' active' : ''}`}
                onClick={() => { setStatusFilter(option.value); if (indicator !== 'total') selectIndicator('total') }}
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
            <input type="datetime-local" className="app-input" aria-label="Data inicial" title="Data inicial do pedido ou do serviço" value={startFilter} onChange={(event) => setStartFilter(event.target.value)} />
            <input type="datetime-local" className="app-input" aria-label="Data final" title="Data final do pedido ou do serviço" value={endFilter} onChange={(event) => setEndFilter(event.target.value)} />
            </MobileFilters>
          </div>
        </div>
      </div>

      <IndicatorBar state={{ selected: indicator, metadata: indicatorMetadata, select: selectWorkspaceIndicator }} loading={loading} error={workspaceError} resultCount={pagination.total} />

      {focusedRecord ? (
        <div className="table-focus-banner">
          <div>
            <strong>Mostrando apenas a manutenção de {focusedRecord.vehicle_plate}</strong>
            <span>Este foco veio de uma navegação direta. Use o botao ao lado para voltar a lista completa.</span>
          </div>
          <button className="ghost-button" type="button" onClick={clearFocus}>Reexibir todas</button>
        </div>
      ) : null}

      {workspaceError ? <div className="alert alert-error" role="alert">{workspaceError}</div> : null}
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
              {workspaceError ? <tr><td colSpan={canManageMaintenanceActions ? 8 : 7} className="muted">Atualize a listagem para tentar novamente.</td></tr> : loading ? (
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
                    <td data-label="Início">{record._order ? <span className="stack"><span>Não iniciado</span><small className="muted">Pedido em {formatDate(record.created_at)}</small></span> : formatDate(record.start_date)}</td>
                    <td data-label="Conclusão">{record._order ? '—' : formatDate(record.end_date)}</td>
                    <td data-label="Serviço">
                      <div className="stack">
                        <strong>{record.service_description}</strong>
                        {record._order ? <span className="muted">{record.contract_number} · {record.provider_name}</span> : null}
                        <span className="muted">Atualizado em {formatDate(record.updated_at)}</span>
                        {isAdmin ? <span className="muted">Criado em {formatDate(record.created_at)}</span> : null}
                      </div>
                    </td>
                    <td data-label="Peças">{record.parts_replaced || 'Sem observação'}</td>
                    <td data-label="Custo">{record._order ? <span className="stack"><span>—</span><small className="muted">Previsto {formatMoney(record.estimated_cost)}</small></span> : formatMoney(record.total_cost)}</td>
                    <td data-label="Status">
                      <StatusChip tone={record._order ? record._order.status === 'AUTHORIZED' ? 'info' : 'neutral' : record.end_date ? 'success' : 'warning'}>{maintenanceState(record)}</StatusChip>
                    </td>
                    {canManageMaintenanceActions ? (
                      <td data-label="Ações">
                        <div className="operation-row-actions">
                          {canEditMaintenance && record._order?.status === 'AUTHORIZED' ? <button className="secondary-button" onClick={() => showOrder(record, 'start')}>Iniciar serviço</button> : null}
                          {canEditMaintenance && (record._order?.status === 'AUTHORIZED' || (contractMode.enabled && !record.end_date && record.contract_reservation_id)) ? <button className="app-button" disabled={orderLookup === record.id} onClick={() => showOrder(record, 'complete')}>{orderLookup === record.id ? 'Consultando…' : 'Concluir'}</button> : null}
                          <ActionMenu
                            label={`Mais ações da manutenção de ${record.vehicle_plate}`}
                            items={[
                              { key: 'details', label: 'Ver pedido e contrato', hidden: !record._order && !(contractMode.enabled && record.contract_reservation_id), onClick: () => showOrder(record) },
                              { key: 'cancel', label: 'Cancelar pedido', tone: 'danger', hidden: !canEditMaintenance || record._order?.status !== 'AUTHORIZED', onClick: () => showOrder(record, 'cancel') },
                              { key: 'edit', label: contractMode.enabled && record.contract_reservation_id ? 'Retificar' : 'Editar', icon: 'maintenance', hidden: !canEditMaintenance || Boolean(record._order) || Boolean(contractMode.enabled && record.contract_reservation_id && !record.end_date), onClick: () => { setEditingRecord(record); setIsModalOpen(true) } },
                              { key: 'delete', label: 'Excluir', icon: 'close', tone: 'danger', hidden: !canDeleteMaintenance || Boolean(record._order) || Boolean(contractMode.enabled && record.contract_reservation_id), onClick: () => handleDelete(record.id) },
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

      {orderAction ? <MaintenanceOrderActionDialog key={`${orderAction.row.id}:${orderAction.action}`} {...orderAction} onClose={() => setOrderAction(null)} onSuccess={(message) => { setFeedback(message); refreshWorkspace() }} /> : null}

      <Modal
        open={isModalOpen}
        title={editingRecord ? 'Atualizar manutenção' : contractMode.enabled ? 'Novo pedido de manutenção' : 'Nova manutenção'}
        description={!editingRecord && contractMode.enabled ? 'Autorize o serviço com contrato, oficina e orçamento. O valor ficará reservado até a conclusão.' : 'Registre serviços, custo e conclusão para manter o histórico mecânico confiável.'}
        onClose={closeModal}
      >
        <MaintenanceForm
          initialContractId={searchParams.get('contract_id') || ''}
          returnTo={searchParams.get('return_to') || ''}
          onVehicleOptionsOpen={loadVehicles}
          vehicles={vehicles}
          initialData={editingRecord}
          onClose={closeModal}
          onSuccess={async (message) => {
            setFeedback(message)
            refreshWorkspace()
          }}
        />
      </Modal>
    </div>
  )
}
