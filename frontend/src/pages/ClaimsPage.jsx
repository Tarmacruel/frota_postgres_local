import IndicatorBar from '../components/ui/IndicatorBar'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import { useEffect, useRef, useState } from 'react'
import ClaimAttachmentsField from '../components/ClaimAttachmentsField'
import ClaimForm from '../components/ClaimForm'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import { MobileFilters, ResponsiveRecord, ActionMenu, PageHeader, StatusChip, VehicleThumbnail } from '../components/ui'
import { claimsAPI } from '../api/claims'
import { vehiclesAPI } from '../api/vehicles'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const typeOptions = ['TODOS', 'COLISAO', 'ROUBO', 'FURTO', 'AVARIA', 'OUTRO']
const statusOptions = ['TODOS', 'ABERTO', 'EM_ANALISE', 'ENCERRADO']

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value))
}

function vehicleOption(vehicle) {
  const location = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  return {
    value: vehicle.id, tags: vehicle.tags || [],
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type} | ${location}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, location].join(' '),
  }
}

function hasClaimAttachments(record) {
  return Boolean(record?.attachments?.length || record?.anexos?.length)
}

function claimStatusTone(status) {
  if (status === 'ENCERRADO') return 'success'
  if (status === 'EM_ANALISE') return 'warning'
  if (status === 'ABERTO') return 'danger'
  return 'neutral'
}

