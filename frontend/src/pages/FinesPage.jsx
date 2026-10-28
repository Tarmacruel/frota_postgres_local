import GuidedForm, { FormSection as GuidedSection } from '../components/GuidedForm'
import MoneyInput from '../components/MoneyInput'
import IndicatorBar from '../components/ui/IndicatorBar'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import DriverSelect from '../components/DriverSelect'
import SearchableSelect from '../components/SearchableSelect'
import { MobileFilters, ResponsiveRecord, ActionMenu, PageHeader, StatusChip, VehicleThumbnail } from '../components/ui'
import { finesAPI } from '../api/fines'
import { vehiclesAPI } from '../api/vehicles'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const statusOptions = ['TODOS', 'PENDENTE', 'PAGA', 'RECURSO', 'DEFERIDA']

const initialForm = {
  vehicle_id: '',
  driver_id: '',
  infraction_type_id: '',
  ticket_number: '',
  infraction_date: '',
  infraction_time: '',
  due_date: '',
  amount: '',
  location: '',
  status: 'PENDENTE',
  communication_number: '',
  sent_date: '',
  process_number: '',
  source_status: '',
  imported_driver_name: '',
  notes: '',
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR')
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function vehicleOption(vehicle) {
  const location = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação'
  return {
    value: vehicle.id, tags: vehicle.tags || [],
    label: `${vehicle.plate}${vehicle.is_provisional ? ' (provisório)' : ''} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type} | ${location}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.renavam || '', location].join(' '),
  }
}

function infractionOption(item) {
  return {
    value: item.id,
    label: `${item.code}/${item.desdobramento} . ${item.description}`,
    description: [item.ctb_article, item.severity, item.default_amount ? formatMoney(item.default_amount) : null, item.is_provisional ? 'Provisório' : null].filter(Boolean).join(' | '),
    keywords: [item.code, item.desdobramento, item.description, item.ctb_article, item.severity].filter(Boolean).join(' '),
  }
}

function infractionTitle(item) {
  if (!item) return '-'
  return `${item.code}/${item.desdobramento} - ${item.description}`
}

function fineStatusTone(status) {
  if (status === 'PAGA' || status === 'DEFERIDA') return 'success'
  if (status === 'RECURSO') return 'info'
  if (status === 'PENDENTE') return 'warning'
  return 'neutral'
}

export default function FinesPage() {
  const kpiRequest = useRef(0)
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators, select: selectIndicator } = useInteractiveKpis()

  const { canCreate, canEdit } = useAuth()
  const canCreateFine = canCreate('fines')
  const canEditFine = canEdit('fines')
  const [vehicles, setVehicles] = useState([])
  const [infractions, setInfractions] = useState([])
  const [chosenInfraction, setChosenInfraction] = useState(null)
  const [infractionsLoading, setInfractionsLoading] = useState(false)
  const infractionRequestId = useRef(0)
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
  }))

  const availableInfractions = useMemo(() => chosenInfraction && !infractions.some((item) => item.id === chosenInfraction.id)
    ? [chosenInfraction, ...infractions] : infractions, [infractions, chosenInfraction])
  const infractionOptions = useMemo(() => availableInfractions.filter((item) => item.is_active || item.id === form.infraction_type_id).map(infractionOption), [availableInfractions, form.infraction_type_id])
  const selectedInfraction = availableInfractions.find((item) => item.id === form.infraction_type_id)

  function getVehicleOrganizationName(vehicleId) {
    return vehicles.find((vehicle) => vehicle.id === vehicleId)?.current_location?.organization_name || 'Sem secretaria'
  }

  const exportColumns = [
    { header: 'Veículo', value: (item) => item.vehicle_plate },
    { header: 'Secretaria', value: (item) => getVehicleOrganizationName(item.vehicle_id) },
    { header: 'Auto', value: (item) => item.ticket_number },
    { header: 'Enquadramento', value: (item) => infractionTitle(item.infraction_type) },
    { header: 'Condutor', value: (item) => item.driver_name || item.imported_driver_name || '-' },
    { header: 'Data infração', value: (item) => formatDate(item.infraction_date) },
    { header: 'Vencimento', value: (item) => formatDate(item.due_date) },
    { header: 'Valor', value: (item) => formatMoney(item.amount) },
    { header: 'Status', value: (item) => item.status },
  ]

  const loadInfractions = useCallback(async (term = '') => {
    const currentRequest = ++infractionRequestId.current
    try {
      setInfractionsLoading(true)
      const { data } = await finesAPI.listInfractionsPaginated({ page: 1, limit: 30, active_only: true, search: term.trim() || undefined })
      if (currentRequest === infractionRequestId.current) setInfractions(data.data || [])
    } catch {
      if (currentRequest === infractionRequestId.current) setInfractions([])
    } finally {
      if (currentRequest === infractionRequestId.current) setInfractionsLoading(false)
    }
  }, [])

  async function loadAux() {
    const vehicleResponse = await vehiclesAPI.listOptions()
    setVehicles(Array.isArray(vehicleResponse.data) ? vehicleResponse.data : [])
  }

  async function handleVehicleChange(value) {
    setForm((prev) => ({ ...prev, vehicle_id: value }))
    if (!value || editingRecord) return

    try {
      const { data } = await vehiclesAPI.currentDriver(value)
      setForm((prev) => ({ ...prev, driver_id: data?.driver_id || '' }))
    } catch {
      setForm((prev) => ({ ...prev, driver_id: '' }))
    }
  }

  function handleInfractionChange(value) {
    const next = availableInfractions.find((item) => item.id === value)
    setChosenInfraction(next || null)
    setForm((prev) => ({
      ...prev,
      infraction_type_id: value,
      amount: prev.amount || (next?.default_amount ? String(next.default_amount) : ''),
    }))
  }

  async function loadFines(page = pagination.page) {
    const request = ++kpiRequest.current
    try {
      setLoading(true)
      setError('')
      const { data } = await finesAPI.list({ indicator: indicator === 'total' ? undefined : indicator,
        page,
        limit: 10,
        vehicle_id: vehicleFilter || undefined,
        organization_id: organizationFilter || undefined,
        status: statusFilter !== 'TODOS' ? statusFilter : undefined,
        search: search || undefined,
      })
      if (request !== kpiRequest.current) return
      setRecords(data.data)
      setPagination(data.pagination); setIndicators(data.indicators || null)
    } catch (err) {
      if (request !== kpiRequest.current) return
      setError(getApiErrorMessage(err, 'Não foi possível carregar as multas.'))
    } finally {
      if (request === kpiRequest.current) setLoading(false)
    }
  }

  useEffect(() => { loadAux().catch(() => {}) }, [])
  useEffect(() => { loadFines(1) }, [search, organizationFilter, vehicleFilter, statusFilter, indicator])

  function openCreate() {
    setEditingRecord(null)
    setChosenInfraction(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  function openEdit(record) {
    setEditingRecord(record)
    setChosenInfraction(record.infraction_type || null)
    setForm({
      vehicle_id: record.vehicle_id,
      driver_id: record.driver_id || '',
      infraction_type_id: record.infraction_type_id || '',
      ticket_number: record.ticket_number,
      infraction_date: record.infraction_date,
      infraction_time: record.infraction_time || '',
      due_date: record.due_date || '',
      amount: record.amount,
      location: record.location || '',
      status: record.status,
      communication_number: record.communication_number || '',
      sent_date: record.sent_date || '',
      process_number: record.process_number || '',
      source_status: record.source_status || '',
      imported_driver_name: record.imported_driver_name || '',
      notes: record.notes || '',
    })
    setIsModalOpen(true)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if ((editingRecord && !canEditFine) || (!editingRecord && !canCreateFine)) {
      setError('Você não tem permissão para salvar multa neste módulo.')
      return
    }
    if (!form.vehicle_id || !form.infraction_type_id) {
      setError('Selecione veículo e enquadramento para registrar a multa.')
      return
    }
    try {
      setSubmitting(true)
      const payload = {
        ...form,
        driver_id: form.driver_id || null,
        due_date: form.due_date || null,
        infraction_time: form.infraction_time || null,
        sent_date: form.sent_date || null,
        location: form.location || null,
        communication_number: form.communication_number || null,
        process_number: form.process_number || null,
        source_status: form.source_status || null,
        imported_driver_name: form.imported_driver_name || null,
        notes: form.notes || null,
        amount: Number(form.amount),
      }
      if (editingRecord) {
        await finesAPI.update(editingRecord.id, payload)
        setFeedback('Multa atualizada com sucesso.')
      } else {
        await finesAPI.create(payload)
        setFeedback('Multa cadastrada com sucesso.')
      }
      setIsModalOpen(false)
      setForm(initialForm)
      await loadFines(editingRecord ? pagination.page : 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar a multa.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePreviewPdf() {
    if (!pagination.total) return
    const reportRows = await allFilteredFines()
    await previewRowsToPdf({
      title: 'Frota PMTF - Multas',
      fileName: 'frota-pmtf-multas',
      subtitle: 'Relatório das multas filtradas.',
      columns: exportColumns,
      rows: reportRows,
      filters: [
        { label: 'Status', value: statusFilter },
        ...(organizationFilter ? [{ label: 'Secretaria', value: organizationOptions.find((item) => item.value === organizationFilter)?.label || 'Selecionada' }] : []),
        ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  async function handleExportXlsx() {
    if (!pagination.total) return
    const reportRows = await allFilteredFines()
    await exportRowsToXlsx({
      fileName: 'frota-pmtf-multas',
      sheetName: 'Multas',
      columns: exportColumns,
      rows: reportRows,
      filters: [
        { label: 'Status', value: statusFilter },
        ...(organizationFilter ? [{ label: 'Secretaria', value: organizationOptions.find((item) => item.value === organizationFilter)?.label || 'Selecionada' }] : []),
        ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
      ],
    })
  }

  async function allFilteredFines() {
    const reportRows = []
    let page = 1
    let pages
    do {
      const { data } = await finesAPI.list({ indicator: indicator === 'total' ? undefined : indicator,
        page, limit: 100, vehicle_id: vehicleFilter || undefined,
        organization_id: organizationFilter || undefined,
        status: statusFilter !== 'TODOS' ? statusFilter : undefined,
        search: search || undefined,
      })
      reportRows.push(...(data.data || []))
      pages = data.pagination.pages
      page += 1
    } while (page <= pages)
    return reportRows
  }

  return (
    <div className="surface-panel operation-page operation-page--fines">
      <PageHeader
        title="Multas"
        actions={<>
          {canCreateFine ? <button className="app-button" onClick={openCreate}>Nova multa</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </>}
      />

      <div className="operation-toolbar toolbar-row">
        <div className="filter-inline">
          <input className="app-input" placeholder="Buscar por auto, enquadramento, descrição, local ou matrícula" value={search} onChange={(e) => setSearch(e.target.value)} />
          <MobileFilters activeCount={[organizationFilter, vehicleFilter, statusFilter !== 'TODOS'].filter(Boolean).length}>
          <SearchableSelect value={organizationFilter} onChange={setOrganizationFilter} options={[{ value: '', label: 'Todas as secretarias' }, ...organizationOptions]} placeholder="Filtrar secretaria" searchPlaceholder="Buscar secretaria" />
          <SearchableSelect value={vehicleFilter} onChange={setVehicleFilter} options={[{ value: '', label: 'Todos os veículos' }, ...vehicles.map(vehicleOption)]} onOpen={loadAux} placeholder="Filtrar veículo" searchPlaceholder="Buscar veículo" />
          <select className="app-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          </MobileFilters>
        </div>
      </div>

      {error && !isModalOpen ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested operation-module">
        <IndicatorBar state={{ selected: indicator, metadata: indicatorMetadata, select: selectIndicator }} loading={loading} error={error} resultCount={pagination.total} />
      <div className="table-wrap table-wrap-wide operation-table-card">
          <table className="data-table data-table-wide operation-table">
            <thead><tr><th>Veículo</th><th>Auto</th><th>Enquadramento</th><th>Condutor</th><th>Infração</th><th>Valor</th><th>Status</th>{canEditFine ? <th>Ações</th> : null}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={canEditFine ? 8 : 7}>Carregando multas...</td></tr> : records.length === 0 ? <tr><td colSpan={canEditFine ? 8 : 7}><div className="empty-state">Nenhuma multa encontrada.</div></td></tr> : records.map((record) => (
                <ResponsiveRecord key={record.id} label={`multa ${record.ticket_number}`} identityLabel="Veículo" summaryLabels={["Auto", "Infração", "Valor"]}>
                  <td data-label="Veículo"><div className="operation-vehicle-identity"><VehicleThumbnail vehicleType={record.vehicle_type} plate={record.vehicle_plate} /><span><strong>{record.vehicle_plate}</strong><span className="muted">{getVehicleOrganizationName(record.vehicle_id)}</span></span></div></td>
                  <td data-label="Auto">{record.ticket_number}</td>
                  <td data-label="Enquadramento"><div className="stack"><strong>{record.infraction_type ? `${record.infraction_type.code}/${record.infraction_type.desdobramento}` : '-'}</strong><span className="muted">{record.infraction_type?.description || record.description}</span></div></td>
                  <td data-label="Condutor">{record.driver_name || record.imported_driver_name || '-'}</td>
                  <td data-label="Infração"><div className="stack"><span>{formatDate(record.infraction_date)}{record.infraction_time ? ` ${record.infraction_time.slice(0, 5)}` : ''}</span><span className="muted">Vence em {formatDate(record.due_date)}</span></div></td>
                  <td data-label="Valor">{formatMoney(record.amount)}</td>
                  <td data-label="Status"><StatusChip tone={fineStatusTone(record.status)}>{record.status}</StatusChip></td>
                  {canEditFine ? <td data-label="Ações"><ActionMenu label={`Ações da multa ${record.ticket_number}`} items={[{ key: 'edit', label: 'Editar multa', onClick: () => openEdit(record) }]} /></td> : null}
                </ResponsiveRecord>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadFines} />

      <Modal open={isModalOpen} title={editingRecord ? 'Editar multa' : 'Nova multa'} onClose={() => setIsModalOpen(false)}>
        <GuidedForm formError={error} busy={submitting} onSubmit={handleSubmit} className="form-grid modal-form-grid">
          <GuidedSection title="Identificação" description="Identifique o veículo, o condutor e o enquadramento.">
<div className="form-field">
            <label>Veículo</label>
            <SearchableSelect required value={form.vehicle_id} onChange={handleVehicleChange} options={vehicles.filter((vehicle) => vehicle.can_operate_vehicle !== false).map(vehicleOption)} onOpen={loadAux} placeholder="Selecionar veículo" searchPlaceholder="Buscar veículo por placa, RENAVAM, marca ou modelo" />
          </div>
          <div className="form-field">
            <label>Condutor</label>
            <DriverSelect
              value={form.driver_id}
              onChange={(driver) => setForm({ ...form, driver_id: driver?.id || '' })}
              placeholder="Selecionar condutor"
              allowClear
              clearLabel="Não informado"
            />
          </div>
          <div className="form-field modal-field-span">
            <label>Enquadramento</label>
            <SearchableSelect required value={form.infraction_type_id} onChange={handleInfractionChange} options={infractionOptions} placeholder="Selecionar infração CTB/CONTRAN" searchPlaceholder="Buscar código, artigo ou descrição" remoteSearch onSearch={loadInfractions} loading={infractionsLoading} />
          </div>
          {selectedInfraction ? (
            <div className="evidence-meta-card modal-field-span">
              <strong>{selectedInfraction.code}/{selectedInfraction.desdobramento}</strong>
              <p className="section-copy">{selectedInfraction.description}</p>
              <div className="stack">
                <span>{selectedInfraction.ctb_article || 'Sem amparo informado'}</span>
                <span>{selectedInfraction.severity || 'Sem gravidade informada'}{selectedInfraction.default_amount ? ` | ${formatMoney(selectedInfraction.default_amount)}` : ''}</span>
              </div>
            </div>
          ) : null}

</GuidedSection>
<GuidedSection title="Infração" description="Confira o auto, a data, o valor e o local.">
<div className="form-field"><label>Número do auto</label><input className="app-input" value={form.ticket_number} onChange={(e) => setForm({ ...form, ticket_number: e.target.value })} required /></div>
          <div className="form-field"><label>Data infração</label><input type="date" className="app-input" value={form.infraction_date} onChange={(e) => setForm({ ...form, infraction_date: e.target.value })} required /></div>
          <div className="form-field"><label>Hora</label><input type="time" className="app-input" value={form.infraction_time} onChange={(e) => setForm({ ...form, infraction_time: e.target.value })} /></div>
          <div className="form-field"><label>Vencimento</label><input type="date" className="app-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="form-field"><label>Valor</label><MoneyInput type="number" min="0" step="0.01" className="app-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
          <div className="form-field"><label>Local</label><input className="app-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="form-field"><label>Status</label><select className="app-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.filter((o) => o !== 'TODOS').map((o) => <option key={o} value={o}>{o}</option>)}</select></div>

</GuidedSection>
<GuidedSection title="Acompanhamento" description="Complete os dados de comunicação e do processo quando disponíveis.">
<div className="form-field"><label>C.I.</label><input className="app-input" value={form.communication_number} onChange={(e) => setForm({ ...form, communication_number: e.target.value })} /></div>
          <div className="form-field"><label>Enviado em</label><input type="date" className="app-input" value={form.sent_date} onChange={(e) => setForm({ ...form, sent_date: e.target.value })} /></div>
          <div className="form-field"><label>Processo</label><input className="app-input" value={form.process_number} onChange={(e) => setForm({ ...form, process_number: e.target.value })} /></div>
          <div className="form-field modal-field-span"><label>Observações</label><textarea className="app-textarea" rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
</GuidedSection>
          <div className="actions-inline modal-actions" style={{ gridColumn: '1 / -1' }}>
            <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar multa'}</button>
          </div>
        </GuidedForm>
      </Modal>
    </div>
  )
}
