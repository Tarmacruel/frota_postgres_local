import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../api/client'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'

const initialForm = {
  plate: '',
  brand: '',
  model: '',
  status: 'ATIVO',
  department: '',
}

export default function VehiclesPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [vehicles, setVehicles] = useState([])
  const [form, setForm] = useState(initialForm)
  const [selectedHistory, setSelectedHistory] = useState([])
  const [selectedVehicle, setSelectedVehicle] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const statusFilter = searchParams.get('status') || 'TODOS'
  const statusOptions = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'ATIVO', label: 'Ativos' },
    { value: 'MANUTENCAO', label: 'Manutencao' },
    { value: 'INATIVO', label: 'Inativos' },
  ]

  const filteredVehicles = vehicles.filter((vehicle) => {
    const term = search.trim().toLowerCase()
    if (!term) return true

    return [vehicle.plate, vehicle.brand, vehicle.model, vehicle.current_department]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(term))
  })

  async function loadVehicles() {
    try {
      setLoading(true)
      setError('')
      const params = statusFilter !== 'TODOS' ? { status: statusFilter } : undefined
      const { data } = await api.get('/vehicles', { params })
      setVehicles(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os veiculos.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadVehicles()
  }, [statusFilter])

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      setSubmitting(true)
      setError('')
      setFeedback('')
      if (editingId) {
        await api.put(`/vehicles/${editingId}`, form)
        setFeedback('Veiculo atualizado com sucesso.')
      } else {
        await api.post('/vehicles', form)
        setFeedback('Veiculo cadastrado com sucesso.')
      }
      setForm(initialForm)
      setEditingId(null)
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o veiculo.'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Confirma a exclusao?')) return

    try {
      setError('')
      setFeedback('')
      await api.delete(`/vehicles/${id}`)
      if (editingId === id) {
        setEditingId(null)
        setForm(initialForm)
      }
      setFeedback('Veiculo removido com sucesso.')
      await loadVehicles()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel excluir o veiculo.'))
    }
  }

  async function loadHistory(id) {
    try {
      setError('')
      const { data } = await api.get(`/vehicles/${id}/historico`)
      const vehicle = vehicles.find((item) => item.id === id) || null
      setSelectedVehicle(vehicle)
      setSelectedHistory(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar o historico.'))
    }
  }

  function editVehicle(vehicle) {
    setEditingId(vehicle.id)
    setFeedback('')
    setError('')
    setForm({
      plate: vehicle.plate,
      brand: vehicle.brand,
      model: vehicle.model,
      status: vehicle.status,
      department: vehicle.current_department || '',
    })
  }

  function resetForm() {
    setEditingId(null)
    setForm(initialForm)
  }

  function handleStatusChange(nextStatus) {
    if (nextStatus === 'TODOS') {
      setSearchParams({})
      return
    }
    setSearchParams({ status: nextStatus })
  }

  function formatDate(value) {
    if (!value) return 'Atual'
    return new Date(value).toLocaleString('pt-BR')
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Operacao de veiculos</h2>
          <p className="section-copy">Filtre por status, consulte lotacao atual e ajuste registros sem perder o historico.</p>
        </div>
      </div>

      <div className="toolbar-row" style={{ marginBottom: 18 }}>
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
        <div style={{ flex: 1 }} />
        <input
          className="app-input"
          style={{ maxWidth: 340 }}
          placeholder="Buscar por placa, marca, modelo ou departamento"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="panel-grid">
        <section className="surface-panel" style={{ padding: 0, boxShadow: 'none', background: 'transparent', border: '0' }}>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Descricao</th>
                  <th>Status</th>
                  <th>Lotacao atual</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="5" className="muted">Carregando veiculos...</td>
                  </tr>
                ) : filteredVehicles.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="empty-state">
                        Nenhum veiculo encontrado para os filtros aplicados. Ajuste a busca ou troque o status para revisar a base completa.
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredVehicles.map((vehicle) => (
                    <tr key={vehicle.id}>
                      <td>
                        <div className="stack">
                          <strong>{vehicle.plate}</strong>
                          <span className="muted">Atualizado em {formatDate(vehicle.updated_at)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="stack">
                          <strong>{vehicle.brand}</strong>
                          <span className="muted">{vehicle.model}</span>
                        </div>
                      </td>
                      <td><span className={`status-badge status-${vehicle.status}`}>{vehicle.status}</span></td>
                      <td>{vehicle.current_department || 'Sem lotacao registrada'}</td>
                      <td>
                        <div className="actions-inline">
                          <button type="button" className="mini-button" onClick={() => loadHistory(vehicle.id)}>Historico</button>
                          {user?.role === 'ADMIN' ? <button type="button" className="mini-button" onClick={() => editVehicle(vehicle)}>Editar</button> : null}
                          {user?.role === 'ADMIN' ? <button type="button" className="mini-button danger" onClick={() => handleDelete(vehicle.id)}>Excluir</button> : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface-panel">
          <div className="panel-heading">
            <div>
              <h3 className="section-title">{user?.role === 'ADMIN' ? (editingId ? 'Editar registro' : 'Novo veiculo') : 'Historico e contexto'}</h3>
              <p className="section-copy">
                {user?.role === 'ADMIN'
                  ? 'Cadastre ou ajuste o status e o departamento do veiculo selecionado.'
                  : 'Seu perfil tem leitura operacional. Selecione um veiculo para ver o historico de lotacao.'}
              </p>
            </div>
          </div>

          {user?.role === 'ADMIN' ? (
            <form onSubmit={handleSubmit} className="form-grid">
              <div className="form-field">
                <label htmlFor="plate">Placa</label>
                <input id="plate" className="app-input" placeholder="ABC-1D23" value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="brand">Marca</label>
                <input id="brand" className="app-input" placeholder="Ex.: Ford" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="model">Modelo</label>
                <input id="model" className="app-input" placeholder="Ex.: Ranger" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="status">Status</label>
                <select id="status" className="app-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ATIVO">ATIVO</option>
                  <option value="MANUTENCAO">MANUTENCAO</option>
                  <option value="INATIVO">INATIVO</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="department">Departamento / lotacao</label>
                <input id="department" className="app-input" placeholder="Secretaria responsavel" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="actions-inline">
                <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : editingId ? 'Atualizar veiculo' : 'Cadastrar veiculo'}</button>
                <button className="ghost-button" type="button" onClick={resetForm}>Limpar formulario</button>
              </div>
            </form>
          ) : (
            <div className="empty-state">
              As alteracoes de cadastro ficam disponiveis apenas para o perfil administrador. O acompanhamento de lotacao e status segue liberado para consulta.
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <div className="panel-heading">
              <div>
                <h3 className="section-title">Historico de lotacao</h3>
                <p className="section-copy">
                  {selectedVehicle ? `Registro selecionado: ${selectedVehicle.plate}` : 'Selecione um veiculo na tabela para ver a linha do tempo.'}
                </p>
              </div>
            </div>
            {selectedHistory.length > 0 ? (
              <ul className="history-list">
                {selectedHistory.map((item) => (
                  <li className="history-item" key={item.id}>
                    <strong>{item.department}</strong>
                    <div className="muted">Inicio: {formatDate(item.start_date)}</div>
                    <div className="muted">Fim: {item.end_date ? formatDate(item.end_date) : 'Atual'}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">Ainda nao ha historico carregado para exibicao neste painel.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
