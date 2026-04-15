import { useEffect, useMemo, useState } from 'react'
import SearchableSelect from '../components/SearchableSelect'
import Pagination from '../components/Pagination'
import Modal from '../components/Modal'
import { masterDataAPI } from '../api/masterData'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx } from '../utils/exportData'

const initialOrganizationForm = { id: null, name: '' }
const initialDepartmentForm = { id: null, organization_id: '', name: '' }
const initialAllocationForm = { id: null, organization_id: '', department_id: '', name: '' }
const PAGE_SIZE = 8
const IMPORT_TEMPLATE_COLUMNS = [
  { header: 'orgao', value: (row) => row.orgao },
  { header: 'departamento', value: (row) => row.departamento },
  { header: 'lotacao', value: (row) => row.lotacao },
]
const IMPORT_TEMPLATE_ROWS = [
  { orgao: 'Secretaria de Saude', departamento: 'Transporte Sanitario', lotacao: 'Garagem Central' },
  { orgao: 'Secretaria de Educacao', departamento: 'Transporte Escolar', lotacao: 'Garagem Norte' },
]

export default function CadastrosPage() {
  const { canWrite, canDelete } = useAuth()
  const {
    organizations,
    departments,
    allocations,
    loading,
    error: catalogError,
    reload,
    getDepartmentsByOrganization,
  } = useMasterDataCatalog()
  const [organizationForm, setOrganizationForm] = useState(initialOrganizationForm)
  const [departmentForm, setDepartmentForm] = useState(initialDepartmentForm)
  const [allocationForm, setAllocationForm] = useState(initialAllocationForm)
  const [selectedOrganizationFilter, setSelectedOrganizationFilter] = useState('')
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState('')
  const [activeTab, setActiveTab] = useState('organizations')
  const [organizationSearch, setOrganizationSearch] = useState('')
  const [departmentSearch, setDepartmentSearch] = useState('')
  const [allocationSearch, setAllocationSearch] = useState('')
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false)
  const [advancedOrgName, setAdvancedOrgName] = useState('')
  const [advancedOrgDepartmentMode, setAdvancedOrgDepartmentMode] = useState('any')
  const [organizationPage, setOrganizationPage] = useState(1)
  const [departmentPage, setDepartmentPage] = useState(1)
  const [allocationPage, setAllocationPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [pendingDelete, setPendingDelete] = useState(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState([])
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState([])
  const [selectedAllocationIds, setSelectedAllocationIds] = useState([])
  const [expandedPanels, setExpandedPanels] = useState({
    preview: false,
    organizations: true,
    departments: true,
    allocations: true,
  })

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
    description: `${organization.departments.length} departamento(s)`,
  }))

  const allocationDepartmentOptions = (allocationForm.organization_id ? getDepartmentsByOrganization(allocationForm.organization_id) : []).map((department) => ({
    value: department.id,
    label: department.name,
    description: department.organization_name,
  }))

  const filteredDepartments = useMemo(() => {
    const normalizedSearch = departmentSearch.trim().toLowerCase()
    return departments.filter((department) => {
      const byOrganization = !selectedOrganizationFilter || department.organization_id === selectedOrganizationFilter
      const bySearch = !normalizedSearch || `${department.name} ${department.organization_name}`.toLowerCase().includes(normalizedSearch)
      return byOrganization && bySearch
    })
  }, [departments, selectedOrganizationFilter, departmentSearch])

  const filteredAllocations = useMemo(() => {
    const normalizedSearch = allocationSearch.trim().toLowerCase()
    return allocations.filter((allocation) => {
      const byDepartment = !selectedDepartmentFilter || allocation.department_id === selectedDepartmentFilter
      const byOrganization = selectedDepartmentFilter ? true : (!selectedOrganizationFilter || allocation.organization_id === selectedOrganizationFilter)
      const bySearch = !normalizedSearch || `${allocation.name} ${allocation.department_name} ${allocation.organization_name}`.toLowerCase().includes(normalizedSearch)
      return byDepartment && byOrganization && bySearch
    })
  }, [allocations, selectedDepartmentFilter, selectedOrganizationFilter, allocationSearch])

  const filteredOrganizations = useMemo(() => {
    const normalizedSearch = organizationSearch.trim().toLowerCase()
    const normalizedAdvancedSearch = advancedOrgName.trim().toLowerCase()
    return organizations.filter((organization) => {
      const bySearch = !normalizedSearch || organization.name.toLowerCase().includes(normalizedSearch)
      const byAdvancedName = !normalizedAdvancedSearch || organization.name.toLowerCase().includes(normalizedAdvancedSearch)
      const hasDepartments = organization.departments.length > 0
      const byDepartmentMode = advancedOrgDepartmentMode === 'any'
        || (advancedOrgDepartmentMode === 'with' && hasDepartments)
        || (advancedOrgDepartmentMode === 'without' && !hasDepartments)
      return bySearch && byAdvancedName && byDepartmentMode
    })
  }, [organizations, organizationSearch, advancedOrgName, advancedOrgDepartmentMode])

  const paginatedOrganizations = useMemo(() => {
    const startIndex = (organizationPage - 1) * PAGE_SIZE
    return filteredOrganizations.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredOrganizations, organizationPage])

  const paginatedDepartments = useMemo(() => {
    const startIndex = (departmentPage - 1) * PAGE_SIZE
    return filteredDepartments.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredDepartments, departmentPage])

  const paginatedAllocations = useMemo(() => {
    const startIndex = (allocationPage - 1) * PAGE_SIZE
    return filteredAllocations.slice(startIndex, startIndex + PAGE_SIZE)
  }, [filteredAllocations, allocationPage])

  const organizationTotalPages = Math.max(1, Math.ceil(filteredOrganizations.length / PAGE_SIZE))
  const departmentTotalPages = Math.max(1, Math.ceil(filteredDepartments.length / PAGE_SIZE))
  const allocationTotalPages = Math.max(1, Math.ceil(filteredAllocations.length / PAGE_SIZE))
  const allVisibleOrganizationsSelected = paginatedOrganizations.length > 0 && paginatedOrganizations.every((item) => selectedOrganizationIds.includes(item.id))
  const allVisibleDepartmentsSelected = paginatedDepartments.length > 0 && paginatedDepartments.every((item) => selectedDepartmentIds.includes(item.id))
  const allVisibleAllocationsSelected = paginatedAllocations.length > 0 && paginatedAllocations.every((item) => selectedAllocationIds.includes(item.id))

  const hierarchicalPreview = useMemo(() => organizations.map((organization) => {
    const organizationDepartments = departments.filter((department) => department.organization_id === organization.id)
    return {
      ...organization,
      departmentCount: organizationDepartments.length,
      allocationCount: allocations.filter((allocation) => allocation.organization_id === organization.id).length,
      departments: organizationDepartments.map((department) => ({
        ...department,
        allocations: allocations.filter((allocation) => allocation.department_id === department.id),
      })),
    }
  }), [organizations, departments, allocations])

  useEffect(() => {
    setOrganizationPage(1)
  }, [organizationSearch])

  useEffect(() => {
    setDepartmentPage(1)
  }, [selectedOrganizationFilter, departmentSearch])

  useEffect(() => {
    setAllocationPage(1)
  }, [selectedOrganizationFilter, selectedDepartmentFilter, allocationSearch])

  useEffect(() => {
    if (organizationPage > organizationTotalPages) setOrganizationPage(organizationTotalPages)
  }, [organizationPage, organizationTotalPages])

  useEffect(() => {
    if (departmentPage > departmentTotalPages) setDepartmentPage(departmentTotalPages)
  }, [departmentPage, departmentTotalPages])

  useEffect(() => {
    if (allocationPage > allocationTotalPages) setAllocationPage(allocationTotalPages)
  }, [allocationPage, allocationTotalPages])

  useEffect(() => {
    setSelectedOrganizationIds([])
    setSelectedDepartmentIds([])
    setSelectedAllocationIds([])
  }, [activeTab])

  useEffect(() => {
    const handleKeyDown = (event) => {
      const isTypingTarget = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase())
      if (isTypingTarget) return

      if (event.ctrlKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        setActiveTab('organizations')
        document.getElementById('organization-name')?.focus()
      }

      if (event.ctrlKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        if (activeTab === 'organizations') document.getElementById('search-organization-input')?.focus()
        if (activeTab === 'departments') document.getElementById('search-department-input')?.focus()
        if (activeTab === 'allocations') document.getElementById('search-allocation-input')?.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab])

  function resetForms() {
    setOrganizationForm(initialOrganizationForm)
    setDepartmentForm(initialDepartmentForm)
    setAllocationForm(initialAllocationForm)
  }

  function togglePanel(panelName) {
    setExpandedPanels((current) => ({ ...current, [panelName]: !current[panelName] }))
  }

  async function handleSubmitOrganization(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      if (organizationForm.id) {
        await masterDataAPI.updateOrganization(organizationForm.id, { name: organizationForm.name })
        setFeedback('Orgao atualizado com sucesso.')
      } else {
        await masterDataAPI.createOrganization({ name: organizationForm.name })
        setFeedback('Orgao cadastrado com sucesso.')
      }
      setOrganizationForm(initialOrganizationForm)
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o orgao.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitDepartment(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      const payload = {
        organization_id: departmentForm.organization_id,
        name: departmentForm.name,
      }
      if (departmentForm.id) {
        await masterDataAPI.updateDepartment(departmentForm.id, payload)
        setFeedback('Departamento atualizado com sucesso.')
      } else {
        await masterDataAPI.createDepartment(payload)
        setFeedback('Departamento cadastrado com sucesso.')
      }
      setDepartmentForm(initialDepartmentForm)
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o departamento.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSubmitAllocation(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      const payload = {
        department_id: allocationForm.department_id,
        name: allocationForm.name,
      }
      if (allocationForm.id) {
        await masterDataAPI.updateAllocation(allocationForm.id, payload)
        setFeedback('Lotacao atualizada com sucesso.')
      } else {
        await masterDataAPI.createAllocation(payload)
        setFeedback('Lotacao cadastrada com sucesso.')
      }
      setAllocationForm(initialAllocationForm)
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar a lotacao.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(kind, item) {
    setPendingDelete({ kind, item })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    const { kind, item } = pendingDelete
    try {
      setError('')
      if (kind === 'Orgao') {
        await masterDataAPI.removeOrganization(item.id)
      } else if (kind === 'Departamento') {
        await masterDataAPI.removeDepartment(item.id)
      } else {
        await masterDataAPI.removeAllocation(item.id)
      }
      setFeedback(`${kind} removido com sucesso.`)
      setPendingDelete(null)
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, `Nao foi possivel remover ${kind.toLowerCase()}.`))
    }
  }

  function toggleOrganizationSelection(organizationId) {
    setSelectedOrganizationIds((current) => (current.includes(organizationId)
      ? current.filter((id) => id !== organizationId)
      : [...current, organizationId]))
  }

  function toggleSelectAllVisibleOrganizations() {
    setSelectedOrganizationIds((current) => {
      if (allVisibleOrganizationsSelected) {
        return current.filter((id) => !paginatedOrganizations.some((organization) => organization.id === id))
      }

      const merged = new Set(current)
      paginatedOrganizations.forEach((organization) => merged.add(organization.id))
      return [...merged]
    })
  }

  async function handleBulkDeleteOrganizations() {
    if (selectedOrganizationIds.length === 0) return
    setBulkDeleting(true)
    setError('')
    try {
      for (const organizationId of selectedOrganizationIds) {
        await masterDataAPI.removeOrganization(organizationId)
      }
      setSelectedOrganizationIds([])
      setFeedback('Orgaos selecionados removidos com sucesso.')
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover todos os orgaos selecionados.'))
    } finally {
      setBulkDeleting(false)
    }
  }

  function toggleDepartmentSelection(departmentId) {
    setSelectedDepartmentIds((current) => (current.includes(departmentId)
      ? current.filter((id) => id !== departmentId)
      : [...current, departmentId]))
  }

  function toggleAllocationSelection(allocationId) {
    setSelectedAllocationIds((current) => (current.includes(allocationId)
      ? current.filter((id) => id !== allocationId)
      : [...current, allocationId]))
  }

  function toggleSelectAllVisibleDepartments() {
    setSelectedDepartmentIds((current) => {
      if (allVisibleDepartmentsSelected) {
        return current.filter((id) => !paginatedDepartments.some((department) => department.id === id))
      }
      const merged = new Set(current)
      paginatedDepartments.forEach((department) => merged.add(department.id))
      return [...merged]
    })
  }

  function toggleSelectAllVisibleAllocations() {
    setSelectedAllocationIds((current) => {
      if (allVisibleAllocationsSelected) {
        return current.filter((id) => !paginatedAllocations.some((allocation) => allocation.id === id))
      }
      const merged = new Set(current)
      paginatedAllocations.forEach((allocation) => merged.add(allocation.id))
      return [...merged]
    })
  }

  async function handleBulkDeleteDepartments() {
    if (selectedDepartmentIds.length === 0) return
    setBulkDeleting(true)
    setError('')
    try {
      for (const departmentId of selectedDepartmentIds) {
        await masterDataAPI.removeDepartment(departmentId)
      }
      setSelectedDepartmentIds([])
      setFeedback('Departamentos selecionados removidos com sucesso.')
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover todos os departamentos selecionados.'))
    } finally {
      setBulkDeleting(false)
    }
  }

  async function handleBulkDeleteAllocations() {
    if (selectedAllocationIds.length === 0) return
    setBulkDeleting(true)
    setError('')
    try {
      for (const allocationId of selectedAllocationIds) {
        await masterDataAPI.removeAllocation(allocationId)
      }
      setSelectedAllocationIds([])
      setFeedback('Lotacoes selecionadas removidas com sucesso.')
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover todas as lotacoes selecionadas.'))
    } finally {
      setBulkDeleting(false)
    }
  }

  function exportSelectedDepartments() {
    if (selectedDepartmentIds.length === 0) return
    const selectedRows = departments.filter((department) => selectedDepartmentIds.includes(department.id))
    const csvLines = [
      'departamento,orgao',
      ...selectedRows.map((row) => `\"${row.name}\",\"${row.organization_name}\"`),
    ]
    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'departamentos-selecionados.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 3000)
    setFeedback('Exportacao dos departamentos selecionados concluida.')
  }

  function exportSelectedAllocations() {
    if (selectedAllocationIds.length === 0) return
    const selectedRows = allocations.filter((allocation) => selectedAllocationIds.includes(allocation.id))
    const csvLines = [
      'lotacao,departamento,orgao',
      ...selectedRows.map((row) => `\"${row.name}\",\"${row.department_name}\",\"${row.organization_name}\"`),
    ]
    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'lotacoes-selecionadas.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 3000)
    setFeedback('Exportacao das lotacoes selecionadas concluida.')
  }

  function handleExportSelectedOrganizations() {
    if (selectedOrganizationIds.length === 0) return
    const selectedRows = organizations.filter((organization) => selectedOrganizationIds.includes(organization.id))
    const csvLines = [
      'orgao',
      ...selectedRows.map((row) => `\"${row.name}\"`),
    ]
    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'orgaos-selecionados.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 3000)
    setFeedback('Exportacao dos orgaos selecionados concluida.')
  }

  async function handleDownloadCsvTemplate() {
    const csvLines = [
      'orgao,departamento,lotacao',
      ...IMPORT_TEMPLATE_ROWS.map((row) => [row.orgao, row.departamento, row.lotacao].map((value) => `\"${value}\"`).join(',')),
    ]
    const csvContent = `\uFEFF${csvLines.join('\n')}`
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'modelo-importacao-cadastros.csv'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(link.href), 3000)
    setFeedback('Modelo CSV baixado com sucesso.')
  }

  async function handleDownloadXlsxTemplate() {
    try {
      await exportRowsToXlsx({
        fileName: 'modelo-importacao-cadastros',
        sheetName: 'Modelo de importacao',
        columns: IMPORT_TEMPLATE_COLUMNS,
        rows: IMPORT_TEMPLATE_ROWS,
        filters: ['Campos obrigatorios: orgao, departamento e lotacao'],
      })
      setFeedback('Modelo XLSX baixado com sucesso.')
    } catch {
      setError('Nao foi possivel baixar o modelo XLSX.')
    }
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Cadastros de lotacao</h2>
          <p className="section-copy">Cadastre previamente orgaos, departamentos e lotacoes para padronizar a lotacao dos veiculos.</p>
        </div>
        <div className="actions-inline">
          <button className="ghost-button cadastros-toolbar-btn" type="button" onClick={resetForms}>Limpar formularios</button>
          <button className="ghost-button cadastros-toolbar-btn" type="button" onClick={() => setAdvancedFilterOpen(true)}>Filtros avancados</button>
          <button className="ghost-button cadastros-toolbar-btn" type="button" onClick={handleDownloadCsvTemplate}>Baixar modelo CSV</button>
          <button className="ghost-button cadastros-toolbar-btn" type="button" onClick={handleDownloadXlsxTemplate}>Baixar modelo XLSX</button>
        </div>
      </div>

      <section className="surface-panel panel-nested" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div>
            <h3 className="section-title">Estrutura organizacional (preview)</h3>
            <p className="section-copy">Visao resumida de relacionamento entre orgaos, departamentos e lotacoes.</p>
          </div>
          <button type="button" className="ghost-button cadastros-toolbar-btn" onClick={() => togglePanel('preview')}>
            {expandedPanels.preview ? 'Recolher' : 'Expandir'}
          </button>
        </div>
        {expandedPanels.preview ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Orgao</th>
                  <th>Departamentos</th>
                  <th>Lotacoes</th>
                </tr>
              </thead>
              <tbody>
                {hierarchicalPreview.length === 0 ? (
                  <tr><td colSpan={3}><div className="empty-state">Sem dados para exibir a hierarquia.</div></td></tr>
                ) : hierarchicalPreview.map((organization) => (
                  <tr key={`preview-${organization.id}`}>
                    <td>
                      <details>
                        <summary><strong>{organization.name}</strong></summary>
                        <ul style={{ marginTop: 8 }}>
                          {organization.departments.map((department) => (
                            <li key={`department-preview-${department.id}`}>
                              {department.name} ({department.allocations.length} lotacao(oes))
                            </li>
                          ))}
                        </ul>
                      </details>
                    </td>
                    <td>{organization.departmentCount}</td>
                    <td>{organization.allocationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {catalogError ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{catalogError}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="actions-inline" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          className={activeTab === 'organizations' ? 'app-button' : 'ghost-button'}
          type="button"
          onClick={() => setActiveTab('organizations')}
        >
          Orgaos ({organizations.length})
        </button>
        <button
          className={activeTab === 'departments' ? 'app-button' : 'ghost-button'}
          type="button"
          onClick={() => setActiveTab('departments')}
        >
          Departamentos ({departments.length})
        </button>
        <button
          className={activeTab === 'allocations' ? 'app-button' : 'ghost-button'}
          type="button"
          onClick={() => setActiveTab('allocations')}
        >
          Lotacoes ({allocations.length})
        </button>
      </div>

      <div className="cadastros-grid">
        <section className="surface-panel panel-nested" style={{ display: activeTab === 'organizations' ? 'block' : 'none' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Orgaos</h3>
              <p className="section-copy">Estrutura superior usada na lotacao.</p>
            </div>
            <button type="button" className="ghost-button cadastros-toolbar-btn" onClick={() => togglePanel('organizations')}>
              {expandedPanels.organizations ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          {expandedPanels.organizations ? (
            <>

          <div className="filter-inline" style={{ marginBottom: 14 }}>
            <input
              id="search-organization-input"
              className="app-input"
              placeholder="Buscar orgao por nome..."
              value={organizationSearch}
              onChange={(event) => setOrganizationSearch(event.target.value)}
            />
          </div>

          {selectedOrganizationIds.length > 0 ? (
            <div className="actions-inline" style={{ marginBottom: 12 }}>
              <span className="section-copy">{selectedOrganizationIds.length} orgao(s) selecionado(s)</span>
              <button type="button" className="ghost-button" onClick={handleExportSelectedOrganizations}>Exportar selecionados</button>
              <button type="button" className="mini-button danger" onClick={handleBulkDeleteOrganizations} disabled={bulkDeleting || !canDelete}>
                {bulkDeleting ? 'Excluindo...' : 'Excluir selecionados'}
              </button>
            </div>
          ) : null}

          {canWrite ? (
            <form onSubmit={handleSubmitOrganization} className="form-grid">
              <div className="form-field">
                <label htmlFor="organization-name">Nome do orgao</label>
                <input
                  id="organization-name"
                  className="app-input"
                  placeholder="Ex.: Secretaria de Saude"
                  value={organizationForm.name}
                  onChange={(event) => setOrganizationForm({ ...organizationForm, name: event.target.value })}
                />
              </div>
              <div className="actions-inline">
                <button className="app-button" type="submit" disabled={submitting || !organizationForm.name.trim()}>
                  {submitting ? 'Salvando...' : organizationForm.id ? 'Atualizar orgao' : 'Cadastrar orgao'}
                </button>
                {organizationForm.id ? (
                  <button className="ghost-button" type="button" onClick={() => setOrganizationForm(initialOrganizationForm)}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {canWrite ? <th>Selecao</th> : null}
                  <th>Orgao</th>
                  <th>Atualizado em</th>
                  {canWrite ? <th>Acoes</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [...Array(4)].map((_, index) => (
                    <tr key={`org-loading-${index}`}><td colSpan={canWrite ? 4 : 2}>Carregando orgaos...</td></tr>
                  ))
                ) : filteredOrganizations.length === 0 ? (
                  <tr><td colSpan={canWrite ? 4 : 2}><div className="empty-state">Nenhum orgao cadastrado.</div></td></tr>
                ) : paginatedOrganizations.map((organization) => (
                  <tr key={organization.id}>
                    {canWrite ? (
                      <td data-label="Selecao">
                        <input
                          type="checkbox"
                          checked={selectedOrganizationIds.includes(organization.id)}
                          onChange={() => toggleOrganizationSelection(organization.id)}
                          aria-label={`Selecionar orgao ${organization.name}`}
                        />
                      </td>
                    ) : null}
                    <td data-label="Orgao"><strong>{organization.name}</strong></td>
                    <td data-label="Atualizado em">{new Date(organization.updated_at).toLocaleString('pt-BR')}</td>
                    {canWrite ? (
                      <td data-label="Acoes">
                        <div className="actions-inline">
                          <button type="button" className="mini-button" onClick={() => setOrganizationForm({ id: organization.id, name: organization.name })}>Editar</button>
                          {canDelete ? (
                            <button type="button" className="mini-button danger" onClick={() => handleDelete('Orgao', organization)}>Excluir</button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite ? (
            <div className="actions-inline" style={{ marginBottom: 8 }}>
              <label className="section-copy" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={allVisibleOrganizationsSelected}
                  onChange={toggleSelectAllVisibleOrganizations}
                />
                Selecionar todos os orgaos visiveis
              </label>
            </div>
          ) : null}
          <Pagination currentPage={organizationPage} totalPages={organizationTotalPages} onPageChange={setOrganizationPage} />
            </>
          ) : null}
        </section>

        <section className="surface-panel panel-nested" style={{ display: activeTab === 'departments' ? 'block' : 'none' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Departamentos</h3>
              <p className="section-copy">Vincule o departamento ao orgao correspondente.</p>
            </div>
            <button type="button" className="ghost-button cadastros-toolbar-btn" onClick={() => togglePanel('departments')}>
              {expandedPanels.departments ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          {expandedPanels.departments ? (
            <>

          {canWrite ? (
            <form onSubmit={handleSubmitDepartment} className="form-grid">
              <div className="form-field">
                <label>Orgao</label>
                <SearchableSelect
                  value={departmentForm.organization_id}
                  onChange={(value) => setDepartmentForm({ ...departmentForm, organization_id: value })}
                  options={organizationOptions}
                  placeholder="Selecione o orgao"
                  searchPlaceholder="Buscar orgao"
                />
              </div>
              <div className="form-field">
                <label htmlFor="department-name">Nome do departamento</label>
                <input
                  id="department-name"
                  className="app-input"
                  placeholder="Ex.: Transporte Sanitario"
                  value={departmentForm.name}
                  onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })}
                />
              </div>
              <div className="actions-inline">
                <button className="app-button" type="submit" disabled={submitting || !departmentForm.organization_id || !departmentForm.name.trim()}>
                  {submitting ? 'Salvando...' : departmentForm.id ? 'Atualizar departamento' : 'Cadastrar departamento'}
                </button>
                {departmentForm.id ? (
                  <button className="ghost-button" type="button" onClick={() => setDepartmentForm(initialDepartmentForm)}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="filter-inline" style={{ marginBottom: 14 }}>
            <SearchableSelect
              value={selectedOrganizationFilter}
              onChange={(value) => {
                setSelectedOrganizationFilter(value)
                setSelectedDepartmentFilter('')
              }}
              options={[{ value: '', label: 'Todos os orgaos' }, ...organizationOptions]}
              placeholder="Filtrar orgao"
              searchPlaceholder="Buscar orgao"
            />
            <input
              id="search-department-input"
              className="app-input"
              placeholder="Buscar departamento..."
              value={departmentSearch}
              onChange={(event) => setDepartmentSearch(event.target.value)}
            />
          </div>

          {selectedDepartmentIds.length > 0 ? (
            <div className="actions-inline" style={{ marginBottom: 12 }}>
              <span className="section-copy">{selectedDepartmentIds.length} departamento(s) selecionado(s)</span>
              <button type="button" className="ghost-button" onClick={exportSelectedDepartments}>Exportar selecionados</button>
              <button type="button" className="mini-button danger" onClick={handleBulkDeleteDepartments} disabled={bulkDeleting || !canDelete}>
                {bulkDeleting ? 'Excluindo...' : 'Excluir selecionados'}
              </button>
            </div>
          ) : null}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {canWrite ? <th>Selecao</th> : null}
                  <th>Departamento</th>
                  <th>Orgao</th>
                  {canWrite ? <th>Acoes</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canWrite ? 4 : 2}>Carregando departamentos...</td></tr>
                ) : filteredDepartments.length === 0 ? (
                  <tr><td colSpan={canWrite ? 4 : 2}><div className="empty-state">Nenhum departamento encontrado.</div></td></tr>
                ) : paginatedDepartments.map((department) => (
                  <tr key={department.id}>
                    {canWrite ? (
                      <td data-label="Selecao">
                        <input
                          type="checkbox"
                          checked={selectedDepartmentIds.includes(department.id)}
                          onChange={() => toggleDepartmentSelection(department.id)}
                          aria-label={`Selecionar departamento ${department.name}`}
                        />
                      </td>
                    ) : null}
                    <td data-label="Departamento"><strong>{department.name}</strong></td>
                    <td data-label="Orgao">{department.organization_name}</td>
                    {canWrite ? (
                      <td data-label="Acoes">
                        <div className="actions-inline">
                          <button type="button" className="mini-button" onClick={() => setDepartmentForm({ id: department.id, organization_id: department.organization_id, name: department.name })}>Editar</button>
                          {canDelete ? (
                            <button type="button" className="mini-button danger" onClick={() => handleDelete('Departamento', department)}>Excluir</button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite ? (
            <div className="actions-inline" style={{ marginBottom: 8 }}>
              <label className="section-copy" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={allVisibleDepartmentsSelected}
                  onChange={toggleSelectAllVisibleDepartments}
                />
                Selecionar todos os departamentos visiveis
              </label>
            </div>
          ) : null}
          <Pagination currentPage={departmentPage} totalPages={departmentTotalPages} onPageChange={setDepartmentPage} />
            </>
          ) : null}
        </section>

        <section className="surface-panel panel-nested" style={{ display: activeTab === 'allocations' ? 'block' : 'none' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Lotacoes</h3>
              <p className="section-copy">Defina o ponto final de lotacao usado no cadastro de veiculos.</p>
            </div>
            <button type="button" className="ghost-button cadastros-toolbar-btn" onClick={() => togglePanel('allocations')}>
              {expandedPanels.allocations ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          {expandedPanels.allocations ? (
            <>

          {canWrite ? (
            <form onSubmit={handleSubmitAllocation} className="form-grid">
              <div className="form-field">
                <label>Orgao</label>
                <SearchableSelect
                  value={allocationForm.organization_id}
                  onChange={(value) => setAllocationForm({ ...allocationForm, organization_id: value, department_id: '' })}
                  options={organizationOptions}
                  placeholder="Selecione o orgao"
                  searchPlaceholder="Buscar orgao"
                />
              </div>
              <div className="form-field">
                <label>Departamento</label>
                <SearchableSelect
                  value={allocationForm.department_id}
                  onChange={(value) => setAllocationForm({ ...allocationForm, department_id: value })}
                  options={allocationDepartmentOptions}
                  placeholder={!allocationForm.organization_id ? 'Selecione primeiro o orgao' : 'Selecione o departamento'}
                  searchPlaceholder="Buscar departamento"
                  disabled={!allocationForm.organization_id}
                />
              </div>
              <div className="form-field">
                <label htmlFor="allocation-name">Nome da lotacao</label>
                <input
                  id="allocation-name"
                  className="app-input"
                  placeholder="Ex.: Garagem Central"
                  value={allocationForm.name}
                  onChange={(event) => setAllocationForm({ ...allocationForm, name: event.target.value })}
                />
              </div>
              <div className="actions-inline">
                <button
                  className="app-button"
                  type="submit"
                  disabled={submitting || !allocationForm.department_id || !allocationForm.name.trim()}
                >
                  {submitting ? 'Salvando...' : allocationForm.id ? 'Atualizar lotacao' : 'Cadastrar lotacao'}
                </button>
                {allocationForm.id ? (
                  <button className="ghost-button" type="button" onClick={() => setAllocationForm(initialAllocationForm)}>
                    Cancelar edicao
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div className="filter-inline" style={{ marginBottom: 14 }}>
            <SearchableSelect
              value={selectedOrganizationFilter}
              onChange={(value) => {
                setSelectedOrganizationFilter(value)
                setSelectedDepartmentFilter('')
              }}
              options={[{ value: '', label: 'Todos os orgaos' }, ...organizationOptions]}
              placeholder="Filtrar orgao"
              searchPlaceholder="Buscar orgao"
            />
            <SearchableSelect
              value={selectedDepartmentFilter}
              onChange={setSelectedDepartmentFilter}
              options={[
                { value: '', label: 'Todos os departamentos' },
                ...getDepartmentsByOrganization(selectedOrganizationFilter).map((department) => ({
                  value: department.id,
                  label: department.name,
                  description: department.organization_name,
                })),
              ]}
              placeholder="Filtrar departamento"
              searchPlaceholder="Buscar departamento"
            />
            <input
              id="search-allocation-input"
              className="app-input"
              placeholder="Buscar lotacao..."
              value={allocationSearch}
              onChange={(event) => setAllocationSearch(event.target.value)}
            />
          </div>

          {selectedAllocationIds.length > 0 ? (
            <div className="actions-inline" style={{ marginBottom: 12 }}>
              <span className="section-copy">{selectedAllocationIds.length} lotacao(oes) selecionada(s)</span>
              <button type="button" className="ghost-button" onClick={exportSelectedAllocations}>Exportar selecionados</button>
              <button type="button" className="mini-button danger" onClick={handleBulkDeleteAllocations} disabled={bulkDeleting || !canDelete}>
                {bulkDeleting ? 'Excluindo...' : 'Excluir selecionados'}
              </button>
            </div>
          ) : null}

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {canWrite ? <th>Selecao</th> : null}
                  <th>Lotacao</th>
                  <th>Departamento</th>
                  <th>Orgao</th>
                  {canWrite ? <th>Acoes</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canWrite ? 5 : 3}>Carregando lotacoes...</td></tr>
                ) : filteredAllocations.length === 0 ? (
                  <tr><td colSpan={canWrite ? 5 : 3}><div className="empty-state">Nenhuma lotacao encontrada.</div></td></tr>
                ) : paginatedAllocations.map((allocation) => (
                  <tr key={allocation.id}>
                    {canWrite ? (
                      <td data-label="Selecao">
                        <input
                          type="checkbox"
                          checked={selectedAllocationIds.includes(allocation.id)}
                          onChange={() => toggleAllocationSelection(allocation.id)}
                          aria-label={`Selecionar lotacao ${allocation.name}`}
                        />
                      </td>
                    ) : null}
                    <td data-label="Lotacao"><strong>{allocation.name}</strong></td>
                    <td data-label="Departamento">{allocation.department_name}</td>
                    <td data-label="Orgao">{allocation.organization_name}</td>
                    {canWrite ? (
                      <td data-label="Acoes">
                        <div className="actions-inline">
                          <button
                            type="button"
                            className="mini-button"
                            onClick={() => setAllocationForm({
                              id: allocation.id,
                              organization_id: allocation.organization_id || '',
                              department_id: allocation.department_id,
                              name: allocation.name,
                            })}
                          >
                            Editar
                          </button>
                          {canDelete ? (
                            <button type="button" className="mini-button danger" onClick={() => handleDelete('Lotacao', allocation)}>Excluir</button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite ? (
            <div className="actions-inline" style={{ marginBottom: 8 }}>
              <label className="section-copy" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={allVisibleAllocationsSelected}
                  onChange={toggleSelectAllVisibleAllocations}
                />
                Selecionar todas as lotacoes visiveis
              </label>
            </div>
          ) : null}
          <Pagination currentPage={allocationPage} totalPages={allocationTotalPages} onPageChange={setAllocationPage} />
            </>
          ) : null}
        </section>
      </div>

      <Modal
        open={Boolean(pendingDelete)}
        title="Confirmar exclusao"
        description={pendingDelete ? `Deseja realmente excluir ${pendingDelete.kind.toLowerCase()} "${pendingDelete.item.name}"?` : ''}
        onClose={() => setPendingDelete(null)}
      >
        <div className="actions-inline">
          <button type="button" className="ghost-button" onClick={() => setPendingDelete(null)}>Cancelar</button>
          <button type="button" className="mini-button danger" onClick={confirmDelete}>Sim, excluir</button>
        </div>
      </Modal>

      <Modal
        open={advancedFilterOpen}
        title="Filtros avancados de orgaos"
        description="Refine a listagem de orgaos por nome e vinculacao com departamentos."
        onClose={() => setAdvancedFilterOpen(false)}
      >
        <div className="form-grid">
          <div className="form-field">
            <label htmlFor="advanced-org-name">Nome contem</label>
            <input
              id="advanced-org-name"
              className="app-input"
              placeholder="Ex.: Secretaria"
              value={advancedOrgName}
              onChange={(event) => setAdvancedOrgName(event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="advanced-org-mode">Com departamentos</label>
            <select
              id="advanced-org-mode"
              className="app-input"
              value={advancedOrgDepartmentMode}
              onChange={(event) => setAdvancedOrgDepartmentMode(event.target.value)}
            >
              <option value="any">Qualquer</option>
              <option value="with">Somente com departamentos</option>
              <option value="without">Somente sem departamentos</option>
            </select>
          </div>
          <div className="actions-inline">
            <button type="button" className="ghost-button" onClick={() => {
              setAdvancedOrgName('')
              setAdvancedOrgDepartmentMode('any')
            }}
            >
              Limpar filtros
            </button>
            <button type="button" className="app-button" onClick={() => setAdvancedFilterOpen(false)}>Aplicar</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
