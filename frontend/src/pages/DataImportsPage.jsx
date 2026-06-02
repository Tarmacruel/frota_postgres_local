import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { dataImportsAPI } from '../api/dataImports'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
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

const vehicleTypeOptions = [
  { value: 'SEDAN', label: 'Sedan' },
  { value: 'HATCH', label: 'Hatch' },
  { value: 'PICAPE', label: 'Picape' },
  { value: 'SUV', label: 'SUV' },
  { value: 'PERUA_SW', label: 'Perua/SW' },
  { value: 'VAN', label: 'Van' },
  { value: 'MICRO_ONIBUS', label: 'Micro-ônibus' },
  { value: 'ONIBUS', label: 'Ônibus' },
  { value: 'CAMINHAO', label: 'Caminhão' },
  { value: 'MOTOCICLETA', label: 'Motocicleta' },
  { value: 'MAQUINA', label: 'Máquina' },
]

const ownershipOptions = [
  { value: 'PROPRIO', label: 'Próprio' },
  { value: 'LOCADO', label: 'Locado' },
  { value: 'CEDIDO', label: 'Cedido' },
]

const vehicleStatusOptions = [
  { value: 'ATIVO', label: 'Ativo' },
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'INATIVO', label: 'Inativo' },
]

const driverCategoryOptions = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'].map((value) => ({ value, label: value }))

const fieldLabels = {
  plate: 'Placa',
  chassis_number: 'Chassi',
  brand: 'Marca',
  model: 'Modelo',
  vehicle_type: 'Tipo de veículo',
  ownership_type: 'Tipo de frota',
  status: 'Status',
  allocation_id: 'Lotação',
  year: 'Ano',
  prefix: 'Prefixo',
  patrimonio_numero_frota: 'Patrimônio/Nº frota',
  renavam: 'Renavam',
  color: 'Cor',
  fuel_type: 'Combustível',
  tank_capacity_liters: 'Capacidade do tanque',
  transmission: 'Transmissão',
  city: 'Cidade',
  state: 'Estado',
  registered_detran: 'Registrado no DETRAN',
  engine_spec: 'Motorização',
  nome_completo: 'Nome completo',
  documento: 'CPF/documento',
  organization_id: 'Secretaria',
  contato: 'Telefone/celular',
  email: 'E-mail',
  cnh_categoria: 'Categoria da CNH',
  cnh_validade: 'Vencimento da CNH',
  ativo: 'Condutor ativo',
  registro: 'Registro',
  matricula: 'Matrícula',
  cargo: 'Cargo',
  cnh_numero: 'Número da CNH',
  rg: 'RG',
  data_nascimento: 'Data de nascimento',
  data_emissao_cnh: 'Data de emissão da CNH',
  ultimo_abastecimento: 'Último abastecimento',
}

const vehicleMappedFields = ['plate', 'chassis_number', 'brand', 'model', 'vehicle_type', 'ownership_type', 'status', 'allocation_id']
const driverMappedFields = ['nome_completo', 'documento', 'organization_id', 'contato', 'email', 'cnh_categoria', 'cnh_validade', 'ativo']
const vehicleOfficialFields = ['year', 'prefix', 'patrimonio_numero_frota', 'renavam', 'color', 'fuel_type', 'tank_capacity_liters', 'transmission', 'city', 'state', 'registered_detran', 'engine_spec']
const driverOfficialFields = ['registro', 'matricula', 'cargo', 'cnh_numero', 'rg', 'data_nascimento', 'data_emissao_cnh', 'ultimo_abastecimento']
const dateFields = new Set(['cnh_validade', 'data_nascimento', 'data_emissao_cnh'])
const datetimeFields = new Set(['ultimo_abastecimento'])
const booleanFields = new Set(['ativo', 'registered_detran'])
const numberFields = new Set(['tank_capacity_liters'])
const requiredFields = {
  VEHICLE: new Set(['plate', 'brand', 'model', 'vehicle_type', 'ownership_type', 'status', 'allocation_id']),
  DRIVER: new Set(['nome_completo', 'documento', 'organization_id', 'cnh_categoria']),
}

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

