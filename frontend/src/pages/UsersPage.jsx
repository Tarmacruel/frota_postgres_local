import { useEffect, useState } from 'react'
import api from '../api/client'
import { getApiErrorMessage } from '../utils/apiError'

const initialForm = {
  name: '',
  email: '',
  password: '',
  role: 'PADRAO',
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

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

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      await api.post('/users', form)
      setForm(initialForm)
      setFeedback('Usuario criado com sucesso.')
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

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Gestao de usuarios</h2>
          <p className="section-copy">Crie acessos administrativos ou perfis de consulta mantendo a operacao sob controle.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="panel-grid">
        <section className="surface-panel">
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Novo usuario</h3>
              <p className="section-copy">Use e-mails institucionais ou internos do ambiente local para liberar acesso.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="form-grid">
            <div className="form-field">
              <label htmlFor="user-name">Nome completo</label>
              <input id="user-name" className="app-input" placeholder="Nome do servidor" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="user-email">E-mail</label>
              <input id="user-email" className="app-input" placeholder="usuario@frota.local" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="user-password">Senha</label>
              <input id="user-password" className="app-input" type="password" placeholder="Minimo de 8 caracteres" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="form-field">
              <label htmlFor="user-role">Perfil</label>
              <select id="user-role" className="app-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="PADRAO">PADRAO</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </div>
            <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Criar usuario'}</button>
          </form>
        </section>

        <section className="surface-panel">
          <div className="panel-heading">
            <div>
              <h3 className="section-title">Usuarios cadastrados</h3>
              <p className="section-copy">Lista atualizada da base de acesso administrativo e de leitura.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Perfil</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4" className="muted">Carregando usuarios...</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="4">
                      <div className="empty-state">Nenhum usuario cadastrado ainda.</div>
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td><span className={`status-badge ${user.role === 'ADMIN' ? 'status-ATIVO' : 'status-MANUTENCAO'}`}>{user.role}</span></td>
                      <td>
                        <button type="button" className="mini-button danger" onClick={() => handleDelete(user.id)}>Excluir</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
