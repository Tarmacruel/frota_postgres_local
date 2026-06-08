import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import { finesAPI } from '../api/fines'
import { vehiclesAPI } from '../api/vehicles'
import { driversAPI } from '../api/drivers'
import { VEHICLE_LIST_LIMIT } from '../constants/pagination'
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
    value: vehicle.id,
    label: `${vehicle.plate}${vehicle.is_provisional ? ' (provisório)' : ''} . ${vehicle.brand} ${vehicle.model}`,
    description: `${vehicle.ownership_type} | ${location}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.renavam || '', location].join(' '),
  }
}

function driverOption(driver) {
  return {
    value: driver.id,
    label: driver.nome_completo,
    description: `${driver.documento} | CNH ${driver.cnh_categoria}${driver.cnh_validade ? ` | validade ${formatDate(driver.cnh_validade)}` : ''}`,
    keywords: [driver.nome_completo, driver.documento, driver.email || '', driver.contato || ''].join(' '),
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

export default function FinesPage() {
  const { canCreate, canEdit, isAdmin } = useAuth()
  const canCreateFine = canCreate('fines')
  const canEditFine = canEdit('fines')
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [infractions, setInfractions] = useState([])
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [infractionForm, setInfractionForm] = useState(initialInfractionForm)
  const { organizations } = useMasterDataCatalog()

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
  }))

  const infractionOptions = useMemo(() => infractions.filter((item) => item.is_active).map(infractionOption), [infractions])
  const selectedInfraction = infractions.find((item) => item.id === form.infraction_type_id)
  const catalogRows = useMemo(() => {
    const term = catalogSearch.trim().toLowerCase()
    if (!term) return infractions
    return infractions.filter((item) => `${item.code} ${item.desdobramento} ${item.description} ${item.ctb_article || ''}`.toLowerCase().includes(term))
  }, [infractions, catalogSearch])

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

  async function loadInfractions(params = {}) {
    const { data } = await finesAPI.listInfractions({
      limit: 500,
      active_only: isAdmin ? false : true,
      ...params,
    })
    setInfractions(data)
  }

  async function loadAux() {
    const [vehicleResponse, driverResponse] = await Promise.all([
      vehiclesAPI.list({ limit: VEHICLE_LIST_LIMIT }),
      driversAPI.listActive({ limit: 200 }),
      loadInfractions(),
    ])
    setVehicles(Array.isArray(vehicleResponse.data) ? vehicleResponse.data : [])
    setDrivers(Array.isArray(driverResponse.data) ? driverResponse.data : [])
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
    const next = infractions.find((item) => item.id === value)
    setForm((prev) => ({
      ...prev,
      infraction_type_id: value,
      amount: prev.amount || (next?.default_amount ? String(next.default_amount) : ''),
    }))
  }

  async function loadFines(page = pagination.page) {
    try {
      setLoading(true)
      setError('')
      const { data } = await finesAPI.list({
        page,
        limit: 10,
        vehicle_id: vehicleFilter || undefined,
        organization_id: organizationFilter || undefined,
        status: statusFilter !== 'TODOS' ? statusFilter : undefined,
        search: search || undefined,
      })
      setRecords(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as multas.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAux().catch(() => {}) }, [isAdmin])
  useEffect(() => { loadFines(1) }, [search, organizationFilter, vehicleFilter, statusFilter])

  function openCreate() {
    setEditingRecord(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  function openEdit(record) {
    setEditingRecord(record)
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
    if (!records.length) return
    await previewRowsToPdf({
      title: 'Frota PMTF - Multas',
      fileName: 'frota-pmtf-multas',
      subtitle: 'Relatório da página atual de multas cadastradas.',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        ...(organizationFilter ? [{ label: 'Secretaria', value: organizationOptions.find((item) => item.value === organizationFilter)?.label || 'Selecionada' }] : []),
        ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  async function handleExportXlsx() {
    if (!records.length) return
    await exportRowsToXlsx({
      fileName: 'frota-pmtf-multas',
      sheetName: 'Multas',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: statusFilter },
        ...(organizationFilter ? [{ label: 'Secretaria', value: organizationOptions.find((item) => item.value === organizationFilter)?.label || 'Selecionada' }] : []),
        ...(vehicleFilter ? [{ label: 'Veículo', value: vehicles.find((item) => item.id === vehicleFilter)?.plate || 'Selecionado' }] : []),
      ],
    })
  }

  function startInfractionEdit(item) {
    setInfractionForm({
      id: item.id,
      code: item.code,
      desdobramento: item.desdobramento,
      description: item.description,
      ctb_article: item.ctb_article || '',
      offender: item.offender || '',
      severity: item.severity || '',
      competent_body: item.competent_body || '',
      default_amount: item.default_amount || '',
      points: item.points || '',
      is_active: item.is_active,
      source: item.source || '',
    })
  }

  async function saveInfraction(event) {
    event.preventDefault()
    if (!isAdmin) return
    try {
      setCatalogLoading(true)
      setError('')
      const payload = {
        ...infractionForm,
        default_amount: infractionForm.default_amount === '' ? null : Number(infractionForm.default_amount),
        points: infractionForm.points === '' ? null : Number(infractionForm.points),
        source: infractionForm.source || null,
      }
      if (infractionForm.id) {
        await finesAPI.updateInfraction(infractionForm.id, payload)
        setFeedback('Enquadramento atualizado.')
      } else {
        await finesAPI.createInfraction(payload)
        setFeedback('Enquadramento cadastrado.')
      }
      setInfractionForm(initialInfractionForm)
      await loadInfractions()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o enquadramento.'))
    } finally {
      setCatalogLoading(false)
    }
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Multas</h2>
          <p className="section-copy">Registre autos de infração, acompanhe vencimentos e status de pagamento, recurso ou deferimento.</p>
        </div>
        <div className="actions-inline">
          {canCreateFine ? <button className="app-button" onClick={openCreate}>Nova multa</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="filter-inline">
          <input className="app-input" placeholder="Buscar por auto, enquadramento, descrição ou local" value={search} onChange={(e) => setSearch(e.target.value)} />
          <SearchableSelect value={organizationFilter} onChange={setOrganizationFilter} options={[{ value: '', label: 'Todas as secretarias' }, ...organizationOptions]} placeholder="Filtrar secretaria" searchPlaceholder="Buscar secretaria" />
          <SearchableSelect value={vehicleFilter} onChange={setVehicleFilter} options={[{ value: '', label: 'Todos os veículos' }, ...vehicles.map(vehicleOption)]} placeholder="Filtrar veículo" searchPlaceholder="Buscar veículo" />
          <select className="app-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>{statusOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead><tr><th>Veículo</th><th>Auto</th><th>Enquadramento</th><th>Condutor</th><th>Infração</th><th>Valor</th><th>Status</th>{canEditFine ? <th>Ações</th> : null}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={canEditFine ? 8 : 7}>Carregando multas...</td></tr> : records.length === 0 ? <tr><td colSpan={canEditFine ? 8 : 7}><div className="empty-state">Nenhuma multa encontrada.</div></td></tr> : records.map((record) => (
                <tr key={record.id}>
                  <td data-label="Veículo"><div className="stack"><strong>{record.vehicle_plate}</strong><span className="muted">{getVehicleOrganizationName(record.vehicle_id)}</span></div></td>
                  <td data-label="Auto">{record.ticket_number}</td>
                  <td data-label="Enquadramento"><div className="stack"><strong>{record.infraction_type ? `${record.infraction_type.code}/${record.infraction_type.desdobramento}` : '-'}</strong><span className="muted">{record.infraction_type?.description || record.description}</span></div></td>
                  <td data-label="Condutor">{record.driver_name || record.imported_driver_name || '-'}</td>
                  <td data-label="Infração">{formatDate(record.infraction_date)}{record.infraction_time ? ` ${record.infraction_time.slice(0, 5)}` : ''}</td>
                  <td data-label="Valor">{formatMoney(record.amount)}</td>
                  <td data-label="Status"><span className="status-badge status-MANUTENCAO">{record.status}</span></td>
                  {canEditFine ? <td data-label="Ações"><button className="mini-button" onClick={() => openEdit(record)}>Editar</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadFines} />

      {isAdmin ? (
        <section className="surface-panel panel-nested" style={{ marginTop: 22 }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Infrações CTB</h3>
              <p className="section-copy">Catálogo usado na seleção de multas. Itens provisórios vieram de importações e podem ser corrigidos.</p>
            </div>
          </div>
          <form className="form-grid" onSubmit={saveInfraction}>
            <div className="form-field"><label>Código</label><input className="app-input" value={infractionForm.code} onChange={(e) => setInfractionForm({ ...infractionForm, code: e.target.value })} required /></div>
            <div className="form-field"><label>Desdobramento</label><input className="app-input" value={infractionForm.desdobramento} onChange={(e) => setInfractionForm({ ...infractionForm, desdobramento: e.target.value })} required /></div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}><label>Descrição</label><textarea className="app-textarea" rows="3" value={infractionForm.description} onChange={(e) => setInfractionForm({ ...infractionForm, description: e.target.value })} required /></div>
            <div className="form-field"><label>Amparo CTB</label><input className="app-input" value={infractionForm.ctb_article} onChange={(e) => setInfractionForm({ ...infractionForm, ctb_article: e.target.value })} /></div>
            <div className="form-field"><label>Gravidade</label><input className="app-input" value={infractionForm.severity} onChange={(e) => setInfractionForm({ ...infractionForm, severity: e.target.value })} /></div>
            <div className="form-field"><label>Valor padrão</label><input type="number" min="0" step="0.01" className="app-input" value={infractionForm.default_amount} onChange={(e) => setInfractionForm({ ...infractionForm, default_amount: e.target.value })} /></div>
            <div className="form-field"><label>Pontos</label><input type="number" min="0" className="app-input" value={infractionForm.points} onChange={(e) => setInfractionForm({ ...infractionForm, points: e.target.value })} /></div>
            <div className="form-field"><label>Infrator</label><input className="app-input" value={infractionForm.offender} onChange={(e) => setInfractionForm({ ...infractionForm, offender: e.target.value })} /></div>
            <div className="form-field"><label>Órgão competente</label><input className="app-input" value={infractionForm.competent_body} onChange={(e) => setInfractionForm({ ...infractionForm, competent_body: e.target.value })} /></div>
            <div className="form-field"><label>Fonte</label><input className="app-input" value={infractionForm.source} onChange={(e) => setInfractionForm({ ...infractionForm, source: e.target.value })} /></div>
            <label className="section-copy" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={infractionForm.is_active} onChange={(e) => setInfractionForm({ ...infractionForm, is_active: e.target.checked })} />Ativo para seleção</label>
            <div className="actions-inline" style={{ gridColumn: '1 / -1' }}>
              <button className="app-button" type="submit" disabled={catalogLoading}>{catalogLoading ? 'Salvando...' : infractionForm.id ? 'Atualizar enquadramento' : 'Cadastrar enquadramento'}</button>
              {infractionForm.id ? <button className="ghost-button" type="button" onClick={() => setInfractionForm(initialInfractionForm)}>Cancelar edição</button> : null}
            </div>
          </form>
          <div className="filter-inline" style={{ margin: '18px 0 12px' }}>
            <input className="app-input" placeholder="Buscar código, artigo ou descrição" value={catalogSearch} onChange={(e) => setCatalogSearch(e.target.value)} />
          </div>
          <div className="table-wrap table-wrap-wide">
            <table className="data-table data-table-wide">
              <thead><tr><th>Código</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>
                {catalogRows.slice(0, 80).map((item) => (
                  <tr key={item.id}>
                    <td data-label="Código"><strong>{item.code}/{item.desdobramento}</strong><br /><span className="muted">{item.ctb_article || '-'}</span></td>
                    <td data-label="Descrição">{item.description}</td>
                    <td data-label="Valor">{item.default_amount ? formatMoney(item.default_amount) : '-'}</td>
                    <td data-label="Status"><span className={`status-badge status-${item.is_active ? 'ATIVO' : 'INATIVO'}`}>{item.is_provisional ? 'Provisório' : item.is_active ? 'Ativo' : 'Inativo'}</span></td>
                    <td data-label="Ações"><button type="button" className="mini-button" onClick={() => startInfractionEdit(item)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Modal open={isModalOpen} title={editingRecord ? 'Editar multa' : 'Nova multa'} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
          <div className="form-field">
            <label>Veículo</label>
            <SearchableSelect value={form.vehicle_id} onChange={handleVehicleChange} options={vehicles.map(vehicleOption)} placeholder="Selecionar veículo" searchPlaceholder="Buscar veículo por placa, RENAVAM, marca ou modelo" />
          </div>
          <div className="form-field">
            <label>Condutor</label>
            <SearchableSelect value={form.driver_id} onChange={(value) => setForm({ ...form, driver_id: value })} options={[{ value: '', label: 'Não informado' }, ...drivers.map(driverOption)]} placeholder="Selecionar condutor" searchPlaceholder="Buscar condutor por nome ou documento" />
          </div>
          <div className="form-field modal-field-span">
            <label>Enquadramento</label>
            <SearchableSelect value={form.infraction_type_id} onChange={handleInfractionChange} options={infractionOptions} placeholder="Selecionar infração CTB/CONTRAN" searchPlaceholder="Buscar código, artigo ou descrição" />
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
          <div className="form-field"><label>Número do auto</label><input className="app-input" value={form.ticket_number} onChange={(e) => setForm({ ...form, ticket_number: e.target.value })} required /></div>
          <div className="form-field"><label>Data infração</label><input type="date" className="app-input" value={form.infraction_date} onChange={(e) => setForm({ ...form, infraction_date: e.target.value })} required /></div>
          <div className="form-field"><label>Hora</label><input type="time" className="app-input" value={form.infraction_time} onChange={(e) => setForm({ ...form, infraction_time: e.target.value })} /></div>
          <div className="form-field"><label>Vencimento</label><input type="date" className="app-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="form-field"><label>Valor</label><input type="number" min="0" step="0.01" className="app-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></div>
          <div className="form-field"><label>Local</label><input className="app-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
          <div className="form-field"><label>Status</label><select className="app-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{statusOptions.filter((o) => o !== 'TODOS').map((o) => <option key={o} value={o}>{o}</option>)}</select></div>
          <div className="form-field"><label>C.I.</label><input className="app-input" value={form.communication_number} onChange={(e) => setForm({ ...form, communication_number: e.target.value })} /></div>
          <div className="form-field"><label>Enviado em</label><input type="date" className="app-input" value={form.sent_date} onChange={(e) => setForm({ ...form, sent_date: e.target.value })} /></div>
          <div className="form-field"><label>Processo</label><input className="app-input" value={form.process_number} onChange={(e) => setForm({ ...form, process_number: e.target.value })} /></div>
          <div className="form-field modal-field-span"><label>Observações</label><textarea className="app-textarea" rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="actions-inline modal-actions" style={{ gridColumn: '1 / -1' }}>
            <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar multa'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
