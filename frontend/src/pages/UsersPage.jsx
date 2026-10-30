import { officialBrand } from '../constants/officialBrand'
import { useAuth } from '../context/AuthContext'
import GuidedForm, { FormSection as GuidedSection } from '../components/GuidedForm'
import IndicatorBar from '../components/ui/IndicatorBar'
import { useInteractiveKpis } from '../hooks/useInteractiveKpis'
import StatusChip from '../components/ui/StatusChip'
import PageHeader from '../components/ui/PageHeader'
import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
import { getCpfError } from '../utils/cpf'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { PERMISSION_ACTIONS, PERMISSION_MODULES, normalizePermissions } from '../utils/permissions'
import { getRoleLabel } from '../utils/roles'

const initialForm = {
  name: '',
  email: '',
  cpf: '',
  organization_id: '',
  password: '',
  role: 'PADRAO',
}

const scopedRoleOptions = ['ADMIN', 'PRODUCAO', 'POSTO', 'PADRAO']

const requiredProfileView = (module, action, role) => role === 'ADMIN' && action === 'view' && ['analytics', 'payment_processes'].includes(module)

function permissionExceedsPossessionCeiling(moduleKey, actionKey, role) {
  if (role === 'SUPERUSER') return true
  if (role === 'POSTO') return moduleKey !== 'fuel_supply_orders' || !['view', 'edit'].includes(actionKey)
  if (requiredProfileView(moduleKey, actionKey, role)) return true
  if (moduleKey === 'vehicle_loans') return actionKey === 'delete' || !['ADMIN', 'PRODUCAO'].includes(role)
  if (moduleKey !== 'possession') return false
  if (actionKey === 'delete') return true
  if (role === 'PADRAO') return actionKey !== 'view'
  if (role === 'POSTO') return true
  return false
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

export default function UsersPage() {
  const { isSuperUser, user: actor } = useAuth()
  const roleOptions = isSuperUser ? ['SUPERUSER', ...scopedRoleOptions] : scopedRoleOptions
  const { selected: indicator, metadata: indicatorMetadata, setMetadata: setIndicators, select: selectIndicator } = useInteractiveKpis()

  const [users, setUsers] = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const requestId = useRef(0)
  const [form, setForm] = useState(() => ({ ...initialForm, organization_id: isSuperUser ? '' : actor?.organization_id || '' }))
  const [editingUser, setEditingUser] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('TODOS')
  const [organizationFilter, setOrganizationFilter] = useState('TODAS')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [cpfError, setCpfError] = useState('')
  const [permissionsError, setPermissionsError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false)
  const [permissionsUser, setPermissionsUser] = useState(null)
  const [permissionsForm, setPermissionsForm] = useState(() => normalizePermissions())
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permissionsSaving, setPermissionsSaving] = useState(false)
  const { organizations, loading: catalogLoading, error: catalogError } = useMasterDataCatalog({ organizationsOnly: true })

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
  }))

  const filteredUsers = users

  const queryParams = useCallback((page = 1, limit = 10) => ({ indicator: indicator === 'total' ? undefined : indicator,
      page, limit, search: search.trim() || undefined,
      role: roleFilter !== 'TODOS' ? roleFilter : undefined,
      organization_id: !['TODAS', 'SEM_SECRETARIA'].includes(organizationFilter) ? organizationFilter : undefined,
      without_organization: organizationFilter === 'SEM_SECRETARIA' || undefined,
  }), [search, roleFilter, organizationFilter, indicator])

  async function allFilteredUsers() {
    const records = []
    let page = 1
    let pages
    do {
      const { data } = await api.get('/users/paginated', { params: queryParams(page, 200) })
      records.push(...data.data)
      pages = data.pagination.pages
      page += 1
    } while (page <= pages)
    return records
  }

  const exportColumns = [
    { header: 'Nome', value: (user) => user.name },
    { header: 'E-mail', value: (user) => user.email },
    { header: 'CPF', value: (user) => user.cpf_masked || 'Pendente' },
    { header: 'Secretaria', value: (user) => user.organization_name || 'Não informada' },
    { header: 'Perfil', value: (user) => getRoleLabel(user.role) },
    { header: 'Senha', value: (user) => (user.must_change_password ? 'Troca pendente' : 'Regularizada') },
    { header: 'Criado em', value: (user) => formatDate(user.created_at) },
    { header: 'Atualizado em', value: (user) => formatDate(user.updated_at) },
  ]

  const loadUsers = useCallback(async (page = 1) => {
    const currentRequest = ++requestId.current
    try {
      setLoading(true)
      setError('')
      const { data } = await api.get('/users/paginated', { params: queryParams(page) })
      if (currentRequest !== requestId.current) return
      setUsers(data.data || [])
      setPagination(data.pagination || { page, pages: 1, total: data.data?.length || 0 }); setIndicators(data.indicators || null)
      if (page > 1 && page > (data.pagination?.pages || 1)) loadUsers(data.pagination.pages)
    } catch (err) {
      if (currentRequest === requestId.current) setError(getApiErrorMessage(err, 'Não foi possível carregar os usuários.'))
    } finally {
      if (currentRequest === requestId.current) setLoading(false)
    }
  }, [queryParams, setIndicators])

  useEffect(() => {
    loadUsers(1)
  }, [loadUsers])

  function openCreateModal() {
    setCpfError('')
    setFormError('')
    setEditingUser(null)
    setForm({ ...initialForm, organization_id: isSuperUser ? '' : actor?.organization_id || '' })
    setIsModalOpen(true)
  }

  function openEditModal(user) {
    setCpfError('')
    setFormError('')
    setEditingUser(user)
    setForm({
      name: user.name,
      email: user.email,
      cpf: '',
      organization_id: user.organization_id || '',
      password: '',
      role: user.role,
    })
    setIsModalOpen(true)
  }

  function closeModal() {
    setCpfError('')
    setFormError('')
    setEditingUser(null)
    setForm({ ...initialForm, organization_id: isSuperUser ? '' : actor?.organization_id || '' })
    setIsModalOpen(false)
  }

  function closePermissionsModal() {
    setPermissionsModalOpen(false)
    setPermissionsUser(null)
    setPermissionsForm(normalizePermissions())
  }

  async function openPermissionsModal(user) {
    setPermissionsError('')
    setPermissionsUser(user)
    setPermissionsForm(normalizePermissions(user.permissions))
    setPermissionsModalOpen(true)
    try {
      setPermissionsLoading(true)
      setError('')
      const { data } = await api.get(`/users/${user.id}/permissions`)
      setPermissionsForm(normalizePermissions(data.permissions))
    } catch (err) {
      setPermissionsError(getApiErrorMessage(err, 'Não foi possível carregar as permissões do usuário.'))
    } finally {
      setPermissionsLoading(false)
    }
  }

  function togglePermission(moduleKey, field) {
    setPermissionsForm((current) => ({
      ...current,
      [moduleKey]: {
        ...current[moduleKey],
        [field]: !current[moduleKey]?.[field],
      },
    }))
  }

  function setModulePermissions(moduleKey, value) {
    setPermissionsForm((current) => ({
      ...current,
      [moduleKey]: PERMISSION_ACTIONS.reduce((flags, action) => {
        flags[action.field] = requiredProfileView(moduleKey, action.key, permissionsUser?.role) || value && !permissionExceedsPossessionCeiling(moduleKey, action.key, permissionsUser?.role)
        return flags
      }, {}),
    }))
  }

  async function savePermissions() {
    if (!permissionsUser) return
    setPermissionsError('')
    try {
      setPermissionsSaving(true)
      setError('')
      setFeedback('')
      await api.put(`/users/${permissionsUser.id}/permissions`, { permissions: permissionsForm })
      setFeedback(`Permissões de ${permissionsUser.name} atualizadas com sucesso.`)
      closePermissionsModal()
      await loadUsers(pagination.page)
    } catch (err) {
      setPermissionsError(getApiErrorMessage(err, 'Não foi possível salvar as permissões do usuário.'))
    } finally {
      setPermissionsSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setFormError('')
    setCpfError('')
    if (!editingUser && !form.cpf.trim()) {
      setFormError('Informe o CPF do usuário com os 11 números do documento.')
      return
    }
    if (form.cpf.trim()) {
      const message = getCpfError(form.cpf)
      if (message) {
        setCpfError(message)
        setFormError(message)
        document.getElementById('user-cpf')?.focus()
        return
      }
    }
    if (!form.organization_id) {
      setFormError('Selecione a secretaria do usuário na lista.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      setFeedback('')

      if (editingUser) {
        const payload = {
          name: form.name,
          email: form.email,
          organization_id: form.organization_id,
          role: form.role,
        }
        if (form.cpf.trim()) payload.cpf = form.cpf
        if (form.password.trim()) payload.password = form.password
        await api.put(`/users/${editingUser.id}`, payload)
        setFeedback('Usuário atualizado com sucesso.')
      } else {
        await api.post('/users', { ...form, organization_id: form.organization_id })
        setFeedback('Usuário criado com sucesso.')
      }

      closeModal()
      await loadUsers(pagination.page)
    } catch (err) {
      setFormError(getApiErrorMessage(err, 'Não foi possível salvar o usuário. Tente novamente.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Excluir o usuário ${user.email}?`)) return

    try {
      setError('')
      setFeedback('')
      await api.delete(`/users/${user.id}`)
      setFeedback('Usuário removido com sucesso.')
      await loadUsers(pagination.page)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível excluir o usuário.'))
    }
  }

  async function handleExportPdf() {
    if (pagination.total === 0) {
      setFeedback('Não há usuários filtrados para pré-visualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const reportRows = await allFilteredUsers()
      await previewRowsToPdf({
        title: `${officialBrand.systemName} - Usuários`,
        fileName: 'frota-pmtf-usuários',
        subtitle: 'Relatório dos perfis administrativos, de produção, posto e consulta.',
        columns: exportColumns,
        rows: reportRows,
        filters: [
          { label: 'Perfil', value: roleFilter === 'TODOS' ? 'Todos os perfis' : getRoleLabel(roleFilter) },
          {
            label: 'Secretaria',
            value:
              organizationFilter === 'TODAS'
                ? 'Todas as secretarias'
                : organizationFilter === 'SEM_SECRETARIA'
                  ? 'Não informada'
                  : organizations.find((organization) => organization.id === organizationFilter)?.name || organizationFilter,
          },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Pré-visualização do PDF de usuários aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível gerar o PDF dos usuários.'))
    }
  }

  async function handleExportXlsx() {
    if (pagination.total === 0) {
      setFeedback('Não há usuários filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      const reportRows = await allFilteredUsers()
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-usuários',
        sheetName: 'Usuários',
        columns: exportColumns,
        rows: reportRows,
        filters: [
          { label: 'Perfil', value: roleFilter === 'TODOS' ? 'Todos os perfis' : getRoleLabel(roleFilter) },
          {
            label: 'Secretaria',
            value:
              organizationFilter === 'TODAS'
                ? 'Todas as secretarias'
                : organizationFilter === 'SEM_SECRETARIA'
                  ? 'Não informada'
                  : organizations.find((organization) => organization.id === organizationFilter)?.name || organizationFilter,
          },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportação de usuários em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível exportar os usuários em XLSX.'))
    }
  }

  function clearFilters() {
    setSearch('')
    setRoleFilter('TODOS')
    setOrganizationFilter('TODAS')
  }

  return (
    <div className="surface-panel operation-page management-page management-page--users">
      <PageHeader
        title="Gestão de usuários"
        description={isSuperUser ? "Administração de todas as secretarias" : `Secretaria: ${actor?.organization_name || "Vínculo pendente — solicite a configuração ao superusuário"}`}
        actions={<>
          <button className="app-button" type="button" onClick={openCreateModal}>Novo usuário</button>
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </>}
      />

      <div className="toolbar-row operation-toolbar">
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por nome, e-mail, CPF, secretaria ou perfil"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-select" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
            <option value="TODAS">{isSuperUser ? "Todas as secretarias" : "Minha secretaria"}</option>
            {isSuperUser ? <option value="SEM_SECRETARIA">Sem secretaria</option> : null}
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
          <select className="app-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="TODOS">Todos os perfis</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>{getRoleLabel(role)}</option>
            ))}
          </select>
          <button className="ghost-button" type="button" onClick={clearFilters}>Limpar filtros</button>
        </div>
      </div>

      <IndicatorBar state={{ selected: indicator, metadata: indicatorMetadata, select: selectIndicator }} loading={loading} error={error} resultCount={pagination.total} />

      {error && !isModalOpen ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {catalogError ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{catalogError}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide management-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>CPF</th>
                <th>Secretaria</th>
                <th>Perfil</th>
                <th>Senha</th>
                <th>Criado em</th>
                <th>Atualizado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="9" className="muted">Carregando usuários...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="9">
                    <div className="empty-state">Nenhum usuário encontrado para os filtros aplicados.</div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td data-label="Nome">
                      <div className="stack">
                        <strong>{user.name}</strong>
                        <span className="muted">Atualizado em {formatDate(user.updated_at)}</span>
                      </div>
                    </td>
                    <td data-label="E-mail">{user.email}</td>
                    <td data-label="CPF">{user.cpf_masked || 'Pendente'}</td>
                    <td data-label="Secretaria">{user.organization_name || 'Não informada'}</td>
                    <td data-label="Perfil">
                      <StatusChip tone={['ADMIN', 'SUPERUSER'].includes(user.role) ? 'success' : user.role === 'PRODUCAO' ? 'info' : user.role === 'POSTO' ? 'warning' : 'neutral'}>
                        {getRoleLabel(user.role)}
                      </StatusChip>
                    </td>
                    <td data-label="Senha">
                      <StatusChip tone={user.must_change_password ? 'warning' : 'success'}>
                        {user.must_change_password ? 'Troca pendente' : 'Regularizada'}
                      </StatusChip>
                    </td>
                    <td data-label="Criado em">{formatDate(user.created_at)}</td>
                    <td data-label="Atualizado em">{formatDate(user.updated_at)}</td>
                    <td data-label="Ações">
                      <div className="actions-inline">
                        <button type="button" className="mini-button" onClick={() => openEditModal(user)}>Editar</button>
                        <button type="button" className="mini-button" onClick={() => openPermissionsModal(user)}>Permissões</button>
                        <button type="button" className="mini-button danger" onClick={() => handleDelete(user)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination currentPage={pagination.page} totalPages={pagination.pages} onPageChange={loadUsers} />

      <Modal
        open={isModalOpen}
        title={editingUser ? 'Editar usuário' : 'Novo usuário'}
        description="Defina o perfil correto para cada pessoa: administração total, operação de produção, posto credenciado ou consulta."
        onClose={closeModal}
        canClose={!submitting}
      >
        {formError ? <div role="alert" className="alert alert-error" style={{ marginBottom: 16 }}>{formError}</div> : null}
        {catalogError ? <div role="alert" className="alert alert-error" style={{ marginBottom: 16 }}>{catalogError}</div> : null}
        <GuidedForm busy={submitting} onSubmit={handleSubmit} className="form-grid modal-form-grid">
          <GuidedSection title="Identificação" description="Confira os dados de identificação do usuário.">
<div className="form-field modal-field-span">
            <label htmlFor="user-name">Nome completo</label>
            <input required
              id="user-name"
              className="app-input"
              placeholder="Nome do servidor"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="user-email">E-mail</label>
            <input required
              id="user-email"
              className="app-input"
              placeholder="usuario@frota.local"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="user-cpf">{editingUser ? 'Substituir CPF (opcional)' : 'CPF'}</label>
            <input required={!editingUser} data-required-message="Informe o CPF do usuário com os 11 números do documento."
              id="user-cpf"
              className="app-input"
              placeholder={editingUser ? (editingUser.cpf_masked || 'Preencha somente para substituir') : '000.000.000-00'}
              value={form.cpf}
              onChange={(event) => {
                setForm({ ...form, cpf: event.target.value })
                if (cpfError) {
                  setCpfError('')
                  setFormError('')
                }
              }}
              aria-invalid={Boolean(cpfError)}
              aria-describedby={cpfError ? 'user-cpf-error' : undefined}
              inputMode="numeric"
            />
            {cpfError ? <span id="user-cpf-error" style={{ color: 'var(--danger)' }}>{cpfError}</span> : null}
          </div>

</GuidedSection>
<GuidedSection title="Acesso" description="Confira a secretaria, o perfil e os dados de acesso. As permissões existentes serão mantidas.">
<div className="form-field">
            <label htmlFor="user-password">{editingUser ? 'Redefinir senha provisória (opcional)' : 'Senha provisória'}</label>
            <input required={!editingUser} minLength={8}
              id="user-password"
              className="app-input"
              type="password"
              placeholder={editingUser ? 'Preencha para exigir troca no próximo acesso' : 'Mínimo de 8 caracteres'}
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </div>
          <div className="form-field modal-field-span">
            <label>Secretaria</label>
            <SearchableSelect required
              value={form.organization_id}
              onChange={(value) => setForm({ ...form, organization_id: value })}
              options={organizationOptions}
              placeholder={catalogLoading ? 'Carregando secretarias...' : 'Selecione a secretaria'}
              searchPlaceholder="Buscar secretaria"
              disabled={catalogLoading || organizationOptions.length === 0}
            />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="user-role">Perfil</label>
            <select id="user-role" className="app-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              {roleOptions.map((role) => (
                <option key={role} value={role}>{getRoleLabel(role)}</option>
              ))}
            </select>
          </div>
</GuidedSection>
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : editingUser ? 'Atualizar usuário' : 'Criar usuário'}
            </button>
            <button className="ghost-button" type="button" disabled={submitting} onClick={closeModal}>Cancelar</button>
          </div>
        </GuidedForm>
      </Modal>

      <Modal
        open={permissionsModalOpen}
        className="permissions-modal"
        title={permissionsUser ? `Permissões de ${permissionsUser.name}` : 'Permissões'}
        description="Defina acesso por módulo e ação operacional."
        onClose={closePermissionsModal}
        canClose={!permissionsSaving}
      >

        {permissionsLoading ? (
          <div className="empty-state">Carregando permissões...</div>
        ) : (
          <form className="permissions-editor" onSubmit={(event) => { event.preventDefault(); savePermissions() }}>
            <p className="helper-text">Marque os acessos por módulo. Administradores operam somente na própria secretaria; superusuários têm acesso integral.</p>
            {permissionsUser?.role === 'SUPERUSER' ? <p className="alert alert-info">Este perfil possui todas as permissões. Para limitar acessos, altere o perfil no cadastro do usuário.</p> : null}
            {permissionsError ? <div className="alert alert-error" role="alert">{permissionsError}</div> : null}
            <div className="table-wrap table-wrap-wide">
              <table className="data-table data-table-wide management-table">
                <thead>
                  <tr>
                    <th>Módulo</th>
                    {PERMISSION_ACTIONS.map((action) => <th key={action.key}>{action.label}</th>)}
                    <th>Atalhos</th>
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_MODULES.map((module) => (
                    <tr key={module.key}>
                      <td data-label="Módulo"><strong>{module.label}</strong></td>
                      {PERMISSION_ACTIONS.map((action) => (
                        <td key={`${module.key}-${action.field}`} data-label={action.label}>
                          <label className="checkbox-field">
                            <input
                              type="checkbox"
                              aria-label={`${module.label}: ${action.label}`}
                              checked={Boolean(permissionsForm[module.key]?.[action.field])}
                              onChange={() => togglePermission(module.key, action.field)}
                              disabled={permissionExceedsPossessionCeiling(module.key, action.key, permissionsUser?.role)}
                              title={permissionsUser?.role === 'SUPERUSER' ? 'Acesso integral do superusuário' : requiredProfileView(module.key, action.key, permissionsUser?.role) ? 'Consulta incluída neste perfil, limitada à própria secretaria' : permissionExceedsPossessionCeiling(module.key, action.key, permissionsUser?.role) ? 'Ação não permitida para este perfil' : undefined}
                            />
                            <span>{action.label}</span>
                          </label>
                        </td>
                      ))}
                      <td data-label="Atalhos">
                        <div className="actions-inline">
                          <button type="button" className="mini-button" disabled={permissionsUser?.role === "SUPERUSER"} onClick={() => setModulePermissions(module.key, true)}>Tudo</button>
                          <button type="button" className="mini-button" disabled={permissionsUser?.role === "SUPERUSER"} onClick={() => setModulePermissions(module.key, false)}>Limpar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actions-inline modal-actions">
              <button className="app-button" type="submit" disabled={permissionsSaving || permissionsUser?.role === 'SUPERUSER'}>
                {permissionsSaving ? 'Salvando...' : 'Salvar permissões'}
              </button>
              <button className="ghost-button" type="button" onClick={closePermissionsModal}>Cancelar</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