function formatFieldLabel(key) {
  return fieldLabels[key] || key.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeInputValue(value) {
  if (value === null || value === undefined) return ''
  return value
}

function buildEditDraft(row) {
  return {
    mapped: { ...(row?.mapped_data || {}) },
    official: { ...(row?.official_extra_data || {}) },
    triage: { ...(row?.triage_extra_data || {}) },
    notes: row?.manager_notes || '',
  }
}

function cleanDraftObject(values) {
  return Object.fromEntries(
    Object.entries(values || {}).map(([key, value]) => [key, value === '' ? null : value]),
  )
}

function orderedKeys(values, section, entityType) {
  const currentKeys = Object.keys(values || {})
  const baseOrder = section === 'mapped'
    ? entityType === 'DRIVER' ? driverMappedFields : vehicleMappedFields
    : section === 'official'
      ? entityType === 'DRIVER' ? driverOfficialFields : vehicleOfficialFields
      : []
  return [...new Set([...baseOrder, ...currentKeys])]
}

function dateInputValue(value) {
  if (!value) return ''
  return String(value).slice(0, 10)
}

function datetimeInputValue(value) {
  if (!value) return ''
  return String(value).slice(0, 16)
}

function ensureSelectedOption(options, value, fallbackLabel) {
  if (!value || options.some((option) => String(option.value) === String(value))) return options
  return [{ value, label: fallbackLabel, description: String(value) }, ...options]
}

function staticOptionsForField(key) {
  if (key === 'vehicle_type') return vehicleTypeOptions
  if (key === 'ownership_type') return ownershipOptions
  if (key === 'status') return vehicleStatusOptions
  if (key === 'cnh_categoria') return driverCategoryOptions
  return null
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
  const [editDraft, setEditDraft] = useState({ mapped: {}, official: {}, triage: {}, notes: '' })
  const {
    organizations,
    allocations,
    loading: catalogLoading,
    error: catalogError,
  } = useMasterDataCatalog()

  const summary = selectedBatch?.summary || {}
  const statusCounts = summary.statuses || {}
  const actionCounts = summary.actions || {}

  const organizationOptions = useMemo(() => organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
    description: `${organization.departments?.length || 0} departamento(s)`,
    keywords: organization.name,
  })), [organizations])

  const allocationOptions = useMemo(() => allocations.map((allocation) => ({
    value: allocation.id,
    label: allocation.display_name || allocation.name,
    description: `${allocation.organization_name || ''}${allocation.department_name ? ` / ${allocation.department_name}` : ''}`,
    keywords: `${allocation.display_name || ''} ${allocation.name || ''} ${allocation.organization_name || ''} ${allocation.department_name || ''}`,
  })), [allocations])

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
    setEditDraft(buildEditDraft(row))
  }

  function updateDraftField(section, key, value) {
    setEditDraft((current) => ({
      ...current,
      [section]: {
        ...(current[section] || {}),
        [key]: value,
      },
    }))
  }

  function resetEditDraft() {
    if (editingRow) setEditDraft(buildEditDraft(editingRow))
  }

  async function saveEditRow(event) {
    event.preventDefault()
    if (!editingRow) return

    const mapped_data = cleanDraftObject(editDraft.mapped)
    const official_extra_data = cleanDraftObject(editDraft.official)
    const triage_extra_data = cleanDraftObject(editDraft.triage)

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

  function renderDraftField(section, key, value) {
    const fieldId = `import-${section}-${key.replace(/[^a-z0-9_-]/gi, '-')}`
    const label = formatFieldLabel(key)
    const entityType = selectedBatch?.entity_type || 'VEHICLE'
    const isRequired = requiredFields[entityType]?.has(key)
    const fieldClassName = `form-field data-import-edit-field${isRequired ? ' is-required' : ''}`
    const normalizedValue = normalizeInputValue(value)

    if (key === 'allocation_id') {
      return (
        <div className={fieldClassName} key={`${section}-${key}`}>
          <label>{label}</label>
          <SearchableSelect
            value={normalizedValue}
            onChange={(nextValue) => updateDraftField(section, key, nextValue || null)}
            options={ensureSelectedOption(allocationOptions, normalizedValue, 'Lotação não encontrada')}
            placeholder={catalogLoading ? 'Carregando lotações...' : 'Selecione a lotação'}
            searchPlaceholder="Buscar lotação"
            emptyLabel="Nenhuma lotação encontrada."
            allowClear
            clearLabel="Limpar lotação"
            disabled={catalogLoading}
          />
        </div>
      )
    }

    if (key === 'organization_id') {
      return (
        <div className={fieldClassName} key={`${section}-${key}`}>
          <label>{label}</label>
          <SearchableSelect
            value={normalizedValue}
            onChange={(nextValue) => updateDraftField(section, key, nextValue || null)}
            options={ensureSelectedOption(organizationOptions, normalizedValue, 'Secretaria não encontrada')}
            placeholder={catalogLoading ? 'Carregando secretarias...' : 'Selecione a secretaria'}
            searchPlaceholder="Buscar secretaria"
            emptyLabel="Nenhuma secretaria encontrada."
            allowClear
            clearLabel="Limpar secretaria"
            disabled={catalogLoading}
          />
        </div>
      )
    }

    if (booleanFields.has(key)) {
      const selectedValue = value === true ? 'true' : value === false ? 'false' : ''
      return (
        <div className={fieldClassName} key={`${section}-${key}`}>
          <label htmlFor={fieldId}>{label}</label>
          <select
            id={fieldId}
            className="app-select"
            value={selectedValue}
            onChange={(event) => updateDraftField(section, key, event.target.value === '' ? null : event.target.value === 'true')}
          >
            <option value="">Não informado</option>
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </div>
      )
    }

    const staticOptions = staticOptionsForField(key)
    if (staticOptions) {
      return (
        <div className={fieldClassName} key={`${section}-${key}`}>
          <label htmlFor={fieldId}>{label}</label>
          <select
            id={fieldId}
            className="app-select"
            value={normalizedValue}
            onChange={(event) => updateDraftField(section, key, event.target.value || null)}
          >
            <option value="">Não informado</option>
            {staticOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      )
    }

    if (numberFields.has(key)) {
      return (
        <div className={fieldClassName} key={`${section}-${key}`}>
          <label htmlFor={fieldId}>{label}</label>
          <input
            id={fieldId}
            className="app-input"
            type="number"
            min="0"
            step="0.01"
            value={normalizedValue}
            onChange={(event) => updateDraftField(section, key, event.target.value === '' ? null : Number(event.target.value))}
          />
        </div>
      )
    }

    if (dateFields.has(key)) {
      return (
        <div className={fieldClassName} key={`${section}-${key}`}>
          <label htmlFor={fieldId}>{label}</label>
          <input
            id={fieldId}
            className="app-input"
            type="date"
            value={dateInputValue(normalizedValue)}
            onChange={(event) => updateDraftField(section, key, event.target.value || null)}
          />
        </div>
      )
    }

    if (datetimeFields.has(key)) {
      return (
        <div className={fieldClassName} key={`${section}-${key}`}>
          <label htmlFor={fieldId}>{label}</label>
          <input
            id={fieldId}
            className="app-input"
            type="datetime-local"
            value={datetimeInputValue(normalizedValue)}
            onChange={(event) => updateDraftField(section, key, event.target.value || null)}
          />
        </div>
      )
    }

    const asText = String(normalizedValue)
    const shouldUseTextarea = asText.length > 80 || key.includes('Observa') || key.includes('Abastecimento')
    return (
      <div className={fieldClassName} key={`${section}-${key}`}>
        <label htmlFor={fieldId}>{label}</label>
        {shouldUseTextarea ? (
          <textarea
            id={fieldId}
            className="app-textarea data-import-edit-textarea"
            rows="3"
            value={asText}
            onChange={(event) => updateDraftField(section, key, event.target.value)}
          />
        ) : (
          <input
            id={fieldId}
            className="app-input"
            type="text"
            maxLength={key === 'state' ? 2 : undefined}
            value={asText}
            onChange={(event) => updateDraftField(section, key, key === 'state' ? event.target.value.toUpperCase() : event.target.value)}
          />
        )}
      </div>
    )
  }

  function renderDraftSection(title, section, emptyLabel) {
    const entityType = selectedBatch?.entity_type || 'VEHICLE'
    const keys = section === 'triage'
      ? Object.keys(editDraft[section] || {})
      : orderedKeys(editDraft[section], section, entityType)

    return (
      <section className="data-import-edit-section">
        <div className="data-import-edit-section-header">
          <strong>{title}</strong>
          <span>{keys.length} campo(s)</span>
        </div>
        {keys.length === 0 ? (
          <div className="empty-state">{emptyLabel}</div>
        ) : (
          <div className="data-import-edit-grid">
            {keys.map((key) => renderDraftField(section, key, editDraft[section]?.[key]))}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="page-shell data-import-page">
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

      <section className="toolbar-card data-import-panel">
        <form className="data-import-upload-form" onSubmit={handleUpload}>
          <input
            type="file"
            className="app-input"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
          />
          <div className="data-import-upload-actions">
            <button className="app-button" type="submit" disabled={uploading}>
              {uploading ? 'Analisando...' : 'Enviar para triagem'}
            </button>
            <button type="button" className="secondary-button" onClick={() => downloadUrl(dataImportsAPI.templateUrl('VEHICLE'))}>Modelo veículos</button>
            <button type="button" className="secondary-button" onClick={() => downloadUrl(dataImportsAPI.templateUrl('DRIVER'))}>Modelo condutores</button>
          </div>
        </form>
      </section>

      <div className="data-import-stack">
        <section className="toolbar-card data-import-panel">
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
                    <td data-label="Arquivo"><strong>{batch.source_filename}</strong><br /><span className="muted">{formatDate(batch.created_at)}</span></td>
                    <td data-label="Tipo">{entityLabel(batch.entity_type)}</td>
                    <td data-label="Status"><span className={`status-badge status-${batch.status === 'APPLIED' ? 'ATIVO' : 'MANUTENCAO'}`}>{statusLabel(batch.status)}</span></td>
                    <td data-label="Linhas">{batch.summary?.total_rows || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="toolbar-card data-import-panel">
          <div className="data-import-tabs">
            <div className="status-pills">
              <button type="button" className={`status-pill ${activeTab === 'review' ? 'active' : ''}`} onClick={() => setActiveTab('review')}>Revisão</button>
              <button type="button" className={`status-pill ${activeTab === 'fields' ? 'active' : ''}`} onClick={() => setActiveTab('fields')}>Campos extras</button>
              <button type="button" className={`status-pill ${activeTab === 'exports' ? 'active' : ''}`} onClick={() => setActiveTab('exports')}>Exportar</button>
            </div>
          </div>

          {!selectedBatch ? (
            <div className="empty-state">Selecione ou envie um lote para iniciar a revisão.</div>
          ) : activeTab === 'review' ? (
            <>
              <div className="data-import-review-toolbar">
                <label className="filter-inline">
                  <span>Status</span>
                  <select className="app-select" value={rowStatus} onChange={(event) => setRowStatus(event.target.value)}>
                    {rowStatusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="data-import-review-actions">
                  <button type="button" className="app-button" onClick={applyBatch} disabled={applying}>
                    {applying ? 'Aplicando...' : 'Aplicar aprovadas'}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => downloadUrl(dataImportsAPI.exportUrl(selectedBatch.id))}>Baixar CSV do lote</button>
                </div>
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
                        <td data-label="Linha">{row.row_number}</td>
                        <td data-label="Ação">{actionLabel(row.suggested_action)}<br /><span className="muted">{row.matched_by || 'sem match'}</span></td>
                        <td data-label="Status"><span className={`status-badge status-${row.status === 'APPROVED' || row.status === 'APPLIED' ? 'ATIVO' : row.status === 'ERROR' || row.status === 'REJECTED' ? 'INATIVO' : 'MANUTENCAO'}`}>{statusLabel(row.status)}</span></td>
                        <td data-label="Dados oficiais">
                          <div className="stack data-import-cell-stack">
                            {Object.entries(row.mapped_data || {}).slice(0, 6).map(([key, value]) => <span key={key}><strong>{key}:</strong> {String(value)}</span>)}
                          </div>
                        </td>
                        <td data-label="Alertas">
                          <div className="stack data-import-cell-stack">
                            {(row.conflicts || []).map((item) => <span key={item} className="muted">{item}</span>)}
                            {(row.validation_errors || []).map((item) => <span key={item} className="muted">{item}</span>)}
                          </div>
                        </td>
                        <td data-label="Ações">
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
            <div className="data-import-detail-stack">
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
            <div className="data-import-detail-stack">
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
        <form className="data-import-edit-form" onSubmit={saveEditRow}>
          {catalogError ? <div className="alert alert-error">{catalogError}</div> : null}
          {editingRow?.conflicts?.length || editingRow?.validation_errors?.length ? (
            <section className="data-import-edit-section">
              <div className="data-import-edit-section-header">
                <strong>Alertas da linha</strong>
                <span>{(editingRow.conflicts?.length || 0) + (editingRow.validation_errors?.length || 0)} ocorrência(s)</span>
              </div>
              <div className="stack">
                {(editingRow.conflicts || []).map((item) => <span key={item} className="muted">{item}</span>)}
                {(editingRow.validation_errors || []).map((item) => <span key={item} className="muted">{item}</span>)}
              </div>
            </section>
          ) : null}

          {renderDraftSection('Dados oficiais importáveis', 'mapped', 'Nenhum dado importável nesta linha.')}
          {renderDraftSection('Campos oficiais adicionais', 'official', 'Nenhum campo oficial adicional nesta linha.')}
          {renderDraftSection('Campos preservados na triagem', 'triage', 'Nenhum campo extra de triagem nesta linha.')}

          <div className="form-field">
            <label htmlFor="manager-notes">Observação do gestor</label>
            <textarea id="manager-notes" className="app-textarea" rows="3" value={editDraft.notes} onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })} />
          </div>
          <div className="actions-inline modal-actions">
            <button type="submit" className="app-button">Salvar ajustes</button>
            <button type="button" className="secondary-button" onClick={resetEditDraft}>Restaurar dados da linha</button>
            <button type="button" className="ghost-button" onClick={() => setEditingRow(null)}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
