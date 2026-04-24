import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AccordionSection from '../components/AccordionSection'
import BadgeOwnership from '../components/BadgeOwnership'
import DriverBadge from '../components/DriverBadge'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'

const initialForm = {
  plate: '',
  chassis_number: '',
  brand: '',
  model: '',
  vehicle_type: 'SEDAN',
  ownership_type: 'PROPRIO',
  status: 'ATIVO',
  organization_id: '',
  department_id: '',
  allocation_id: '',
  edit_reason: '',
}

const statusOptions = [
  { value: 'TODOS', label: 'Todos' },
  { value: 'ATIVO', label: 'Ativos' },
  { value: 'MANUTENCAO', label: 'Manutencao' },
  { value: 'INATIVO', label: 'Inativos' },
]

const ownershipOptions = [
  { value: 'TODOS', label: 'Todos os tipos' },
  { value: 'PROPRIO', label: 'Proprio' },
  { value: 'LOCADO', label: 'Locado' },
  { value: 'CEDIDO', label: 'Cedido' },
]

const vehicleTypeOptions = [
  { value: 'SEDAN', label: 'Sedan' },
  { value: 'HATCH', label: 'Hatch' },
  { value: 'PICAPE', label: 'Picape' },
  { value: 'SUV', label: 'SUV' },
  { value: 'PERUA_SW', label: 'Perua/SW' },
  { value: 'VAN', label: 'Van' },
  { value: 'MICRO_ONIBUS', label: 'Micro-onibus' },
  { value: 'ONIBUS', label: 'Onibus' },
  { value: 'CAMINHAO', label: 'Caminhao' },
  { value: 'MOTOCICLETA', label: 'Motocicleta' },
  { value: 'MAQUINA', label: 'Maquina' },
]

function formatDate(value) {
  if (!value) return 'Atual'
  const date = new Date(value)
  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `${dateLabel} as ${timeLabel}`
}

function formatPlate(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized.length === 7) {
    return `${normalized.slice(0, 3)}-${normalized.slice(3)}`
  }
  return value || '-'
}

function formatChassis(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!normalized) return 'Nao informado'
  const segments = [normalized.slice(0, 4), normalized.slice(4, 8), normalized.slice(8, 12), normalized.slice(12)]
  return segments.filter(Boolean).join('-')
}

function getStatusLabel(value) {
  if (value === 'MANUTENCAO') return 'Em manutencao'
  if (value === 'INATIVO') return 'Inativo'
  return 'Ativo'
}

function getOwnershipLabel(value) {
  if (value === 'LOCADO') return 'Locado'
  if (value === 'CEDIDO') return 'Cedido'
  return 'Proprio'
}

function getVehicleTypeLabel(value) {
  return vehicleTypeOptions.find((option) => option.value === value)?.label || value || 'Nao informado'
}

function getStatusBadgeColors(value) {
  if (value === 'Ativo') {
    return { fillColor: [234, 247, 239], textColor: [29, 122, 70] }
  }
  if (value === 'Em manutencao') {
    return { fillColor: [255, 245, 225], textColor: [165, 102, 0] }
  }
  return { fillColor: [253, 236, 235], textColor: [180, 35, 24] }
}

function getOwnershipBadgeColors(value) {
  if (value === 'Locado') {
    return { fillColor: [255, 245, 225], textColor: [165, 102, 0] }
  }
  if (value === 'Cedido') {
    return { fillColor: [232, 243, 255], textColor: [36, 82, 232] }
  }
  return { fillColor: [234, 247, 239], textColor: [29, 122, 70] }
}

function buildVehicleLocationLabel(vehicle) {
  return vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao registrada'
}

