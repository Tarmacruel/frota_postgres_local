import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import api from '../api/client'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../utils/exportData'
import { getRoleLabel } from '../utils/roles'

const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'PADRAO',
}

const roleOptions = ['ADMIN', 'PRODUCAO', 'POSTO', 'PADRAO']

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
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const term = search.trim().toLowerCase()
      const matchesSearch =
        !term || [user.name, user.email, getRoleLabel(user.role)].some((value) => String(value).toLowerCase().includes(term))
      const matchesRole = roleFilter === 'TODOS' || user.role === roleFilter
      return matchesSearch && matchesRole
    })
  }, [users, search, roleFilter])

  const exportColumns = [
    { header: 'Nome', value: (user) => user.name },
    { header: 'E-mail', value: (user) => user.email },
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

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')

      if (editingUser) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
        }
        if (form.password.trim()) payload.password = form.password
        await api.put(`/users/${editingUser.id}`, payload)
        setFeedback('Usuário atualizado com sucesso.')
      } else {
        await api.post('/users', form)
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
            placeholder="Buscar por nome, e-mail ou perfil"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
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
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
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
                  <td colSpan="7" className="muted">Carregando usuários...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7">
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
    </div>
  )
}