export default function ClaimsPage() {
  const kpiRequest = useRef(0)
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators, select: selectIndicator } = useInteractiveKpis()

  const { canCreate, canEdit } = useAuth()
  const canCreateClaim = canCreate('claims')
  const canEditClaim = canEdit('claims')
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [typeFilter, setTypeFilter] = useState('TODOS')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [viewingAttachmentsRecord, setViewingAttachmentsRecord] = useState(null)
  const [claimFormBusy, setClaimFormBusy] = useState(false)
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
  }))

  function getVehicleOrganizationName(vehicleId) {
    return vehicles.find((vehicle) => vehicle.id === vehicleId)?.current_location?.organization_name || 'Sem secretaria'
  }

  const exportColumns = [
    { header: 'Veículo', value: (item) => item.vehicle_plate },
    { header: 'Secretaria', value: (item) => getVehicleOrganizationName(item.vehicle_id) },
    { header: 'Condutor', value: (item) => item.driver_name || '-' },
    { header: 'Data', value: (item) => formatDate(item.data_ocorrencia) },
    { header: 'Tipo', value: (item) => item.tipo },
    { header: 'Status', value: (item) => item.status },
    { header: 'Local', value: (item) => item.local },
    { header: 'Valor estimado', value: (item) => formatMoney(item.valor_estimado) },
  ]

  async function loadVehicles() {
    const { data } = await vehiclesAPI.listOptions()
    setVehicles(data)
  }

  async function loadClaims(page = pagination.page) {
    const request = ++kpiRequest.current
    try {
      setLoading(true)
      setError('')
      const { data } = await claimsAPI.list({ indicator: indicator === 'total' ? undefined : indicator,
        page,
        limit: 10,
        vehicle_id: vehicleFilter || undefined,
        organization_id: organizationFilter || undefined,
        status: statusFilter !== 'TODOS' ? statusFilter : undefined,
        tipo: typeFilter !== 'TODOS' ? typeFilter : undefined,
        search: search || undefined,
      })
      if (request !== kpiRequest.current) return
      setRecords(data.data)
      setPagination(data.pagination); setIndicators(data.indicators || null)
    } catch (err) {
      if (request !== kpiRequest.current) return
      setError(getApiErrorMessage(err, 'Não foi possível carregar os sinistros.'))
    } finally {
      if (request === kpiRequest.current) setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles().catch(() => {})
  }, [indicator])

  useEffect(() => {
    loadClaims(1)
  }, [organizationFilter, vehicleFilter, statusFilter, typeFilter, search, indicator])

  async function handlePreviewPdf() {
    if (!records.length) return
    await previewRowsToPdf({
      title: 'Frota PMTF - Sinistros',
      fileName: 'frota-pmtf-sinistros',
      subtitle: 'Relatório da página atual de sinistros.',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        { label: 'Tipo', value: typeFilter },
        ...(organizationFilter ? [{ label: 'Secretaria', value: organizationOptions.find((item) => item.value === organizationFilter)?.label || 'Selecionada' }] : []),
        ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  async function handleExportXlsx() {
    if (!records.length) return
    await exportRowsToXlsx({
      fileName: 'frota-pmtf-sinistros',
      sheetName: 'Sinistros',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        { label: 'Tipo', value: typeFilter },
        ...(organizationFilter ? [{ label: 'Secretaria', value: organizationOptions.find((item) => item.value === organizationFilter)?.label || 'Selecionada' }] : []),
        ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
      ],
    })
  }

  return (
    <div className="surface-panel operation-page operation-page--claims">
      <PageHeader
        title="Sinistros"
        description="Registre ocorrências, acompanhe o status e mantenha o histórico de prejuízos e análises da frota."
        actions={<>
          {canCreateClaim ? <button className="app-button" type="button" onClick={() => { setEditingRecord(null); setClaimFormBusy(false); setIsModalOpen(true) }}>Novo sinistro</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </>}
      />

      <div className="toolbar-card operation-toolbar">
        <div className="toolbar-row">
          <div className="filter-inline">
            <input className="app-input" placeholder="Buscar por descrição, local, BO ou matrícula" value={search} onChange={(event) => setSearch(event.target.value)} />
            <MobileFilters activeCount={[organizationFilter, vehicleFilter, statusFilter !== 'TODOS', typeFilter !== 'TODOS'].filter(Boolean).length}>
          <SearchableSelect
              value={organizationFilter}
              onChange={setOrganizationFilter}
              options={[{ value: '', label: 'Todas as secretarias' }, ...organizationOptions]}
              placeholder="Filtrar secretaria"
              searchPlaceholder="Buscar secretaria"
            />
            <SearchableSelect
              value={vehicleFilter}
              onChange={setVehicleFilter}
              options={[{ value: '', label: 'Todos os veículos' }, ...vehicles.map(vehicleOption)]} onOpen={loadVehicles}
              placeholder="Filtrar veículo"
              searchPlaceholder="Buscar veículo"
            />
            <select className="app-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <select className="app-select" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {typeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </MobileFilters>
          </div>
        </div>
      </div>

      <IndicatorBar state={{ selected: indicator, metadata: indicatorMetadata, select: selectIndicator }} loading={loading} error={error} resultCount={pagination.total} />

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested operation-module">
        <div className="table-wrap table-wrap-wide operation-table-card">
          <table className="data-table data-table-wide operation-table">
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Condutor</th>
                <th>Data</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Local</th>
                <th>Valor</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="muted">Carregando sinistros...</td></tr>
              ) : !records.length ? (
                <tr><td colSpan={8}><div className="empty-state">Nenhum sinistro encontrado para os filtros aplicados.</div></td></tr>
              ) : (
                records.map((record) => (
                  <ResponsiveRecord key={record.id} label={`sinistro ${record.vehicle_plate}`} identityLabel="Veículo" summaryLabels={["Data", "Tipo"]}>
                    <td data-label="Veículo">
                      <div className="operation-vehicle-identity">
                        <VehicleThumbnail vehicleType={record.vehicle_type} plate={record.vehicle_plate} />
                        <span>
                        <strong>{record.vehicle_plate}</strong>
                        <span className="muted">{getVehicleOrganizationName(record.vehicle_id)}</span>
                        </span>
                      </div>
                    </td>
                    <td data-label="Condutor">{record.driver_name || '-'}</td>
                    <td data-label="Data">{formatDate(record.data_ocorrencia)}</td>
                    <td data-label="Tipo">{record.tipo}</td>
                    <td data-label="Status"><StatusChip tone={claimStatusTone(record.status)}>{record.status}</StatusChip></td>
                    <td data-label="Local">{record.local}</td>
                    <td data-label="Valor">{formatMoney(record.valor_estimado)}</td>
                    <td data-label="Ações">
                      {canEditClaim || hasClaimAttachments(record) ? <ActionMenu
                        label={`Ações do sinistro de ${record.vehicle_plate}`}
                        items={[
                          canEditClaim ? { key: 'edit', label: 'Editar sinistro', onClick: () => { setEditingRecord(record); setClaimFormBusy(false); setIsModalOpen(true) } } : null,
                          !canEditClaim && hasClaimAttachments(record) ? { key: 'attachments', label: 'Ver anexos', onClick: () => setViewingAttachmentsRecord(record) } : null,
                        ]}
                      /> : <span className="muted">-</span>}
                    </td>
                  </ResponsiveRecord>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadClaims} />

      <Modal
        open={isModalOpen}
        title={editingRecord ? 'Editar sinistro' : 'Novo sinistro'}
        description="Relacione o veículo, o condutor quando conhecido e os dados operacionais da ocorrência."
        onClose={() => setIsModalOpen(false)}
        canClose={!claimFormBusy}
      >
        <ClaimForm
          vehicles={vehicles} onVehicleOptionsOpen={loadVehicles}
          initialData={editingRecord}
          onClose={() => setIsModalOpen(false)}
          onSuccess={async (message) => {
            setFeedback(message)
            await loadClaims(editingRecord ? pagination.page : 1)
          }}
          canSubmit={editingRecord ? canEditClaim : canCreateClaim}
          onSubmittingChange={setClaimFormBusy}
        />
      </Modal>

      <Modal
        open={Boolean(viewingAttachmentsRecord)}
        title="Anexos do sinistro"
        description="Consulte as fotos, documentos e referências vinculados à ocorrência."
        onClose={() => setViewingAttachmentsRecord(null)}
      >
        {viewingAttachmentsRecord ? (
          <>
            <ClaimAttachmentsField
              claimId={viewingAttachmentsRecord.id}
              existingAttachments={viewingAttachmentsRecord.attachments || []}
              legacyReferences={viewingAttachmentsRecord.anexos || []}
              pendingAttachments={[]}
              onPendingAttachmentsChange={() => {}}
              removedAttachmentIds={[]}
              onRemovedAttachmentIdsChange={() => {}}
              canManage={false}
            />
            <div className="actions-inline claim-attachment-view-actions">
              <button className="ghost-button" type="button" onClick={() => setViewingAttachmentsRecord(null)}>Fechar</button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  )
}
