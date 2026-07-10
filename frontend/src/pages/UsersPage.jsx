import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import SearchableSelect from '../components/SearchableSelect'
import api from '../api/client'
import { useMasterDataCatalog } from '../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../utils/apiError'
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

const roleOptions = ['ADMIN', 'PRODUCAO', 'POSTO', 'PADRAO']

function permissionExceedsPossessionCeiling(moduleKey, actionKey, role) {
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
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingUser, setEditingUser] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('TODOS')
  const [organizationFilter, setOrganizationFilter] = useState('TODAS')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [permissionsModalOpen, setPermissionsModalOpen] = useState(false)
  const [permissionsUser, setPermissionsUser] = useState(null)
  const [permissionsForm, setPermissionsForm] = useState(() => normalizePermissions())
  const [permissionsLoading, setPermissionsLoading] = useState(false)
  const [permissionsSaving, setPermissionsSaving] = useState(false)
  const { organizations, loading: catalogLoading, error: catalogError } = useMasterDataCatalog()

  const organizationOptions = organizations.map((organization) => ({
    value: organization.id,
    label: organization.name,
  }))

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const term = search.trim().toLowerCase()
      const matchesSearch =
        !term || [user.name, user.email, user.cpf_masked, user.organization_name, getRoleLabel(user.role)].some((value) => String(value).toLowerCase().includes(term))
      const matchesRole = roleFilter === 'TODOS' || user.role === roleFilter
      const matchesOrganization =
        organizationFilter === 'TODAS' ||
        (organizationFilter === 'SEM_SECRETARIA' ? !user.organization_id : user.organization_id === organizationFilter)
      return matchesSearch && matchesRole && matchesOrganization
    })
  }, [users, search, roleFilter, organizationFilter])

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

  async function loadUsers() {
    try {
      setLoading(true)
      setError('')
      const { data } = await api.get('/users')
      setUsers(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar os usuários.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  function openCreateModal() {
    setEditingUser(null)
    setForm(initialForm)
    setIsModalOpen(true)
  }

  function openEditModal(user) {
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
    setEditingUser(null)
    setForm(initialForm)
    setIsModalOpen(false)
  }

  function closePermissionsModal() {
    setPermissionsModalOpen(false)
    setPermissionsUser(null)
    setPermissionsForm(normalizePermissions())
  }

  async function openPermissionsModal(user) {
    setPermissionsUser(user)
    setPermissionsForm(normalizePermissions(user.permissions))
    setPermissionsModalOpen(true)
    try {
      setPermissionsLoading(true)
      setError('')
      const { data } = await api.get(`/users/${user.id}/permissions`)
      setPermissionsForm(normalizePermissions(data.permissions))
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível carregar as permissões do usuário.'))
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
        flags[action.field] = value && !permissionExceedsPossessionCeiling(moduleKey, action.key, permissionsUser?.role)
        return flags
      }, {}),
    }))
  }

  async function savePermissions() {
    if (!permissionsUser) return
    try {
      setPermissionsSaving(true)
      setError('')
      setFeedback('')
      await api.put(`/users/${permissionsUser.id}/permissions`, { permissions: permissionsForm })
      setFeedback(`Permissões de ${permissionsUser.name} atualizadas com sucesso.`)
      closePermissionsModal()
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar as permissões do usuário.'))
    } finally {
      setPermissionsSaving(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!editingUser && !form.cpf.trim()) {
      setError('Informe o CPF do usuario.')
      return
    }
    if (!form.organization_id) {
      setError('Selecione a secretaria do usuário.')
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
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar o usuário.'))
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
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível excluir o usuário.'))
    }
  }

  async function handleExportPdf() {
    if (filteredUsers.length === 0) {
      setFeedback('Não há usuários filtrados para pré-visualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Usuários',
        fileName: 'frota-pmtf-usuários',
        subtitle: 'Relatório dos perfis administrativos, de produção, posto e consulta.',
        columns: exportColumns,
        rows: filteredUsers,
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
    if (filteredUsers.length === 0) {
      setFeedback('Não há usuários filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-usuários',
        sheetName: 'Usuários',
        columns: exportColumns,
        rows: filteredUsers,
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
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Gestão de usuários</h2>
          <p className="section-copy">Gerencie perfis administrativos, operadores de produção, postos credenciados e usuários apenas de consulta.</p>
        </div>
        <div className="actions-inline">
          <button className="app-button" type="button" onClick={openCreateModal}>Novo usuário</button>
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Pré-visualizar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="filter-inline">
          <input
            className="app-input"
            placeholder="Buscar por nome, e-mail, CPF, secretaria ou perfil"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-select" value={organizationFilter} onChange={(event) => setOrganizationFilter(event.target.value)}>
            <option value="TODAS">Todas as secretarias</option>
            <option value="SEM_SECRETARIA">Sem secretaria</option>
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

      <div className="panel-metrics">
        <div className="metric-inline">
          <strong>{filteredUsers.length}</strong>
          <span>usuários exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{users.filter((user) => user.role === 'PRODUCAO').length}</strong>
          <span>perfil produção</span>
        </div>
        <div className="metric-inline">
          <strong>{users.filter((user) => user.role === 'POSTO').length}</strong>
          <span>perfil posto</span>
        </div>
        <div className="metric-inline">
          <strong>{users.filter((user) => user.role === 'ADMIN').length}</strong>
          <span>administradores</span>
        </div>
        <div className="metric-inline">
          <strong>{users.filter((user) => user.must_change_password).length}</strong>
          <span>trocas pendentes</span>
        </div>
        <div className="metric-inline">
          <strong>{users.filter((user) => user.must_register_cpf).length}</strong>
          <span>CPFs pendentes</span>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {catalogError ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{catalogError}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
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
                      <span className={`status-badge ${user.role === 'ADMIN' ? 'status-ATIVO' : user.role === 'PRODUCAO' ? 'status-PRODUCAO' : user.role === 'POSTO' ? 'status-POSTO' : 'status-INATIVO'}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td data-label="Senha">
                      <span className={`status-badge ${user.must_change_password ? 'status-MANUTENCAO' : 'status-ATIVO'}`}>
                        {user.must_change_password ? 'Troca pendente' : 'Regularizada'}
                      </span>
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

      <Modal
        open={isModalOpen}
        title={editingUser ? 'Editar usuário' : 'Novo usuário'}
        description="Defina o perfil correto para cada pessoa: administração total, operação de produção, posto credenciado ou consulta."
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
          <div className="form-field modal-field-span">
            <label htmlFor="user-name">Nome completo</label>
            <input
              id="user-name"
              className="app-input"
              placeholder="Nome do servidor"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="user-email">E-mail</label>
            <input
              id="user-email"
              className="app-input"
              placeholder="usuario@frota.local"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </div>
          <div className="form-field">
            <label htmlFor="user-cpf">{editingUser ? 'Substituir CPF (opcional)' : 'CPF'}</label>
            <input
              id="user-cpf"
              className="app-input"
              placeholder={editingUser ? (editingUser.cpf_masked || 'Preencha somente para substituir') : '000.000.000-00'}
              value={form.cpf}
              onChange={(event) => setForm({ ...form, cpf: event.target.value })}
              inputMode="numeric"
            />
          </div>
          <div className="form-field">
            <label htmlFor="user-password">{editingUser ? 'Redefinir senha provisória (opcional)' : 'Senha provisória'}</label>
            <input
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
            <SearchableSelect
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
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting}>
              {submitting ? 'Salvando...' : editingUser ? 'Atualizar usuário' : 'Criar usuário'}
            </button>
            <button className="ghost-button" type="button" onClick={closeModal}>Cancelar</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={permissionsModalOpen}
        title={permissionsUser ? `Permissões de ${permissionsUser.name}` : 'Permissões'}
        description="Defina acesso por módulo e ação operacional."
        onClose={closePermissionsModal}
      >
        {permissionsLoading ? (
          <div className="empty-state">Carregando permissões...</div>
        ) : (
          <div className="stack">
            <div className="table-wrap table-wrap-wide">
              <table className="data-table data-table-wide">
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
                              checked={Boolean(permissionsForm[module.key]?.[action.field])}
                              onChange={() => togglePermission(module.key, action.field)}
                              disabled={permissionExceedsPossessionCeiling(module.key, action.key, permissionsUser?.role)}
                              title={permissionExceedsPossessionCeiling(module.key, action.key, permissionsUser?.role) ? 'Ação acima do teto deste perfil' : undefined}
                            />
                            <span>{action.label}</span>
                          </label>
                        </td>
                      ))}
                      <td data-label="Atalhos">
                        <div className="actions-inline">
                          <button type="button" className="mini-button" onClick={() => setModulePermissions(module.key, true)}>Tudo</button>
                          <button type="button" className="mini-button" onClick={() => setModulePermissions(module.key, false)}>Limpar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actions-inline modal-actions">
              <button className="app-button" type="button" disabled={permissionsSaving} onClick={savePermissions}>
                {permissionsSaving ? 'Salvando...' : 'Salvar permissões'}
              </button>
              <button className="ghost-button" type="button" onClick={closePermissionsModal}>Cancelar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
