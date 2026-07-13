import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AccordionSection from '../components/AccordionSection'
import BadgeOwnership from '../components/BadgeOwnership'
import DriverBadge from '../components/DriverBadge'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { VEHICLE_LIST_LIMIT } from '../constants/pagination'
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
  { value: 'MANUTENCAO', label: 'Manutenção' },
  { value: 'INATIVO', label: 'Inativos' },
]

const ownershipOptions = [
  { value: 'TODOS', label: 'Todos os tipos' },
  { value: 'PROPRIO', label: 'Próprio' },
  { value: 'LOCADO', label: 'Locado' },
  { value: 'CEDIDO', label: 'Cedido' },
]

const unassignedOrganizationFilter = 'SEM_SECRETARIA'

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

function formatDateOnly(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
}

function buildHistoryPeriodLabel(filters) {
  if (filters.start_date && filters.end_date) {
    return `${formatDateOnly(filters.start_date)} a ${formatDateOnly(filters.end_date)}`
  }
  if (filters.start_date) return `A partir de ${formatDateOnly(filters.start_date)}`
  if (filters.end_date) return `Até ${formatDateOnly(filters.end_date)}`
  return 'Todo o histórico'
}

function buildHistoryPeriodParams(filters) {
  const params = {}
  if (filters.start_date) {
    params.start_date = new Date(`${filters.start_date}T00:00:00`).toISOString()
  }
  if (filters.end_date) {
    params.end_date = new Date(`${filters.end_date}T23:59:59.999`).toISOString()
  }
  return params
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
  if (!normalized) return 'Não informado'
  const segments = [normalized.slice(0, 4), normalized.slice(4, 8), normalized.slice(8, 12), normalized.slice(12)]
  return segments.filter(Boolean).join('-')
}

function getStatusLabel(value) {
  if (value === 'MANUTENCAO') return 'Em manutenção'
  if (value === 'INATIVO') return 'Inativo'
  return 'Ativo'
}

function getOwnershipLabel(value) {
  if (value === 'LOCADO') return 'Locado'
  if (value === 'CEDIDO') return 'Cedido'
  return 'Próprio'
}

function getVehicleTypeLabel(value) {
  return vehicleTypeOptions.find((option) => option.value === value)?.label || value || 'Não informado'
}

