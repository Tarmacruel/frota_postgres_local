import { useEffect, useMemo, useState } from 'react'
import SearchableSelect from '../components/SearchableSelect'
import Pagination from '../components/Pagination'
import { masterDataAPI } from '../api/masterData'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx } from '../utils/exportData'

const initialOrganizationForm = { id: null, name: '' }
const initialDepartmentForm = { id: null, organization_id: '', name: '' }
const initialAllocationForm = { id: null, organization_id: '', department_id: '', name: '' }
const PAGE_SIZE = 8

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
  const [organizationPage, setOrganizationPage] = useState(1)
  const [departmentPage, setDepartmentPage] = useState(1)
  const [allocationPage, setAllocationPage] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const importTemplateColumns = [
    { header: 'orgao', value: (row) => row.orgao },
    { header: 'departamento', value: (row) => row.departamento },
    { header: 'lotacao', value: (row) => row.lotacao },
  ]
  const importTemplateRows = [
    { orgao: 'Secretaria de Saude', departamento: 'Transporte Sanitario', lotacao: 'Garagem Central' },
    { orgao: 'Secretaria de Educacao', departamento: 'Transporte Escolar', lotacao: 'Garagem Norte' },
  ]

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
    if (!normalizedSearch) return organizations
    return organizations.filter((organization) => organization.name.toLowerCase().includes(normalizedSearch))
  }, [organizations, organizationSearch])

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

  function resetForms() {
    setOrganizationForm(initialOrganizationForm)
    setDepartmentForm(initialDepartmentForm)
    setAllocationForm(initialAllocationForm)
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
    if (!window.confirm(`Excluir ${kind.toLowerCase()} ${item.name}?`)) return

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
      await reload()
    } catch (err) {
      setError(getApiErrorMessage(err, `Nao foi possivel remover ${kind.toLowerCase()}.`))
    }
  }

  async function handleDownloadCsvTemplate() {
    const csvLines = [
      'orgao,departamento,lotacao',
      ...importTemplateRows.map((row) => [row.orgao, row.departamento, row.lotacao].map((value) => `\"${value}\"`).join(',')),
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
        columns: importTemplateColumns,
        rows: importTemplateRows,
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
          <button className="ghost-button" type="button" onClick={resetForms}>Limpar formularios</button>
          <button className="ghost-button" type="button" onClick={handleDownloadCsvTemplate}>Baixar modelo CSV</button>
          <button className="ghost-button" type="button" onClick={handleDownloadXlsxTemplate}>Baixar modelo XLSX</button>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{organizations.length}</strong>
          <span>orgaos</span>
        </div>
        <div className="metric-inline">
          <strong>{departments.length}</strong>
          <span>departamentos</span>
        </div>
        <div className="metric-inline">
          <strong>{allocations.length}</strong>
          <span>lotacoes</span>
        </div>
      </div>

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

      <div className="panel-grid cadastros-grid">
        <section className="surface-panel panel-nested" style={{ display: activeTab === 'organizations' ? 'block' : 'none' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Orgaos</h3>
              <p className="section-copy">Estrutura superior usada na lotacao.</p>
            </div>
          </div>

          <div className="filter-inline" style={{ marginBottom: 14 }}>
            <input
              className="app-input"
              placeholder="Buscar orgao por nome..."
              value={organizationSearch}
              onChange={(event) => setOrganizationSearch(event.target.value)}
            />
          </div>

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
                  <th>Orgao</th>
                  <th>Atualizado em</th>
                  {canWrite ? <th>Acoes</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canWrite ? 3 : 2}>Carregando orgaos...</td></tr>
                ) : filteredOrganizations.length === 0 ? (
                  <tr><td colSpan={canWrite ? 3 : 2}><div className="empty-state">Nenhum orgao cadastrado.</div></td></tr>
                ) : paginatedOrganizations.map((organization) => (
                  <tr key={organization.id}>
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
          <Pagination currentPage={organizationPage} totalPages={organizationTotalPages} onPageChange={setOrganizationPage} />
        </section>

        <section className="surface-panel panel-nested" style={{ display: activeTab === 'departments' ? 'block' : 'none' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Departamentos</h3>
              <p className="section-copy">Vincule o departamento ao orgao correspondente.</p>
            </div>
          </div>

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
              className="app-input"
              placeholder="Buscar departamento..."
              value={departmentSearch}
              onChange={(event) => setDepartmentSearch(event.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Departamento</th>
                  <th>Orgao</th>
                  {canWrite ? <th>Acoes</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canWrite ? 3 : 2}>Carregando departamentos...</td></tr>
                ) : filteredDepartments.length === 0 ? (
                  <tr><td colSpan={canWrite ? 3 : 2}><div className="empty-state">Nenhum departamento encontrado.</div></td></tr>
                ) : paginatedDepartments.map((department) => (
                  <tr key={department.id}>
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
          <Pagination currentPage={departmentPage} totalPages={departmentTotalPages} onPageChange={setDepartmentPage} />
        </section>

        <section className="surface-panel panel-nested" style={{ display: activeTab === 'allocations' ? 'block' : 'none' }}>
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Lotacoes</h3>
              <p className="section-copy">Defina o ponto final de lotacao usado no cadastro de veiculos.</p>
            </div>
          </div>

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
              className="app-input"
              placeholder="Buscar lotacao..."
              value={allocationSearch}
              onChange={(event) => setAllocationSearch(event.target.value)}
            />
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lotacao</th>
                  <th>Departamento</th>
                  <th>Orgao</th>
                  {canWrite ? <th>Acoes</th> : null}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={canWrite ? 4 : 3}>Carregando lotacoes...</td></tr>
                ) : filteredAllocations.length === 0 ? (
                  <tr><td colSpan={canWrite ? 4 : 3}><div className="empty-state">Nenhuma lotacao encontrada.</div></td></tr>
                ) : paginatedAllocations.map((allocation) => (
                  <tr key={allocation.id}>
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
          <Pagination currentPage={allocationPage} totalPages={allocationTotalPages} onPageChange={setAllocationPage} />
        </section>
      </div>
    </div>
  )
}