function buildVehicleOption(vehicle) {
  const locationLabel = buildVehicleLocationLabel(vehicle)
  return {
    value: vehicle.id,
    label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`,
    description: `${getOwnershipLabel(vehicle.ownership_type)} | ${locationLabel}`,
    keywords: [vehicle.plate, vehicle.brand, vehicle.model, vehicle.chassis_number, locationLabel, vehicle.current_driver_name]
      .filter(Boolean)
      .join(' '),
  }
}

function buildFilterSummary(statusFilter, ownershipFilter, locationFilter, search, locationOptions) {
  const filters = []
  const statusLabel = statusOptions.find((option) => option.value === statusFilter)?.label
  if (statusLabel) filters.push({ label: 'Status', value: statusLabel })

  if (ownershipFilter !== 'TODOS') {
    filters.push({ label: 'Tipo', value: getOwnershipLabel(ownershipFilter) })
  }

  if (locationFilter !== 'TODOS') {
    const locationLabel = locationOptions.find((option) => option.value === locationFilter)?.label || locationFilter
    filters.push({ label: 'Lotacao', value: locationLabel })
  }

  if (search.trim()) {
    filters.push({ label: 'Busca', value: search.trim() })
  }

  return filters
}

const vehicleHistoryFieldLabels = {
  plate: 'Placa',
  chassis_number: 'Chassi',
  brand: 'Marca',
  model: 'Modelo',
  vehicle_type: 'Tipo de veiculo',
  ownership_type: 'Propriedade',
  status: 'Status',
  location: 'Lotacao',
}

function getVehicleHistoryTypeLabel(value) {
  if (value === 'MOVEMENT') return 'Movimentacao'
  if (value === 'CREATE') return 'Cadastro'
  return 'Edicao'
}

function formatVehicleHistoryFieldValue(field, value) {
  if (value === null || value === undefined || value === '') return 'Nao informado'
  if (field === 'status') return getStatusLabel(value)
  if (field === 'ownership_type') return getOwnershipLabel(value)
  if (field === 'vehicle_type') return getVehicleTypeLabel(value)
  return String(value)
}

function buildVehicleHistoryChangeLines(item) {
  if (item.event_type === 'MOVEMENT') {
    return [
      `Lotacao: ${item.display_name || item.department || 'Nao informada'}`,
      `Orgao: ${item.organization_name || 'Legado'}`,
      `Departamento: ${item.department_name || item.department || 'Sem departamento'}`,
      `Periodo: ${formatDate(item.start_date)} ate ${item.end_date ? formatDate(item.end_date) : 'Atual'}`,
    ]
  }

  const after = item.after || {}
  if (item.event_type === 'CREATE') {
    return [
      `Status inicial: ${formatVehicleHistoryFieldValue('status', after.status)}`,
      `Tipo: ${formatVehicleHistoryFieldValue('vehicle_type', after.vehicle_type)}`,
      `Propriedade: ${formatVehicleHistoryFieldValue('ownership_type', after.ownership_type)}`,
      `Lotacao inicial: ${formatVehicleHistoryFieldValue('location', after.location)}`,
    ].filter((line) => !line.endsWith('Nao informado'))
  }

  const before = item.before || {}
  const changedKeys = Object.keys(vehicleHistoryFieldLabels).filter((key) => (before[key] ?? null) !== (after[key] ?? null))

  if (changedKeys.length === 0) {
    return ['Edicao registrada sem diferencas adicionais nos campos auditados.']
  }

  return changedKeys.map((key) => `${vehicleHistoryFieldLabels[key]}: ${formatVehicleHistoryFieldValue(key, before[key])} -> ${formatVehicleHistoryFieldValue(key, after[key])}`)
}

function buildVehicleHistorySummary(item) {
  return buildVehicleHistoryChangeLines(item).join(' | ')
}

export default function VehiclesPage() {
  const { user, canWrite, canDelete, isAdmin } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(initialForm)
  const [selectedHistory, setSelectedHistory] = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [locationFilter, setLocationFilter] = useState('TODOS')
  const [ownershipFilter, setOwnershipFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const {
    organizations,
    allocations,
    loading: catalogLoading,
    error: catalogError,
    getDepartmentsByOrganization,
    getAllocationsByDepartment,
  } = useMasterDataCatalog()

  const statusFilter = searchParams.get('status') || 'TODOS'
  const focusVehicleId = searchParams.get('focus')

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
    description: `${organization.departments.length} departamento(s)`,
  }))

  const departmentOptions = (form.organization_id ? getDepartmentsByOrganization(form.organization_id) : []).map((department) => ({
    value: department.id,
    label: department.name,
    description: department.organization_name,
  }))

  const allocationOptions = (form.department_id ? getAllocationsByDepartment(form.department_id) : []).map((allocation) => ({
    value: allocation.id,
    label: allocation.name,
    description: allocation.display_name,
    keywords: allocation.display_name,
  }))

  const locationOptions = useMemo(() => {
    const unique = new Map()

    allocations.forEach((allocation) => {
      unique.set(allocation.display_name, {
        value: allocation.display_name,
        label: allocation.display_name,
      })
    })

    vehicles
      .map((vehicle) => buildVehicleLocationLabel(vehicle))
      .filter(Boolean)
      .forEach((label) => {
        if (!unique.has(label)) {
          unique.set(label, { value: label, label })
        }
      })

    return [{ value: 'TODOS', label: 'Todas as lotacoes' }, ...Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label))]
  }, [allocations, vehicles])

  const exportColumns = [
    { header: 'Placa', value: (vehicle) => formatPlate(vehicle.plate), align: 'center', width: 66 },
    { header: 'Chassi', value: (vehicle) => formatChassis(vehicle.chassis_number), align: 'center', width: 118 },
    { header: 'Marca / Modelo', value: (vehicle) => `${vehicle.brand}\n${vehicle.model}` },
    { header: 'Tipo veiculo', value: (vehicle) => getVehicleTypeLabel(vehicle.vehicle_type), align: 'center', width: 82 },
    { header: 'Tipo propriedade', value: (vehicle) => getOwnershipLabel(vehicle.ownership_type), align: 'center', width: 74, badgeColors: getOwnershipBadgeColors },
    { header: 'Status', value: (vehicle) => getStatusLabel(vehicle.status), align: 'center', width: 88, badgeColors: getStatusBadgeColors },
    { header: 'Lotacao atual', value: (vehicle) => buildVehicleLocationLabel(vehicle) },
    { header: 'Condutor atual', value: (vehicle) => vehicle.current_driver_name || '—' },
    { header: 'Atualizado em', value: (vehicle) => formatDate(vehicle.updated_at), align: 'center', width: 92 },
  ]

  async function loadVehicles() {
    try {
      setLoading(true)
      setError('')
      const params = statusFilter !== 'TODOS' ? { status: statusFilter } : undefined
      const { data } = await api.get('/vehicles', { params })
      setVehicles(data)

      if (selectedVehicle?.id) {
        const updatedSelection = data.find((vehicle) => vehicle.id === selectedVehicle.id) || null
        setSelectedVehicle(updatedSelection)
        if (!updatedSelection) {
          setSelectedHistory([])
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os veiculos.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles()
  }, [statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, locationFilter, ownershipFilter, statusFilter, selectedVehicle?.id, vehicles.length])

  useEffect(() => {
    if (!focusVehicleId) {
      if (selectedVehicle) {
        clearHistoryFocus(false)
      }
      return
    }

    if (selectedVehicle?.id === focusVehicleId) return

    const hasVehicleLoaded = vehicles.some((vehicle) => vehicle.id === focusVehicleId)
    if (!hasVehicleLoaded) return

    loadHistory(focusVehicleId, { toggle: false, syncUrl: false })
  }, [focusVehicleId, vehicles])

  const baseFilteredVehicles = vehicles.filter((vehicle) => {
    const term = search.trim().toLowerCase()
    const matchesSearch =
      !term ||
      [
        vehicle.plate,
        vehicle.chassis_number,
        vehicle.brand,
        vehicle.model,
        buildVehicleLocationLabel(vehicle),
        vehicle.current_driver_name,
        getOwnershipLabel(vehicle.ownership_type),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))

    const matchesLocation = locationFilter === 'TODOS' || buildVehicleLocationLabel(vehicle) === locationFilter
    const matchesOwnership = ownershipFilter === 'TODOS' || vehicle.ownership_type === ownershipFilter

    return matchesSearch && matchesLocation && matchesOwnership
  })

  const filteredVehicles = selectedVehicle
    ? vehicles.filter((vehicle) => vehicle.id === selectedVehicle.id)
    : baseFilteredVehicles
  const totalPages = Math.max(1, Math.ceil(filteredVehicles.length / 10))
  const paginatedVehicles = selectedVehicle ? filteredVehicles : filteredVehicles.slice((currentPage - 1) * 10, currentPage * 10)

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

  async function loadHistory(id, options = {}) {
    const { toggle = true, syncUrl = true } = options

    if (toggle && selectedVehicle?.id === id) {
      clearHistoryFocus(syncUrl)
      return
    }

    try {
      setError('')
      const { data } = await api.get(`/vehicles/${id}/historico`)
      const vehicle = vehicles.find((item) => item.id === id) || null
      setSelectedVehicle(vehicle)
      setSelectedHistory(data)
      if (syncUrl) {
        patchSearchParams({ focus: id })
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o historico.'))
    }
  }

  function clearHistoryFocus(syncUrl = true) {
    setSelectedVehicle(null)
    setSelectedHistory([])
    if (syncUrl) {
      patchSearchParams({ focus: null })
    }
  }

  function handleStatusChange(nextStatus) {
    if (nextStatus === 'TODOS') {
      const next = new URLSearchParams(searchParams)
      next.delete('status')
      setSearchParams(next)
      return
    }
    patchSearchParams({ status: nextStatus })
  }

  function openNewVehicleModal() {
    setEditingId(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  function editVehicle(vehicle) {
    setEditingId(vehicle.id)
    setFeedback('')
    setError('')
    setForm({
      plate: vehicle.plate,
      chassis_number: vehicle.chassis_number || '',
      brand: vehicle.brand,
      model: vehicle.model,
      vehicle_type: vehicle.vehicle_type || 'SEDAN',
      ownership_type: vehicle.ownership_type,
      status: vehicle.status,
      organization_id: vehicle.current_location?.organization_id || '',
      department_id: vehicle.current_location?.department_id || '',
      allocation_id: vehicle.current_location?.allocation_id || '',
      edit_reason: '',
    })
    setIsModalOpen(true)
  }

  function closeVehicleModal() {
    setEditingId(null)
    setForm(initialForm)
    setIsModalOpen(false)
  }

  function clearFilters() {
    setSearch('')
    setLocationFilter('TODOS')
    setOwnershipFilter('TODOS')
    clearHistoryFocus(false)
    const next = new URLSearchParams(searchParams)
    next.delete('status')
    next.delete('focus')
    setSearchParams(next)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const isEditingLegacyWithoutLocation = Boolean(editingId) && !form.allocation_id && !vehicles.find((vehicle) => vehicle.id === editingId)?.current_location
    const touchedLocationSelection = Boolean(form.organization_id || form.department_id || form.allocation_id)

    if (!editingId && !form.allocation_id) {
      setError('Selecione a lotacao completa para cadastrar o veiculo.')
      return
    }

    if (editingId && touchedLocationSelection && !form.allocation_id) {
      setError('Conclua a selecao ate a lotacao para salvar a alteracao.')
      return
    }

    if (editingId && !form.edit_reason.trim()) {
      setError('Informe a justificativa obrigatoria desta edicao.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      setFeedback('')

      const payload = {
        plate: form.plate,
        chassis_number: form.chassis_number || null,
        brand: form.brand,
        model: form.model,
        vehicle_type: form.vehicle_type,
        ownership_type: form.ownership_type,
        status: form.status,
      }

      if (form.allocation_id) {
        payload.allocation_id = form.allocation_id
      } else if (!editingId) {
        payload.allocation_id = form.allocation_id
      } else if (!isEditingLegacyWithoutLocation) {
        // Mantem a lotacao atual sem forcar atualizacao.
      }

      if (editingId) {
        payload.edit_reason = form.edit_reason
        await api.put(`/vehicles/${editingId}`, payload)
        setFeedback('Veiculo atualizado com justificativa e historico.')
      } else {
        await api.post('/vehicles', payload)
        setFeedback('Veiculo cadastrado com sucesso.')
      }

      closeVehicleModal()
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o veiculo.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Confirma a exclusao?')) return

    try {
      setError('')
      setFeedback('')
      await api.delete(`/vehicles/${id}`)
      if (editingId === id) closeVehicleModal()
      if (selectedVehicle?.id === id) {
        clearHistoryFocus(false)
      }
      setFeedback('Veiculo removido com sucesso.')
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel excluir o veiculo.'))
    }
  }

  async function handlePreviewPdf() {
    if (filteredVehicles.length === 0) {
      setFeedback('Nao ha veiculos filtrados para previsualizar em PDF.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Veiculos',
        fileName: 'frota-pmtf-veiculos',
        subtitle: 'Relatorio dos veiculos filtrados no painel operacional.',
        columns: exportColumns,
        rows: filteredVehicles,
        filters: buildFilterSummary(statusFilter, ownershipFilter, locationFilter, search, locationOptions),
        summaryMetrics: vehicleReportMetrics,
        summaryChartItems: [
          { label: 'Ativos', value: visibleActiveVehicles, tone: 'green' },
          { label: 'Manutencao', value: visibleMaintenanceVehicles, tone: 'amber' },
          { label: 'Inativos', value: visibleInactiveVehicles, tone: 'red' },
          { label: 'Sem condutor', value: visibleWithoutDriver, tone: 'slate' },
        ],
        referenceLabel: latestUpdate ? `Referencia dos dados: atualizado ate ${formatDate(latestUpdate)}` : 'Referencia dos dados: painel operacional atual',
        responsibleSector: 'Secretaria Municipal de Administracao | Departamento de Gestao da Frota',
        generatedBy: user?.name || user?.email || 'Usuario autenticado',
      })
      setFeedback('Pre-visualizacao do PDF aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar a pre-visualizacao em PDF.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredVehicles.length === 0) {
      setFeedback('Nao ha veiculos filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-veiculos',
        sheetName: 'Veiculos',
        columns: exportColumns,
        rows: filteredVehicles,
        filters: buildFilterSummary(statusFilter, ownershipFilter, locationFilter, search, locationOptions),
      })
      setFeedback('Exportacao em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os veiculos em XLSX.'))
    }
  }

  async function handlePreviewHistoryPdf() {
    if (!selectedVehicle || selectedHistory.length === 0) {
      setFeedback('Selecione um veiculo com historico carregado para previsualizar o PDF.')
      return
    }

    const historyColumns = [
      { header: 'Veiculo', value: () => selectedVehicle.plate },
      { header: 'Data', value: (item) => formatDate(item.occurred_at) },
      { header: 'Evento', value: (item) => getVehicleHistoryTypeLabel(item.event_type) },
      { header: 'Resumo', value: (item) => buildVehicleHistorySummary(item) },
      { header: 'Justificativa', value: (item) => item.justification || 'Sem justificativa registrada' },
      { header: 'Ator', value: (item) => item.actor_name || 'Sistema' },
    ]

    const historyEditCount = selectedHistory.filter((item) => item.event_type === 'EDIT').length
    const historyMovementCount = selectedHistory.filter((item) => item.event_type === 'MOVEMENT').length

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: `Frota PMTF - Historico ${selectedVehicle.plate}`,
        fileName: `frota-pmtf-historico-${selectedVehicle.plate.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        subtitle: `Historico de edicoes e movimentacoes do veiculo ${selectedVehicle.plate} | ${selectedVehicle.brand} ${selectedVehicle.model}.`,
        columns: historyColumns,
        rows: selectedHistory,
        summaryMetrics: [
          { label: 'Veiculo', value: selectedVehicle.plate, tone: 'blue' },
          { label: 'Eventos', value: selectedHistory.length, tone: 'blue' },
          { label: 'Edicoes', value: historyEditCount, tone: 'amber' },
          { label: 'Movimentacoes', value: historyMovementCount, tone: 'blue' },
          { label: 'Tipo', value: getOwnershipLabel(selectedVehicle.ownership_type), tone: 'blue' },
          { label: 'Status', value: getStatusLabel(selectedVehicle.status), tone: selectedVehicle.status === 'ATIVO' ? 'green' : selectedVehicle.status === 'MANUTENCAO' ? 'amber' : 'red' },
        ],
        filters: [
          { label: 'Veiculo', value: selectedVehicle.plate },
          { label: 'Tipo', value: getOwnershipLabel(selectedVehicle.ownership_type) },
          { label: 'Status', value: getStatusLabel(selectedVehicle.status) },
        ],
        referenceLabel: selectedVehicle.updated_at ? `Referencia dos dados: atualizado ate ${formatDate(selectedVehicle.updated_at)}` : 'Historico consolidado da frota municipal',
        responsibleSector: 'Secretaria Municipal de Administracao | Departamento de Gestao da Frota',
        generatedBy: user?.name || user?.email || 'Usuario autenticado',
      })
      setFeedback(`Pre-visualizacao do historico de ${selectedVehicle.plate} aberta em nova guia.`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o PDF do historico do veiculo.'))
    }
  }

  const visibleOwnVehicles = filteredVehicles.filter((vehicle) => vehicle.ownership_type === 'PROPRIO').length
  const visibleRentedVehicles = filteredVehicles.filter((vehicle) => vehicle.ownership_type === 'LOCADO').length
  const visibleAssignedVehicles = filteredVehicles.filter((vehicle) => vehicle.ownership_type === 'CEDIDO').length
  const visibleActiveVehicles = filteredVehicles.filter((vehicle) => vehicle.status === 'ATIVO').length
  const visibleMaintenanceVehicles = filteredVehicles.filter((vehicle) => vehicle.status === 'MANUTENCAO').length
  const visibleInactiveVehicles = filteredVehicles.filter((vehicle) => vehicle.status === 'INATIVO').length
  const visibleWithoutDriver = filteredVehicles.filter((vehicle) => !vehicle.current_driver_name).length
  const latestUpdate = filteredVehicles
    .map((vehicle) => vehicle.updated_at)
    .filter(Boolean)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0]
  const vehicleReportMetrics = [
    { label: 'Total de veiculos', value: filteredVehicles.length, tone: 'blue' },
    { label: 'Ativos', value: visibleActiveVehicles, tone: 'green' },
    { label: 'Em manutencao', value: visibleMaintenanceVehicles, tone: 'amber' },
    { label: 'Inativos', value: visibleInactiveVehicles, tone: 'red' },
    { label: 'Sem condutor', value: visibleWithoutDriver, tone: 'slate' },
    { label: 'Proprios', value: visibleOwnVehicles, tone: 'green' },
    { label: 'Locados', value: visibleRentedVehicles, tone: 'amber' },
    { label: 'Cedidos', value: visibleAssignedVehicles, tone: 'blue' },
  ]

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Operacao de veiculos</h2>
          <p className="section-copy">Gerencie placa, chassi, tipo do veiculo e lotacao estruturada sem sair da consulta principal.</p>
        </div>
        <div className="actions-inline">
          {canWrite ? <button className="app-button" type="button" onClick={openNewVehicleModal}>Novo veiculo</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Previsualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-card">
        <div className="toolbar-row">
          <div className="status-pills">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`status-pill${statusFilter === option.value ? ' active' : ''}`}
                onClick={() => handleStatusChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="filter-inline">
            <input
              className="app-input"
              placeholder="Buscar por placa, chassi, marca, modelo, lotacao ou condutor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <SearchableSelect
              value={locationFilter}
              onChange={setLocationFilter}
              options={locationOptions}
              placeholder="Filtrar lotacao"
              searchPlaceholder="Buscar lotacao"
            />
            <select className="app-select" value={ownershipFilter} onChange={(event) => setOwnershipFilter(event.target.value)}>
              {ownershipOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button className="ghost-button" type="button" onClick={clearFilters}>Limpar filtros</button>
          </div>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{filteredVehicles.length}</strong>
          <span>veiculos exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{visibleOwnVehicles}</strong>
          <span>proprios visiveis</span>
        </div>
        <div className="metric-inline">
          <strong>{visibleRentedVehicles}</strong>
          <span>locados visiveis</span>
        </div>
        <div className="metric-inline">
          <strong>{visibleAssignedVehicles}</strong>
          <span>cedidos visiveis</span>
        </div>
      </div>

      {selectedVehicle ? (
        <div className="table-focus-banner">
          <div>
            <strong>Mostrando apenas {selectedVehicle.plate}</strong>
            <span>Clique novamente em Historico no mesmo veiculo para voltar a lista completa.</span>
          </div>
          <button className="ghost-button" type="button" onClick={clearHistoryFocus}>Reexibir todos</button>
        </div>
      ) : null}

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {catalogError ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{catalogError}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Placa</th>
                <th>Chassi</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Tipo veiculo</th>
                <th>Propriedade</th>
                <th>Status</th>
                <th>Lotacao atual</th>
                <th>Condutor atual</th>
                <th>Atualizado em</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" className="muted">Carregando veiculos...</td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="11">
                    <div className="empty-state">
                      Nenhum veiculo encontrado para os filtros aplicados. Ajuste a busca, a lotacao ou o tipo para revisar a base completa.
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className={selectedVehicle?.id === vehicle.id ? 'is-focused-row' : ''}>
                    <td data-label="Placa"><strong>{vehicle.plate}</strong></td>
                    <td data-label="Chassi">{vehicle.chassis_number || 'Nao informado'}</td>
                    <td data-label="Marca">{vehicle.brand}</td>
                    <td data-label="Modelo">{vehicle.model}</td>
                    <td data-label="Tipo veiculo">{getVehicleTypeLabel(vehicle.vehicle_type)}</td>
                    <td data-label="Propriedade"><BadgeOwnership value={vehicle.ownership_type} /></td>
                    <td data-label="Status"><span className={`status-badge status-${vehicle.status}`}>{vehicle.status}</span></td>
                    <td data-label="Lotacao atual">{buildVehicleLocationLabel(vehicle)}</td>
                    <td data-label="Condutor atual"><DriverBadge name={vehicle.current_driver_name} /></td>
                    <td data-label="Atualizado em">{formatDate(vehicle.updated_at)}</td>
                    <td data-label="Acoes">
                      <div className="actions-inline">
                        <button type="button" className="mini-button" onClick={() => loadHistory(vehicle.id)}>
                          {selectedVehicle?.id === vehicle.id ? 'Fechar historico' : 'Historico'}
                        </button>
                        {selectedVehicle?.id === vehicle.id ? <span className="focus-inline">em foco</span> : null}
                        {canWrite ? <button type="button" className="mini-button" onClick={() => editVehicle(vehicle)}>Editar</button> : null}
                        {canDelete ? <button type="button" className="mini-button danger" onClick={() => handleDelete(vehicle.id)}>Excluir</button> : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {!selectedVehicle ? <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} /> : null}

      <section className="surface-panel history-panel">
        <div className="panel-heading">
          <div>
            <h3 className="section-title">Historico do veiculo</h3>
            <p className="section-copy">
              {selectedVehicle ? `Linha do tempo de ${selectedVehicle.plate} com edicoes cadastrais e movimentacoes de lotacao.` : 'Selecione um veiculo na tabela para visualizar o historico consolidado de edicoes e movimentacoes.'}
            </p>
            {selectedVehicle ? (
              <p className="section-copy" style={{ marginTop: 10 }}>
                Chassi: {selectedVehicle.chassis_number || 'Nao informado'} | Condutor atual: {selectedVehicle.current_driver_name || 'Sem condutor ativo'}
              </p>
            ) : null}
          </div>
          {selectedVehicle ? (
            <div className="actions-inline">
              {selectedHistory.length > 0 ? (
                <button className="secondary-button" type="button" onClick={handlePreviewHistoryPdf}>
                  Previsualizar PDF
                </button>
              ) : null}
              {isAdmin ? (
                <div className="audit-card">
                  <strong>Auditoria visivel para admin</strong>
                  <span>Criado em {formatDate(selectedVehicle.created_at)}</span>
                  <span>Atualizado em {formatDate(selectedVehicle.updated_at)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {selectedHistory.length > 0 ? (
          <ul className="history-list history-grid">
            {selectedHistory.map((item) => (
              <li className="history-item" key={`${item.event_type}-${item.id}`}>
                <div className="history-item-topline">
                  <span className={`status-badge history-event-${item.event_type}`}>{getVehicleHistoryTypeLabel(item.event_type)}</span>
                  <span className="muted">{formatDate(item.occurred_at)}</span>
                </div>
                <strong>{item.title}</strong>
                {item.actor_name ? <div className="muted">Registrado por: {item.actor_name}</div> : null}
                <div className="history-item-lines">
                  {buildVehicleHistoryChangeLines(item).map((line) => (
                    <div className="muted" key={`${item.id}-${line}`}>{line}</div>
                  ))}
                </div>
                <div className="history-item-justification">
                  <span>Justificativa</span>
                  <strong>{item.justification || 'Sem justificativa registrada'}</strong>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state">Ainda nao ha historico carregado para exibicao neste painel.</div>
        )}
      </section>

      <Modal
        open={isModalOpen}
        title={editingId ? 'Editar veiculo' : 'Novo veiculo'}
        description={editingId ? 'Toda alteracao exige uma nova justificativa. Ela sera registrada no historico de edicoes e movimentacoes do veiculo.' : 'Preencha os dados do veiculo e vincule a lotacao por orgao, departamento e lotacao cadastrados.'}
        onClose={closeVehicleModal}
      >
        <form onSubmit={handleSubmit} className="stack">
          <AccordionSection title="Dados basicos" subtitle="Identificacao e classificacao" open>
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label htmlFor="plate">Placa</label>
                <input id="plate" className="app-input" placeholder="ABC-1D23" value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="chassis_number">Numero do chassi</label>
                <input id="chassis_number" className="app-input" placeholder="17 caracteres ou identificador interno" value={form.chassis_number} onChange={(event) => setForm({ ...form, chassis_number: event.target.value.toUpperCase() })} />
              </div>
              <div className="form-field">
                <label htmlFor="brand">Marca</label>
                <input id="brand" className="app-input" placeholder="Ex.: Ford" value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="model">Modelo</label>
                <input id="model" className="app-input" placeholder="Ex.: Ranger" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="vehicle_type">Categoria do veiculo</label>
                <select id="vehicle_type" className="app-select" value={form.vehicle_type} onChange={(event) => setForm({ ...form, vehicle_type: event.target.value })}>
                  {vehicleTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="ownership_type">Tipo de propriedade</label>
                <select id="ownership_type" className="app-select" value={form.ownership_type} onChange={(event) => setForm({ ...form, ownership_type: event.target.value })}>
                  <option value="PROPRIO">Proprio</option>
                  <option value="LOCADO">Locado</option>
                  <option value="CEDIDO">Cedido</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="status">Status</label>
                <select id="status" className="app-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="ATIVO">ATIVO</option>
                  <option value="MANUTENCAO">MANUTENCAO</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="Lotacao" subtitle="Orgao, departamento e lotacao">
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label>Orgao</label>
                <SearchableSelect value={form.organization_id} onChange={(value) => setForm({ ...form, organization_id: value, department_id: '', allocation_id: '' })} options={organizationOptions} placeholder={catalogLoading ? 'Carregando orgaos...' : 'Selecione o orgao'} searchPlaceholder="Buscar orgao" disabled={catalogLoading || organizationOptions.length === 0} />
              </div>
              <div className="form-field">
                <label>Departamento</label>
                <SearchableSelect value={form.department_id} onChange={(value) => setForm({ ...form, department_id: value, allocation_id: '' })} options={departmentOptions} placeholder={!form.organization_id ? 'Selecione primeiro o orgao' : 'Selecione o departamento'} searchPlaceholder="Buscar departamento" disabled={!form.organization_id || departmentOptions.length === 0} />
              </div>
              <div className="form-field modal-field-span">
                <label>Lotacao</label>
                <SearchableSelect value={form.allocation_id} onChange={(value) => setForm({ ...form, allocation_id: value })} options={allocationOptions} placeholder={!form.department_id ? 'Selecione primeiro o departamento' : 'Selecione a lotacao'} searchPlaceholder="Buscar lotacao" disabled={!form.department_id || allocationOptions.length === 0} />
                {editingId && !form.allocation_id && vehicles.find((vehicle) => vehicle.id === editingId)?.current_department ? <span className="helper-text">Registro legado atual: {vehicles.find((vehicle) => vehicle.id === editingId)?.current_department}</span> : null}
              </div>
            </div>
          </AccordionSection>

          {editingId ? (
            <AccordionSection title="Justificativa" subtitle="Observacao obrigatoria da edicao" open>
              <div className="form-grid modal-form-grid">
                <div className="form-field modal-field-span">
                  <label htmlFor="edit_reason">Justificativa da edicao</label>
                  <textarea
                    id="edit_reason"
                    className="app-textarea"
                    rows="4"
                    placeholder="Explique por que este cadastro do veiculo esta sendo alterado."
                    value={form.edit_reason}
                    onChange={(event) => setForm({ ...form, edit_reason: event.target.value })}
                  />
                  <span className="helper-text">Uma nova justificativa fica registrada em cada edicao e em qualquer nova movimentacao de lotacao gerada pela alteracao.</span>
                </div>
              </div>
            </AccordionSection>
          ) : null}

          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting || catalogLoading || Boolean(editingId && !form.edit_reason.trim())}>
              {submitting ? 'Salvando...' : editingId ? 'Atualizar veiculo' : 'Cadastrar veiculo'}
            </button>
            <button className="ghost-button" type="button" onClick={closeVehicleModal}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