function getStatusBadgeColors(value) {
  if (value === 'Ativo') {
    return { fillColor: [234, 247, 239], textColor: [29, 122, 70] }
  }
  if (value === 'Em manutenção') {
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
  return vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação registrada'
}

function buildVehicleOrganizationLabel(vehicle) {
  return vehicle.current_location?.organization_name || 'Sem secretaria'
}

function buildVehicleReportLocationLabel(vehicle) {
  const location = vehicle.current_location
  if (!location) {
    return vehicle.current_department || 'Sem lotação'
  }

  const details = [location.department_name, location.allocation_name].filter(Boolean).join(' / ')
  return details || location.display_name || 'Sem lotação'
}

function buildVehicleReportDescription(vehicle) {
  return [
    `${vehicle.brand} ${vehicle.model}`.trim(),
    getVehicleTypeLabel(vehicle.vehicle_type),
  ]
    .filter(Boolean)
    .join('\n')
}

function buildVehicleReportStatus(vehicle) {
  return `${getOwnershipLabel(vehicle.ownership_type)}\n${getStatusLabel(vehicle.status)}`
}

function buildVehicleReportPlacement(vehicle) {
  return `${buildVehicleOrganizationLabel(vehicle)}\n${buildVehicleReportLocationLabel(vehicle)}`
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

function buildFilterSummary(statusFilter, ownershipFilter, organizationFilter, locationFilter, search, organizationOptions, locationOptions) {
  const filters = []
  const statusLabel = statusOptions.find((option) => option.value === statusFilter)?.label
  if (statusLabel) filters.push({ label: 'Status', value: statusLabel })

  if (organizationFilter !== 'TODOS') {
    const organizationLabel = organizationFilter === unassignedOrganizationFilter
      ? 'Sem secretaria'
      : organizationOptions.find((option) => option.value === organizationFilter)?.label || organizationFilter
    filters.push({ label: 'Secretaria', value: organizationLabel })
  }

  if (ownershipFilter !== 'TODOS') {
    filters.push({ label: 'Tipo', value: getOwnershipLabel(ownershipFilter) })
  }

  if (locationFilter !== 'TODOS') {
    const locationLabel = locationOptions.find((option) => option.value === locationFilter)?.label || locationFilter
    filters.push({ label: 'Lotação', value: locationLabel })
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
  vehicle_type: 'Tipo de veículo',
  ownership_type: 'Propriedade',
  status: 'Status',
  location: 'Lotação',
}

function getVehicleHistoryTypeLabel(value) {
  if (value === 'MOVEMENT') return 'Movimentação'
  if (value === 'CREATE') return 'Cadastro'
  return 'Edição'
}

function formatVehicleHistoryFieldValue(field, value) {
  if (value === null || value === undefined || value === '') return 'Não informado'
  if (field === 'status') return getStatusLabel(value)
  if (field === 'ownership_type') return getOwnershipLabel(value)
  if (field === 'vehicle_type') return getVehicleTypeLabel(value)
  return String(value)
}

function buildVehicleHistoryChangeLines(item) {
  if (item.event_type === 'MOVEMENT') {
    return [
      `Lotação: ${item.display_name || item.department || 'Não informada'}`,
      `Órgão: ${item.organization_name || 'Legado'}`,
      `Departamento: ${item.department_name || item.department || 'Sem departamento'}`,
      `Período: ${formatDate(item.start_date)} até ${item.end_date ? formatDate(item.end_date) : 'Atual'}`,
    ]
  }

  const after = item.after || {}
  if (item.event_type === 'CREATE') {
    return [
      `Status inicial: ${formatVehicleHistoryFieldValue('status', after.status)}`,
      `Tipo: ${formatVehicleHistoryFieldValue('vehicle_type', after.vehicle_type)}`,
      `Propriedade: ${formatVehicleHistoryFieldValue('ownership_type', after.ownership_type)}`,
      `Lotação inicial: ${formatVehicleHistoryFieldValue('location', after.location)}`,
    ].filter((line) => !line.endsWith('Não informado'))
  }

  const before = item.before || {}
  const changedKeys = Object.keys(vehicleHistoryFieldLabels).filter((key) => (before[key] ?? null) !== (after[key] ?? null))

  if (changedKeys.length === 0) {
    return ['Edição registrada sem diferenças adicionais nos campos auditados.']
  }

  return changedKeys.map((key) => `${vehicleHistoryFieldLabels[key]}: ${formatVehicleHistoryFieldValue(key, before[key])} -> ${formatVehicleHistoryFieldValue(key, after[key])}`)
}

function buildVehicleHistorySummary(item) {
  return buildVehicleHistoryChangeLines(item).join(' | ')
}

export default function VehiclesPage() {
  const { user, canCreate, canEdit, canDeleteModule, isAdmin } = useAuth()
  const canCreateVehicle = canCreate('vehicles')
  const canEditVehicle = canEdit('vehicles')
  const canDeleteVehicle = canDeleteModule('vehicles')
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(initialForm)
  const [selectedHistory, setSelectedHistory] = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [historyFilters, setHistoryFilters] = useState({ start_date: '', end_date: '' })
  const [historyLoading, setHistoryLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [organizationFilter, setOrganizationFilter] = useState('TODOS')
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
  const editCatalog = useMasterDataCatalog({ includeAll: true })

  const statusFilter = searchParams.get('status') || 'TODOS'
  const focusVehicleId = searchParams.get('focus')
  const modalOrganizations = editingId ? editCatalog.organizations : organizations
  const modalCatalogLoading = editingId ? editCatalog.loading : catalogLoading
  const modalCatalogError = editingId ? editCatalog.error : ''
  const modalGetDepartmentsByOrganization = editingId ? editCatalog.getDepartmentsByOrganization : getDepartmentsByOrganization
  const modalGetAllocationsByDepartment = editingId ? editCatalog.getAllocationsByDepartment : getAllocationsByDepartment

  const organizationOptions = modalOrganizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
    description: `${organization.departments.length} departamento(s)`,
  }))

  const organizationFilterOptions = useMemo(() => {
    const baseOptions = organizations
      .map((organization) => ({
        value: organization.id,
        label: organization.name,
        description: `${organization.departments.length} departamento(s)`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
    const hasUnassignedVehicles =
      vehicles.some((vehicle) => !vehicle.current_location?.organization_id) || organizationFilter === unassignedOrganizationFilter

    return [
      { value: 'TODOS', label: 'Todas as secretarias' },
      ...baseOptions,
      ...(hasUnassignedVehicles ? [{ value: unassignedOrganizationFilter, label: 'Sem secretaria' }] : []),
    ]
  }, [organizationFilter, organizations, vehicles])

  const departmentOptions = (form.organization_id ? modalGetDepartmentsByOrganization(form.organization_id) : []).map((department) => ({
    value: department.id,
    label: department.name,
    description: department.organization_name,
  }))

  const allocationOptions = (form.department_id ? modalGetAllocationsByDepartment(form.department_id) : []).map((allocation) => ({
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

    return [{ value: 'TODOS', label: 'Todas as lotações' }, ...Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label))]
  }, [allocations, vehicles])

  const xlsxExportColumns = [
    { header: 'Placa', value: (vehicle) => formatPlate(vehicle.plate), align: 'center', width: 66 },
    { header: 'Chassi', value: (vehicle) => formatChassis(vehicle.chassis_number), align: 'center', width: 118 },
    { header: 'Marca / Modelo', value: (vehicle) => `${vehicle.brand}\n${vehicle.model}` },
    { header: 'Tipo veículo', value: (vehicle) => getVehicleTypeLabel(vehicle.vehicle_type), align: 'center', width: 82 },
    { header: 'Tipo propriedade', value: (vehicle) => getOwnershipLabel(vehicle.ownership_type), align: 'center', width: 74, badgeColors: getOwnershipBadgeColors },
    { header: 'Status', value: (vehicle) => getStatusLabel(vehicle.status), align: 'center', width: 88, badgeColors: getStatusBadgeColors },
    { header: 'Secretaria', value: (vehicle) => buildVehicleOrganizationLabel(vehicle), width: 106 },
    { header: 'Lotação atual', value: (vehicle) => buildVehicleLocationLabel(vehicle) },
    { header: 'Condutor atual', value: (vehicle) => vehicle.current_driver_name || '—' },
    { header: 'Atualizado em', value: (vehicle) => formatDate(vehicle.updated_at), align: 'center', width: 92 },
  ]

  const pdfExportColumns = [
    { header: 'Placa', value: (vehicle) => formatPlate(vehicle.plate), align: 'center', width: 58 },
    { header: 'Chassi', value: (vehicle) => formatChassis(vehicle.chassis_number), align: 'center', width: 88 },
    { header: 'Veículo', value: buildVehicleReportDescription, width: 128 },
    { header: 'Propr. / Status', value: buildVehicleReportStatus, align: 'center', width: 82 },
    { header: 'Secretaria / Lotação', value: buildVehicleReportPlacement, width: 244 },
    { header: 'Condutor', value: (vehicle) => vehicle.current_driver_name || '—', width: 78 },
    { header: 'Atualizado', value: (vehicle) => formatDate(vehicle.updated_at), align: 'center', width: 82 },
  ]

  async function loadVehicles() {
    try {
      setLoading(true)
      setError('')
      const params = { limit: VEHICLE_LIST_LIMIT }
      if (statusFilter !== 'TODOS') params.status = statusFilter
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
      setError(getApiErrorMessage(err, 'Não foi possível carregar os veículos.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles()
  }, [statusFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [search, organizationFilter, locationFilter, ownershipFilter, statusFilter, selectedVehicle?.id, vehicles.length])

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
        buildVehicleOrganizationLabel(vehicle),
        buildVehicleLocationLabel(vehicle),
        vehicle.current_driver_name,
        getOwnershipLabel(vehicle.ownership_type),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))

    const vehicleOrganizationId = vehicle.current_location?.organization_id
    const matchesOrganization =
      organizationFilter === 'TODOS' ||
      (organizationFilter === unassignedOrganizationFilter ? !vehicleOrganizationId : vehicleOrganizationId === organizationFilter)
    const matchesLocation = locationFilter === 'TODOS' || buildVehicleLocationLabel(vehicle) === locationFilter
    const matchesOwnership = ownershipFilter === 'TODOS' || vehicle.ownership_type === ownershipFilter

    return matchesSearch && matchesOrganization && matchesLocation && matchesOwnership
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
    const { toggle = true, syncUrl = true, filters = historyFilters } = options

    if (toggle && selectedVehicle?.id === id) {
      clearHistoryFocus(syncUrl)
      return
    }

    try {
      setError('')
      setHistoryLoading(true)
      const { data } = await api.get(`/vehicles/${id}/historico`, { params: buildHistoryPeriodParams(filters) })
      const vehicle = vehicles.find((item) => item.id === id) || null
      setSelectedVehicle(vehicle)
      setSelectedHistory(data)
      if (syncUrl) {
        patchSearchParams({ focus: id })
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar o histórico.'))
    } finally {
      setHistoryLoading(false)
    }
  }

  function clearHistoryFocus(syncUrl = true) {
    setSelectedVehicle(null)
    setSelectedHistory([])
    setHistoryLoading(false)
    if (syncUrl) {
      patchSearchParams({ focus: null })
    }
  }

  function validateHistoryPeriod() {
    if (historyFilters.start_date && historyFilters.end_date && historyFilters.start_date > historyFilters.end_date) {
      setError('A data inicial do período não pode ser maior que a data final.')
      return false
    }
    return true
  }

  function applyHistoryPeriod() {
    if (!selectedVehicle || !validateHistoryPeriod()) return
    loadHistory(selectedVehicle.id, { toggle: false, syncUrl: false })
  }

  function clearHistoryPeriod() {
    const hadFilters = Boolean(historyFilters.start_date || historyFilters.end_date)
    setHistoryFilters({ start_date: '', end_date: '' })
    if (selectedVehicle && hadFilters) {
      loadHistory(selectedVehicle.id, { toggle: false, syncUrl: false, filters: { start_date: '', end_date: '' } })
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
    setOrganizationFilter('TODOS')
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
    if ((editingId && !canEditVehicle) || (!editingId && !canCreateVehicle)) {
      setError('Você não tem permissão para salvar veículos.')
      return
    }

    const isEditingLegacyWithoutLocation = Boolean(editingId) && !form.allocation_id && !vehicles.find((vehicle) => vehicle.id === editingId)?.current_location
    const touchedLocationSelection = Boolean(form.organization_id || form.department_id || form.allocation_id)

    if (!editingId && !form.allocation_id) {
      setError('Selecione a lotação completa para cadastrar o veículo.')
      return
    }

    if (editingId && touchedLocationSelection && !form.allocation_id) {
      setError('Conclua a seleção até a lotação para salvar a alteração.')
      return
    }

    if (editingId && !form.edit_reason.trim()) {
      setError('Informe a justificativa obrigatória desta edição.')
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
        // Mantém a lotação atual sem forçar atualização.
      }

      if (editingId) {
        payload.edit_reason = form.edit_reason
        await api.put(`/vehicles/${editingId}`, payload)
        setFeedback('Veículo atualizado com justificativa e histórico.')
      } else {
        await api.post('/vehicles', payload)
        setFeedback('Veículo cadastrado com sucesso.')
      }

      closeVehicleModal()
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o veículo.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Confirma a exclusão?')) return

    try {
      setError('')
      setFeedback('')
      await api.delete(`/vehicles/${id}`)
      if (editingId === id) closeVehicleModal()
      if (selectedVehicle?.id === id) {
        clearHistoryFocus(false)
      }
      setFeedback('Veículo removido com sucesso.')
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível excluir o veículo.'))
    }
  }

  async function handlePreviewPdf() {
    if (filteredVehicles.length === 0) {
      setFeedback('Não há veículos filtrados para pré-visualizar em PDF.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Veículos',
        fileName: 'frota-pmtf-veículos',
        subtitle: 'Relatório dos veículos filtrados no painel operacional.',
        columns: pdfExportColumns,
        rows: filteredVehicles,
        filters: buildFilterSummary(statusFilter, ownershipFilter, organizationFilter, locationFilter, search, organizationFilterOptions, locationOptions),
        summaryMetrics: vehicleReportMetrics,
        summaryChartItems: [
          { label: 'Ativos', value: visibleActiveVehicles, tone: 'green' },
          { label: 'Manutenção', value: visibleMaintenanceVehicles, tone: 'amber' },
          { label: 'Inativos', value: visibleInactiveVehicles, tone: 'red' },
          { label: 'Sem condutor', value: visibleWithoutDriver, tone: 'slate' },
        ],
        referenceLabel: latestUpdate ? `Referência dos dados: atualizado até ${formatDate(latestUpdate)}` : 'Referência dos dados: painel operacional atual',
        responsibleSector: 'Secretaria Municipal de Administração | Setor de Frotas',
        generatedBy: user?.name || user?.email || 'Usuário autenticado',
      })
      setFeedback('Pré-visualização do PDF aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar a pré-visualização em PDF.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredVehicles.length === 0) {
      setFeedback('Não há veículos filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-veículos',
        sheetName: 'Veículos',
        columns: xlsxExportColumns,
        rows: filteredVehicles,
        filters: buildFilterSummary(statusFilter, ownershipFilter, organizationFilter, locationFilter, search, organizationFilterOptions, locationOptions),
      })
      setFeedback('Exportação em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar os veículos em XLSX.'))
    }
  }

  async function handlePreviewHistoryPdf() {
    if (!selectedVehicle || selectedHistory.length === 0) {
      setFeedback('Selecione um veículo com histórico carregado para pré-visualizar o PDF.')
      return
    }

    const historyColumns = [
      { header: 'Veículo', value: () => selectedVehicle.plate },
      { header: 'Data', value: (item) => formatDate(item.occurred_at) },
      { header: 'Evento', value: (item) => getVehicleHistoryTypeLabel(item.event_type) },
      { header: 'Resumo', value: (item) => buildVehicleHistorySummary(item) },
      { header: 'Justificativa', value: (item) => item.justification || 'Sem justificativa registrada' },
      { header: 'Ator', value: (item) => item.actor_name || 'Sistema' },
    ]

    const historyEditCount = selectedHistory.filter((item) => item.event_type === 'EDIT').length
    const historyMovementCount = selectedHistory.filter((item) => item.event_type === 'MOVEMENT').length
    const historyPeriodLabel = buildHistoryPeriodLabel(historyFilters)

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: `Frota PMTF - Histórico ${selectedVehicle.plate}`,
        fileName: `frota-pmtf-histórico-${selectedVehicle.plate.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        subtitle: `Histórico de edições e movimentações do veículo ${selectedVehicle.plate} | ${selectedVehicle.brand} ${selectedVehicle.model} | ${historyPeriodLabel}.`,
        columns: historyColumns,
        rows: selectedHistory,
        summaryMetrics: [
          { label: 'Veículo', value: selectedVehicle.plate, tone: 'blue' },
          { label: 'Eventos', value: selectedHistory.length, tone: 'blue' },
          { label: 'Edições', value: historyEditCount, tone: 'amber' },
          { label: 'Movimentações', value: historyMovementCount, tone: 'blue' },
          { label: 'Tipo', value: getOwnershipLabel(selectedVehicle.ownership_type), tone: 'blue' },
          { label: 'Status', value: getStatusLabel(selectedVehicle.status), tone: selectedVehicle.status === 'ATIVO' ? 'green' : selectedVehicle.status === 'MANUTENCAO' ? 'amber' : 'red' },
        ],
        filters: [
          { label: 'Veículo', value: selectedVehicle.plate },
          { label: 'Tipo', value: getOwnershipLabel(selectedVehicle.ownership_type) },
          { label: 'Status', value: getStatusLabel(selectedVehicle.status) },
          { label: 'Período', value: historyPeriodLabel },
        ],
        referenceLabel: selectedVehicle.updated_at ? `Referência dos dados: atualizado até ${formatDate(selectedVehicle.updated_at)}` : 'Histórico consolidado da frota municipal',
        responsibleSector: 'Secretaria Municipal de Administração | Setor de Frotas',
        generatedBy: user?.name || user?.email || 'Usuário autenticado',
      })
      setFeedback(`Pré-visualização do histórico de ${selectedVehicle.plate} aberta em nova guia.`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF do histórico do veículo.'))
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
    { label: 'Total de veículos', value: filteredVehicles.length, tone: 'blue' },
    { label: 'Ativos', value: visibleActiveVehicles, tone: 'green' },
    { label: 'Em manutenção', value: visibleMaintenanceVehicles, tone: 'amber' },
    { label: 'Inativos', value: visibleInactiveVehicles, tone: 'red' },
    { label: 'Sem condutor', value: visibleWithoutDriver, tone: 'slate' },
    { label: 'Próprios', value: visibleOwnVehicles, tone: 'green' },
    { label: 'Locados', value: visibleRentedVehicles, tone: 'amber' },
    { label: 'Cedidos', value: visibleAssignedVehicles, tone: 'blue' },
  ]

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Operação de veículos</h2>
          <p className="section-copy">Gerencie placa, chassi, tipo do veículo e lotação estruturada sem sair da consulta principal.</p>
        </div>
        <div className="actions-inline">
          {canCreateVehicle ? <button className="app-button" type="button" onClick={openNewVehicleModal}>Novo veículo</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Pré-visualizar PDF</button>
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
              placeholder="Buscar por placa, chassi, marca, modelo, secretaria, lotação ou condutor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <SearchableSelect
              value={organizationFilter}
              onChange={setOrganizationFilter}
              options={organizationFilterOptions}
              placeholder="Filtrar secretaria"
              searchPlaceholder="Buscar secretaria"
              disabled={catalogLoading && organizationFilterOptions.length <= 1}
            />
            <SearchableSelect
              value={locationFilter}
              onChange={setLocationFilter}
              options={locationOptions}
              placeholder="Filtrar lotação"
              searchPlaceholder="Buscar lotação"
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
          <span>veículos exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{visibleOwnVehicles}</strong>
          <span>próprios visíveis</span>
        </div>
        <div className="metric-inline">
          <strong>{visibleRentedVehicles}</strong>
          <span>locados visíveis</span>
        </div>
        <div className="metric-inline">
          <strong>{visibleAssignedVehicles}</strong>
          <span>cedidos visíveis</span>
        </div>
      </div>

      {selectedVehicle ? (
        <div className="table-focus-banner">
          <div>
            <strong>Mostrando apenas {selectedVehicle.plate}</strong>
            <span>Clique novamente em Histórico no mesmo veículo para voltar a lista completa.</span>
          </div>
          <button className="ghost-button" type="button" onClick={clearHistoryFocus}>Reexibir todos</button>
        </div>
      ) : null}

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {catalogError || modalCatalogError ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{catalogError || modalCatalogError}</div> : null}
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
                <th>Tipo veículo</th>
                <th>Propriedade</th>
                <th>Status</th>
                <th>Lotação atual</th>
                <th>Condutor atual</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" className="muted">Carregando veículos...</td>
                </tr>
              ) : filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan="11">
                    <div className="empty-state">
                      Nenhum veículo encontrado para os filtros aplicados. Ajuste a busca, a secretaria, a lotação ou o tipo para revisar a base completa.
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className={selectedVehicle?.id === vehicle.id ? 'is-focused-row' : ''}>
                    <td data-label="Placa"><strong>{vehicle.plate}</strong></td>
                    <td data-label="Chassi">{vehicle.chassis_number || 'Não informado'}</td>
                    <td data-label="Marca">{vehicle.brand}</td>
                    <td data-label="Modelo">{vehicle.model}</td>
                    <td data-label="Tipo veículo">{getVehicleTypeLabel(vehicle.vehicle_type)}</td>
                    <td data-label="Propriedade"><BadgeOwnership value={vehicle.ownership_type} /></td>
                    <td data-label="Status"><span className={`status-badge status-${vehicle.status}`}>{vehicle.status}</span></td>
                    <td data-label="Lotação atual">{buildVehicleLocationLabel(vehicle)}</td>
                    <td data-label="Condutor atual"><DriverBadge name={vehicle.current_driver_name} /></td>
                    <td data-label="Atualizado em">{formatDate(vehicle.updated_at)}</td>
                    <td data-label="Ações">
                      <div className="actions-inline">
                        <button type="button" className="mini-button" onClick={() => loadHistory(vehicle.id)}>
                          {selectedVehicle?.id === vehicle.id ? 'Fechar histórico' : 'Histórico'}
                        </button>
                        {selectedVehicle?.id === vehicle.id ? <span className="focus-inline">em foco</span> : null}
                        {canEditVehicle ? <button type="button" className="mini-button" onClick={() => editVehicle(vehicle)}>Editar</button> : null}
                        {canDeleteVehicle ? <button type="button" className="mini-button danger" onClick={() => handleDelete(vehicle.id)}>Excluir</button> : null}
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
            <h3 className="section-title">Histórico do veículo</h3>
            <p className="section-copy">
              {selectedVehicle ? `Linha do tempo de ${selectedVehicle.plate} com edições cadastrais e movimentações de lotação.` : 'Selecione um veículo na tabela para visualizar o histórico consolidado de edições e movimentações.'}
            </p>
            {selectedVehicle ? (
              <p className="section-copy" style={{ marginTop: 10 }}>
                Chassi: {selectedVehicle.chassis_number || 'Não informado'} | Condutor atual: {selectedVehicle.current_driver_name || 'Sem condutor ativo'}
              </p>
            ) : null}
          </div>
          {selectedVehicle ? (
            <div className="actions-inline">
              {selectedHistory.length > 0 ? (
                <button className="secondary-button" type="button" onClick={handlePreviewHistoryPdf}>
                  Pré-visualizar PDF
                </button>
              ) : null}
              {isAdmin ? (
                <div className="audit-card">
                  <strong>Auditoria visível para admin</strong>
                  <span>Criado em {formatDate(selectedVehicle.created_at)}</span>
                  <span>Atualizado em {formatDate(selectedVehicle.updated_at)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {selectedVehicle ? (
          <div className="history-filter-bar">
            <div className="form-field">
              <label>Início do período</label>
              <input
                type="date"
                className="app-input"
                value={historyFilters.start_date}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, start_date: event.target.value }))}
              />
            </div>
            <div className="form-field">
              <label>Fim do período</label>
              <input
                type="date"
                className="app-input"
                value={historyFilters.end_date}
                onChange={(event) => setHistoryFilters((current) => ({ ...current, end_date: event.target.value }))}
              />
            </div>
            <div className="history-filter-actions">
              <button className="app-button" type="button" onClick={applyHistoryPeriod} disabled={historyLoading}>
                Filtrar período
              </button>
              <button className="ghost-button" type="button" onClick={clearHistoryPeriod} disabled={historyLoading}>
                Limpar período
              </button>
            </div>
            <span className="muted">{buildHistoryPeriodLabel(historyFilters)} | {selectedHistory.length} evento(s)</span>
          </div>
        ) : null}
        {historyLoading ? (
          <div className="empty-state">Carregando histórico do veículo...</div>
        ) : selectedHistory.length > 0 ? (
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
          <div className="empty-state">
            {selectedVehicle ? 'Nenhum evento encontrado para o período selecionado.' : 'Ainda não há histórico carregado para exibição neste painel.'}
          </div>
        )}
      </section>

      <Modal
        open={isModalOpen}
        title={editingId ? 'Editar veículo' : 'Novo veículo'}
        description={editingId ? 'Toda alteração exige uma nova justificativa. Ela será registrada no histórico de edições e movimentações do veículo.' : 'Preencha os dados do veículo e vincule a lotação por órgão, departamento e lotação cadastrados.'}
        onClose={closeVehicleModal}
      >
        <form onSubmit={handleSubmit} className="stack">
          <AccordionSection title="Dados básicos" subtitle="Identificação e classificação" open>
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label htmlFor="plate">Placa</label>
                <input id="plate" className="app-input" placeholder="ABC-1D23" value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="chassis_number">Número do chassi</label>
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
                <label htmlFor="vehicle_type">Categoria do veículo</label>
                <select id="vehicle_type" className="app-select" value={form.vehicle_type} onChange={(event) => setForm({ ...form, vehicle_type: event.target.value })}>
                  {vehicleTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="ownership_type">Tipo de propriedade</label>
                <select id="ownership_type" className="app-select" value={form.ownership_type} onChange={(event) => setForm({ ...form, ownership_type: event.target.value })}>
                  <option value="PROPRIO">Próprio</option>
                  <option value="LOCADO">Locado</option>
                  <option value="CEDIDO">Cedido</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="status">Status</label>
                <select id="status" className="app-select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="ATIVO">ATIVO</option>
                  <option value="MANUTENCAO">Manutenção</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="Lotação" subtitle="Órgão, departamento e lotação">
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label>Órgão</label>
                <SearchableSelect value={form.organization_id} onChange={(value) => setForm({ ...form, organization_id: value, department_id: '', allocation_id: '' })} options={organizationOptions} placeholder={modalCatalogLoading ? 'Carregando órgãos...' : 'Selecione o órgão'} searchPlaceholder="Buscar órgão" disabled={modalCatalogLoading || organizationOptions.length === 0} />
              </div>
              <div className="form-field">
                <label>Departamento</label>
                <SearchableSelect value={form.department_id} onChange={(value) => setForm({ ...form, department_id: value, allocation_id: '' })} options={departmentOptions} placeholder={!form.organization_id ? 'Selecione primeiro o órgão' : 'Selecione o departamento'} searchPlaceholder="Buscar departamento" disabled={!form.organization_id || departmentOptions.length === 0} />
              </div>
              <div className="form-field modal-field-span">
                <label>Lotação</label>
                <SearchableSelect value={form.allocation_id} onChange={(value) => setForm({ ...form, allocation_id: value })} options={allocationOptions} placeholder={!form.department_id ? 'Selecione primeiro o departamento' : 'Selecione a lotação'} searchPlaceholder="Buscar lotação" disabled={!form.department_id || allocationOptions.length === 0} />
                {editingId && !form.allocation_id && vehicles.find((vehicle) => vehicle.id === editingId)?.current_department ? <span className="helper-text">Registro legado atual: {vehicles.find((vehicle) => vehicle.id === editingId)?.current_department}</span> : null}
              </div>
            </div>
          </AccordionSection>

          {editingId ? (
            <AccordionSection title="Justificativa" subtitle="Observação obrigatória da edição" open>
              <div className="form-grid modal-form-grid">
                <div className="form-field modal-field-span">
                  <label htmlFor="edit_reason">Justificativa da edição</label>
                  <textarea
                    id="edit_reason"
                    className="app-textarea"
                    rows="4"
                    placeholder="Explique por que este cadastro do veículo está sendo alterado."
                    value={form.edit_reason}
                    onChange={(event) => setForm({ ...form, edit_reason: event.target.value })}
                  />
                  <span className="helper-text">Uma nova justificativa fica registrada em cada edição e em qualquer nova movimentação de lotação gerada pela alteração.</span>
                </div>
              </div>
            </AccordionSection>
          ) : null}

          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting || modalCatalogLoading || Boolean(editingId && !form.edit_reason.trim())}>
              {submitting ? 'Salvando...' : editingId ? 'Atualizar veículo' : 'Cadastrar veículo'}
            </button>
            <button className="ghost-button" type="button" onClick={closeVehicleModal}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
