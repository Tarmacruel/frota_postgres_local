import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import api from '../api/client'
import { getApiErrorMessage } from '../utils/apiError'
import { exportRowsToPdf, exportRowsToXlsx } from '../utils/exportData'

const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'PADRAO',
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const filteredUsers = users.filter((user) => {
    const term = search.trim().toLowerCase()
    const matchesSearch =
      !term || [user.name, user.email, user.role].some((value) => String(value).toLowerCase().includes(term))
    const matchesRole = roleFilter === 'TODOS' || user.role === roleFilter
    return matchesSearch && matchesRole
  })

  const exportColumns = [
    { header: 'Nome', value: (user) => user.name },
    { header: 'E-mail', value: (user) => user.email },
    { header: 'Perfil', value: (user) => user.role },
    { header: 'Criado em', value: (user) => formatDate(user.created_at) },
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

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      await api.post('/users', form)
      setForm(initialForm)
      setFeedback('Usuario criado com sucesso.')
      setIsModalOpen(false)
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel criar o usuario.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Excluir usuario?')) return

    try {
      setError('')
      setFeedback('')
      await api.delete(`/users/${id}`)
      setFeedback('Usuario removido com sucesso.')
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel excluir o usuario.'))
    }
  }

  function clearFilters() {
    setSearch('')
    setRoleFilter('TODOS')
  }

  function formatDate(value) {
    if (!value) return '-'
    return new Date(value).toLocaleString('pt-BR')
  }

  async function handleExportPdf() {
    if (filteredUsers.length === 0) {
      setFeedback('Nao ha usuarios filtrados para exportar.')
      return
    }

    try {
      setError('')
      setFeedback('')
      await exportRowsToPdf({
        title: 'Frota PMTF - Usuarios',
        fileName: 'frota-pmtf-usuarios',
        subtitle: 'Relatorio dos usuarios filtrados na area administrativa.',
        columns: exportColumns,
        rows: filteredUsers,
      })
      setFeedback('Exportacao em PDF iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os usuarios em PDF.'))
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
      })
      setFeedback('Exportacao em XLSX iniciada com sucesso.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel exportar os usuarios em XLSX.'))
    }
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Gestao de usuarios</h2>
          <p className="section-copy">Cadastro por modal, tabela ampliada para consulta e exportacao dos perfis administrativos e padrao.</p>
        </div>
        <div className="actions-inline">
          <button className="app-button" type="button" onClick={() => setIsModalOpen(true)}>Novo usuario</button>
          <button className="secondary-button" type="button" onClick={handleExportPdf}>Exportar PDF</button>
          <button className="ghost-button" type="button" onClick={handleExportXlsx}>Exportar XLSX</button>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
        <div className="filter-inline">
          <input
            className="app-input"
            style={{ minWidth: 280 }}
            placeholder="Buscar por nome, e-mail ou perfil"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="app-select" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="TODOS">Todos os perfis</option>
            <option value="ADMIN">ADMIN</option>
            <option value="PADRAO">PADRAO</option>
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
          <strong>{users.length}</strong>
          <span>cadastros carregados</span>
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
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="muted">Carregando usuarios...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5">
                    <div className="empty-state">Nenhum usuario encontrado para os filtros aplicados.</div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.name}</strong></td>
                    <td>{user.email}</td>
                    <td><span className={`status-badge ${user.role === 'ADMIN' ? 'status-ATIVO' : 'status-MANUTENCAO'}`}>{user.role}</span></td>
                    <td>{formatDate(user.created_at)}</td>
                    <td>
                      <button type="button" className="mini-button danger" onClick={() => handleDelete(user.id)}>Excluir</button>
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
        title="Novo usuario"
        description="Crie um novo acesso administrativo ou de consulta sem reduzir a leitura da tabela."
        onClose={() => {
          setIsModalOpen(false)
          setForm(initialForm)
        }}
      >
        <form onSubmit={handleSubmit} className="form-grid modal-form-grid">
          <div className="form-field modal-field-span">
            <label htmlFor="user-name">Nome completo</label>
            <input id="user-name" className="app-input" placeholder="Nome do servidor" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="user-email">E-mail</label>
            <input id="user-email" className="app-input" placeholder="usuario@frota.local" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="form-field">
            <label htmlFor="user-password">Senha</label>
            <input id="user-password" className="app-input" type="password" placeholder="Minimo de 8 caracteres" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </div>
          <div className="form-field modal-field-span">
            <label htmlFor="user-role">Perfil</label>
            <select id="user-role" className="app-select" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="PADRAO">PADRAO</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </div>
          <div className="actions-inline modal-actions">
            <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Criar usuario'}</button>
            <button className="ghost-button" type="button" onClick={() => { setIsModalOpen(false); setForm(initialForm) }}>Cancelar</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
