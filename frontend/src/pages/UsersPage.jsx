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

const roleOptions = ['ADMIN', 'PRODUCAO', 'PADRAO', 'POSTO']

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
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os usuarios.'))
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
        setFeedback('Usuario atualizado com sucesso.')
      } else {
        await api.post('/users', form)
        setFeedback('Usuario criado com sucesso.')
      }

      closeModal()
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o usuario.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Excluir o usuario ${user.email}?`)) return

    try {
      setError('')
      setFeedback('')
      await api.delete(`/users/${user.id}`)
      setFeedback('Usuario removido com sucesso.')
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel excluir o usuario.'))
    }
  }

  async function handleExportPdf() {
    if (filteredUsers.length === 0) {
      setFeedback('Nao ha usuarios filtrados para previsualizar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await previewRowsToPdf({
        title: 'Frota PMTF - Usuarios',
        fileName: 'frota-pmtf-usuarios',
        subtitle: 'Relatorio dos perfis administrativos, de producao, posto e consulta.',
        columns: exportColumns,
        rows: filteredUsers,
        filters: [
          { label: 'Perfil', value: roleFilter === 'TODOS' ? 'Todos os perfis' : getRoleLabel(roleFilter) },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Pre-visualizacao do PDF de usuarios aberta em nova guia.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel gerar o PDF dos usuarios.'))
    }
  }

  async function handleExportXlsx() {
    if (filteredUsers.length === 0) {
      setFeedback('Nao ha usuarios filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToXlsx({
        fileName: 'frota-pmtf-usuarios',
        sheetName: 'Usuarios',
        columns: exportColumns,
        rows: filteredUsers,
        filters: [
          { label: 'Perfil', value: roleFilter === 'TODOS' ? 'Todos os perfis' : getRoleLabel(roleFilter) },
          ...(search.trim() ? [{ label: 'Busca', value: search.trim() }] : []),
        ],
      })
      setFeedback('Exportacao de usuarios em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os usuarios em XLSX.'))
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
          <h2 className="section-title">Gestao de usuarios</h2>
          <p className="section-copy">Gerencie perfis administrativos, operadores de producao e usuarios apenas de consulta.</p>
        </div>
        <div className="actions-inline">
          <button className="app-button" type="button" onClick={openCreateModal}>Novo usuario</button>
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Previsualizar PDF</button>
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
          <span>usuarios exibidos</span>
        </div>
        <div className="metric-inline">
          <strong>{users.filter((user) => user.role === 'PRODUCAO').length}</strong>
          <span>perfil producao</span>
        </div>
        <div className="metric-inline">
          <strong>{users.filter((user) => user.role === 'ADMIN').length}</strong>
          <span>administradores</span>
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
                <th>Criado em</th>
                <th>Atualizado em</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="muted">Carregando usuarios...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="6">
                    <div className="empty-state">Nenhum usuario encontrado para os filtros aplicados.</div>
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
                      <span className={`status-badge ${user.role === 'ADMIN' ? 'status-ATIVO' : user.role === 'PRODUCAO' ? 'status-PRODUCAO' : 'status-INATIVO'}`}>
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td data-label="Criado em">{formatDate(user.created_at)}</td>
                    <td data-label="Atualizado em">{formatDate(user.updated_at)}</td>
                    <td data-label="Acoes">
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
        title={editingUser ? 'Editar usuario' : 'Novo usuario'}
        description="Defina o perfil correto para cada pessoa: administracao total, operacao de producao ou consulta."
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
            <label htmlFor="user-password">{editingUser ? 'Nova senha (opcional)' : 'Senha'}</label>
            <input
              id="user-password"
              className="app-input"
              type="password"
              placeholder={editingUser ? 'Preencha apenas se quiser trocar' : 'Minimo de 8 caracteres'}
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
              {submitting ? 'Salvando...' : editingUser ? 'Atualizar usuario' : 'Criar usuario'}
            </button>
            <button className="ghost-button" type="button" onClick={closeModal}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
