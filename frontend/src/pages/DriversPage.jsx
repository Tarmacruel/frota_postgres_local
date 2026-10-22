import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AccordionSection from '../components/AccordionSection'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import { driversAPI } from '../api/drivers'
import { useAuth } from '../context/AuthContext'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { DRIVER_LICENSE_CATEGORY_OPTIONS } from '../constants/driverCategories'
import { ResponsiveRecord, MobileFilters, ActionMenu, PageHeader, StatusChip } from '../components/ui'
import { formatCnhDate, getCnhAlert, getCnhDaysLeft } from '../utils/driverLicense'
import '../components/DriverLicenseNotice.css'

const initialForm = {
  nome_completo: '',
  documento: '',
  matricula: '',
  organization_id: '',
  contato: '',
  email: '',
  cnh_categoria: 'B',
  cnh_numero: '',
  cnh_validade: '',
}

function formatDate(value) {
  if (!value) return '-'
  return formatCnhDate(value)
}

function getDaysToExpire(cnhDate) {
  return getCnhDaysLeft(cnhDate)
}

export default function DriversPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const editId = searchParams.get('editar')
  const regularizingCnh = searchParams.get('regularizar') === 'cnh'
  const cnhNumberRef = useRef(null)
  const { canCreate, canEdit, canDeleteModule } = useAuth()
  const canCreateDriver = canCreate('drivers')
  const canEditDriver = canEdit('drivers')
  const canDeleteDriver = canDeleteModule('drivers')
  const canManageDriverActions = canEditDriver || canDeleteDriver
  const [records, setRecords] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 10 })
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('ATIVOS')
  const [organizationFilter, setOrganizationFilter] = useState('TODAS')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [openingEdit, setOpeningEdit] = useState(false)
  const [editRetry, setEditRetry] = useState(0)
  const { organizations, loading: catalogLoading, error: catalogError } = useMasterDataCatalog({ includeAll: true })

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
  }))

  const exportColumns = [
    { header: 'Nome completo', value: (item) => item.nome_completo },
    { header: 'Documento', value: (item) => item.documento },
    { header: 'Matrícula', value: (item) => item.matricula || 'Não informada' },
    { header: 'Secretaria', value: (item) => item.organization_name || 'Não informada' },
    { header: 'Contato', value: (item) => item.contato || '-' },
    { header: 'E-mail', value: (item) => item.email || '-' },
    { header: 'CNH', value: (item) => item.cnh_categoria },
    { header: 'Número da CNH', value: (item) => item.cnh_numero || 'Não informado' },
    { header: 'Validade CNH', value: (item) => formatDate(item.cnh_validade) },
    { header: 'Status', value: (item) => (item.ativo ? 'ATIVO' : 'INATIVO') },
  ]

  async function loadDrivers(page = pagination.page) {
    try {
      setLoading(true)
      setError('')
      const { data } = await driversAPI.list({
        page,
        limit: 10,
        search: search || undefined,
        active: activeFilter === 'TODOS' ? undefined : activeFilter === 'ATIVOS',
        organization_id: organizationFilter === 'TODAS' ? undefined : organizationFilter,
      })
      setRecords(data.data)
      setPagination(data.pagination)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar os condutores.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDrivers(1)
  }, [search, activeFilter, organizationFilter])

  function openCreateModal() {
    setError('')
    setEditingRecord(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  const openEditModal = useCallback((record) => {
    setError('')
    setEditingRecord(record)
    setForm({
      nome_completo: record.nome_completo,
      documento: record.documento,
      matricula: record.matricula || '',
      organization_id: record.organization_id || '',
      contato: record.contato || '',
      email: record.email || '',
      cnh_categoria: record.cnh_categoria,
      cnh_numero: record.cnh_numero || '',
      cnh_validade: record.cnh_validade || '',
    })
    setIsModalOpen(true)
  }, [])

  useEffect(() => {
    if (!editId) { setOpeningEdit(false); return undefined }
    if (!canEditDriver) {
      setError('Você não tem permissão para editar condutores. Solicite a regularização a um usuário autorizado.')
      return undefined
    }
    let cancelled = false
    setError(''); setOpeningEdit(true); setIsModalOpen(true)
    driversAPI.getById(editId).then(({ data }) => {
      if (!cancelled) openEditModal(data)
    }).catch((err) => {
      if (!cancelled) { setIsModalOpen(false); setError(getApiErrorMessage(err, 'Não foi possível abrir o cadastro do condutor.')) }
    }).finally(() => { if (!cancelled) setOpeningEdit(false) })
    return () => { cancelled = true }
  }, [editId, canEditDriver, openEditModal, editRetry])

  function closeModal() {
    setEditingRecord(null)
    setForm(initialForm)
    setIsModalOpen(false)
    if (editId) {
      const next = new URLSearchParams(searchParams)
      next.delete('editar'); next.delete('regularizar')
      setSearchParams(next, { replace: true })
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!form.matricula.trim()) {
      setError('Informe a matrícula do condutor para prosseguir.')
      return
    }
    if ((editingRecord && !canEditDriver) || (!editingRecord && !canCreateDriver)) {
      setError('Você não tem permissão para salvar condutores.')
      return
    }
    if (!form.organization_id) {
      setError('Selecione a secretaria do condutor.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      const payload = {
        ...form,
        matricula: form.matricula.trim(),
        contato: form.contato || null,
        email: form.email || null,
        cnh_validade: form.cnh_validade || null,
        cnh_numero: form.cnh_numero.trim() || null,
      }
      if (editingRecord) {
        await driversAPI.update(editingRecord.id, payload)
        setFeedback(regularizingCnh ? 'Condutor atualizado com sucesso. Volte à aba da operação; o cadastro será atualizado ao retornar.' : 'Condutor atualizado com sucesso.')
      } else {
        await driversAPI.create(payload)
        setFeedback('Condutor cadastrado com sucesso.')
      }
      closeModal()
      await loadDrivers(editingRecord ? pagination.page : 1)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o condutor.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeactivate(record) {
    if (!window.confirm(`Inativar o condutor ${record.nome_completo}?`)) return
    try {
      await driversAPI.remove(record.id)
      setFeedback('Condutor inativado com sucesso.')
      await loadDrivers(pagination.page)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível inativar o condutor.'))
    }
  }

  async function handlePreviewPdf() {
    if (!records.length) return
    await previewRowsToPdf({
      title: 'Frota PMTF - Condutores cadastrados',
      fileName: 'frota-pmtf-condutores-cadastrados',
      subtitle: 'Relatório da página atual dos condutores cadastrados.',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: activeFilter },
        {
          label: 'Secretaria',
          value:
            organizationFilter === 'TODAS'
              ? 'Todas as secretarias'
              : organizations.find((organization) => organization.id === organizationFilter)?.name || organizationFilter,
        },
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  async function handleExportXlsx() {
    if (!records.length) return
    await exportRowsToXlsx({
      fileName: 'frota-pmtf-condutores-cadastrados',
      sheetName: 'Condutores',
      columns: exportColumns,
      rows: records,
      filters: [
        { label: 'Status', value: activeFilter },
        {
          label: 'Secretaria',
          value:
            organizationFilter === 'TODAS'
              ? 'Todas as secretarias'
              : organizations.find((organization) => organization.id === organizationFilter)?.name || organizationFilter,
        },
        ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
      ],
    })
  }

  return (
    <div className="surface-panel operation-page operation-page--drivers">
      <PageHeader
        title="Condutores cadastrados"
        description="Mantenha a base reutilizável de condutores para posse, busca e futuros módulos operacionais."
        actions={(
          <>
          {canCreateDriver ? <button className="app-button" type="button" onClick={openCreateModal}>Novo condutor</button> : null}
          <button className="secondary-button" type="button" onClick={handlePreviewPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
          </>
        )}
      />

      <div className="toolbar-card operation-toolbar">
        <div className="toolbar-row">
          <div className="status-pills">
            {['ATIVOS', 'TODOS', 'INATIVOS'].map((option) => (
              <button key={option} type="button" className={`status-pill${activeFilter === option ? ' active' : ''}`} onClick={() => setActiveFilter(option)}>
                {option}
              </button>
            ))}
          </div>
          <div className="filter-inline">
            <input className="app-input" placeholder="Buscar por nome, matrícula, documento ou secretaria" value={search} onChange={(event) => setSearch(event.target.value)} />
            <MobileFilters activeCount={organizationFilter !== 'TODAS' ? 1 : 0}>
            <select className="app-select" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
              <option value="TODAS">Todas as secretarias</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.name}</option>
              ))}
            </select>
            </MobileFilters>
          </div>
        </div>
      </div>

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{pagination.total}</strong>
          <span>condutores no filtro</span>
        </div>
        <div className="metric-inline">
          <strong>{records.filter((item) => { const days = getDaysToExpire(item.cnh_validade); return days !== null && days < 0 }).length}</strong>
          <span>CNHs vencidas</span>
        </div>
        <div className="metric-inline">
          <strong>{records.filter((item) => {
            const days = getDaysToExpire(item.cnh_validade)
            return days !== null && days >= 0 && days <= 30
          }).length}</strong>
          <span>CNHs em até 30 dias</span>
        </div>
        <div className="metric-inline">
          <strong>{records.filter((item) => {
            const days = getDaysToExpire(item.cnh_validade)
            return days !== null && days > 30 && days <= 60
          }).length}</strong>
          <span>CNHs em até 60 dias</span>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {editId && canEditDriver && error && !isModalOpen ? <button type="button" className="ghost-button" onClick={() => setEditRetry((value) => value + 1)}>Tentar abrir cadastro novamente</button> : null}
      {catalogError ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{catalogError}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested operation-table-card">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide operation-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Documento</th>
                <th>Matrícula</th>
                <th>Secretaria</th>
                <th>Contato</th>
                <th>E-mail</th>
                <th>CNH</th>
                <th>Alerta CNH</th>
                <th>Status</th>
                {canManageDriverActions ? <th>Ações</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canManageDriverActions ? 10 : 9} className="muted">Carregando condutores...</td></tr>
              ) : !records.length ? (
                <tr><td colSpan={canManageDriverActions ? 10 : 9}><div className="empty-state">Nenhum condutor encontrado para o filtro atual.</div></td></tr>
              ) : (
                records.map((record) => {
                  const cnhAlerts = getCnhAlert(record)
                  return (
                  <ResponsiveRecord key={record.id} label={record.nome_completo} identityLabel="Nome" summaryLabels={['Secretaria', ...(cnhAlerts.length ? ['Alerta CNH'] : [])]}>
                    <td data-label="Nome"><strong>{record.nome_completo}</strong></td>
                    <td data-label="Documento">{record.documento}</td>
                    <td data-label="Matrícula">{record.matricula || 'Não informada'}</td>
                    <td data-label="Secretaria">{record.organization_name || 'Não informada'}</td>
                    <td data-label="Contato">{record.contato || '-'}</td>
                    <td data-label="E-mail">{record.email || '-'}</td>
                    <td data-label="CNH"><div className="driver-license-detail"><span>Nº {record.cnh_numero || 'Não informado'}</span><span>Categoria {record.cnh_categoria} · Validade {formatDate(record.cnh_validade)}</span></div></td>
                    <td data-label="Alerta CNH">
                      {cnhAlerts.length ? <div className="driver-license-status">{cnhAlerts.map((alert) => <StatusChip key={alert.code} tone={alert.tone}>{alert.label}</StatusChip>)}</div> : '-'}
                    </td>
                    <td data-label="Status"><StatusChip tone={record.ativo ? 'success' : 'neutral'}>{record.ativo ? 'ATIVO' : 'INATIVO'}</StatusChip></td>
                    {canManageDriverActions ? (
                      <td data-label="Ações">
                        <div className="operation-row-actions">
                          <ActionMenu
                            label={`Mais ações do condutor ${record.nome_completo}`}
                            items={[
                              { key: 'edit', label: 'Editar', icon: 'catalog', hidden: !canEditDriver, onClick: () => openEditModal(record) },
                              { key: 'deactivate', label: 'Inativar', icon: 'close', tone: 'danger', hidden: !canDeleteDriver || !record.ativo, onClick: () => handleDeactivate(record) },
                            ]}
                          />
                        </div>
                      </td>
                    ) : null}
                  </ResponsiveRecord>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadDrivers} />

      <Modal
        open={isModalOpen}
        title={openingEdit ? 'Carregando condutor' : editingRecord ? 'Editar condutor' : 'Novo condutor'}
        description="Agrupe os dados em blocos simples para manter o cadastro mais limpo e escalável."
        onClose={closeModal}
        canClose={!submitting}
        initialFocusRef={regularizingCnh && !openingEdit ? cnhNumberRef : undefined}
      >
        {openingEdit ? <p role="status">Carregando o cadastro do condutor…</p> : <form onSubmit={handleSubmit} className="stack">
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <AccordionSection title="Dados básicos" subtitle="Identificação e contato" open>
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label htmlFor="driver-name">Nome completo</label>
                <input id="driver-name" className="app-input" value={form.nome_completo} onChange={(event) => setForm({ ...form, nome_completo: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="driver-document">Documento</label>
                <input id="driver-document" className="app-input" value={form.documento} onChange={(event) => setForm({ ...form, documento: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="driver-registration">Matrícula (obrigatória)</label>
                <input id="driver-registration" className="app-input" required maxLength={30} value={form.matricula} onChange={(event) => setForm({ ...form, matricula: event.target.value })} />
              </div>
              <div className="form-field modal-field-span">
                <label>Secretaria</label>
                <SearchableSelect
                  value={form.organization_id}
                  onChange={(value) => setForm({ ...form, organization_id: value })}
                  options={organizationOptions}
                  placeholder={catalogLoading ? 'Carregando secretarias...' : 'Selecione a secretaria'}
                  searchPlaceholder="Buscar secretaria"
                  disabled={catalogLoading || organizationOptions.length === 0}
                />
              </div>
              <div className="form-field">
                <label htmlFor="driver-contact">Contato</label>
                <input id="driver-contact" className="app-input" value={form.contato} onChange={(event) => setForm({ ...form, contato: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="driver-email">E-mail</label>
                <input id="driver-email" className="app-input" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </div>
            </div>
          </AccordionSection>

          <AccordionSection title="CNH" subtitle="Número, categoria e vencimento" open={regularizingCnh || !editingRecord}>
            <div className="form-grid modal-form-grid">
              <div className="form-field">
                <label htmlFor="driver-license-number">Número da CNH</label>
                <input ref={cnhNumberRef} id="driver-license-number" type="text" inputMode="numeric" autoComplete="off" maxLength={30} className="app-input" value={form.cnh_numero} onChange={(event) => setForm({ ...form, cnh_numero: event.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="driver-license">Categoria</label>
                <select id="driver-license" className="app-select" value={form.cnh_categoria} onChange={(event) => setForm({ ...form, cnh_categoria: event.target.value })}>
                  {DRIVER_LICENSE_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="driver-expiry">Validade da CNH</label>
                <input id="driver-expiry" type="date" className="app-input" value={form.cnh_validade} onChange={(event) => setForm({ ...form, cnh_validade: event.target.value })} />
              </div>
            </div>
          </AccordionSection>

          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : editingRecord ? 'Atualizar condutor' : 'Cadastrar condutor'}</button>
            <button className="ghost-button" type="button" disabled={submitting} onClick={closeModal}>Cancelar</button>
          </div>
        </form>}
      </Modal>
    </div>
  )
}
