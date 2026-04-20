import { useEffect, useMemo, useState } from 'react'
import { fuelStationsAPI } from '../api/fuelStations'
import { getApiErrorMessage } from '../utils/apiError'
import api from '../api/client'

const initialStationForm = { id: null, name: '', cnpj: '', address: '', active: true }

export default function FuelStationsPage() {
  const [stations, setStations] = useState([])
  const [users, setUsers] = useState([])
  const [selectedStationId, setSelectedStationId] = useState('')
  const [links, setLinks] = useState([])
  const [stationForm, setStationForm] = useState(initialStationForm)
  const [userId, setUserId] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')

  const selectedStation = useMemo(() => stations.find((item) => item.id === selectedStationId), [stations, selectedStationId])

  async function loadStations() {
    const { data } = await fuelStationsAPI.list()
    setStations(data)
    if (!selectedStationId && data[0]?.id) setSelectedStationId(data[0].id)
  }

  async function loadUsers() {
    const { data } = await api.get('/users', { params: { limit: 200, skip: 0 } })
    setUsers(data)
  }

  async function loadLinks(stationId) {
    if (!stationId) return setLinks([])
    const { data } = await fuelStationsAPI.listUsers(stationId)
    setLinks(data)
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setError('')
        await Promise.all([loadStations(), loadUsers()])
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar postos e usuarios.'))
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    loadLinks(selectedStationId).catch((err) => setError(getApiErrorMessage(err, 'Nao foi possivel carregar vinculos do posto.')))
  }, [selectedStationId])

  async function saveStation(event) {
    event.preventDefault()
    try {
      setError('')
      const payload = {
        name: stationForm.name.trim(),
        cnpj: stationForm.cnpj.trim() || null,
        address: stationForm.address.trim(),
        active: stationForm.active,
      }
      if (stationForm.id) {
        await fuelStationsAPI.update(stationForm.id, payload)
        setFeedback('Posto atualizado com sucesso.')
      } else {
        await fuelStationsAPI.create(payload)
        setFeedback('Posto cadastrado com sucesso.')
      }
      setStationForm(initialStationForm)
      await loadStations()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel salvar o posto.'))
    }
  }

  async function removeStation(stationId) {
    try {
      setError('')
      await fuelStationsAPI.remove(stationId)
      setFeedback('Posto removido com sucesso.')
      if (selectedStationId === stationId) setSelectedStationId('')
      await loadStations()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover o posto.'))
    }
  }

  async function createLink() {
    if (!selectedStationId || !userId) return
    try {
      setError('')
      await fuelStationsAPI.createUser(selectedStationId, { user_id: userId, active: true })
      setFeedback('Usuario vinculado ao posto.')
      setUserId('')
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel vincular usuario ao posto.'))
    }
  }

  async function toggleLink(link) {
    try {
      setError('')
      await fuelStationsAPI.updateUser(selectedStationId, link.id, { active: !link.active })
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel atualizar vinculo.'))
    }
  }

  async function removeLink(linkId) {
    try {
      setError('')
      await fuelStationsAPI.removeUser(selectedStationId, linkId)
      await loadLinks(selectedStationId)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel remover vinculo.'))
    }
  }

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Postos de combustivel</h2>
          <p className="section-copy">Cadastro administrativo de postos e vinculos de usuarios.</p>
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested" style={{ marginBottom: 16 }}>
        <form className="form-grid" onSubmit={saveStation}>
          <div className="form-field"><label>Nome</label><input className="app-input" value={stationForm.name} onChange={(event) => setStationForm({ ...stationForm, name: event.target.value })} required /></div>
          <div className="form-field"><label>CNPJ</label><input className="app-input" value={stationForm.cnpj} onChange={(event) => setStationForm({ ...stationForm, cnpj: event.target.value })} /></div>
          <div className="form-field"><label>Endereco</label><input className="app-input" value={stationForm.address} onChange={(event) => setStationForm({ ...stationForm, address: event.target.value })} required /></div>
          <div className="form-field"><label>Ativo</label><select className="app-input" value={stationForm.active ? 'true' : 'false'} onChange={(event) => setStationForm({ ...stationForm, active: event.target.value === 'true' })}><option value="true">Sim</option><option value="false">Nao</option></select></div>
          <div className="actions-inline modal-field-span">
            <button className="app-button" type="submit">{stationForm.id ? 'Salvar posto' : 'Cadastrar posto'}</button>
            {stationForm.id ? <button className="ghost-button" type="button" onClick={() => setStationForm(initialStationForm)}>Cancelar edicao</button> : null}
          </div>
        </form>
      </div>

      <div className="surface-panel panel-nested" style={{ marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Nome</th><th>CNPJ</th><th>Endereco</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {stations.map((station) => (
                <tr key={station.id}>
                  <td>{station.name}</td>
                  <td>{station.cnpj || '-'}</td>
                  <td>{station.address}</td>
                  <td>{station.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="actions-inline">
                    <button type="button" className="ghost-button" onClick={() => { setStationForm({ ...station }); setSelectedStationId(station.id) }}>Editar</button>
                    <button type="button" className="ghost-button ghost-danger" onClick={() => removeStation(station.id)}>Excluir</button>
                    <button type="button" className="ghost-button" onClick={() => setSelectedStationId(station.id)}>Vinculos</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="surface-panel panel-nested">
        <h3 className="section-title" style={{ marginBottom: 8 }}>Vinculos de usuarios {selectedStation ? `- ${selectedStation.name}` : ''}</h3>
        <div className="filter-inline" style={{ marginBottom: 12 }}>
          <select className="app-input" value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Selecione um usuario</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name} ({user.email})</option>)}
          </select>
          <button type="button" className="app-button" onClick={createLink} disabled={!selectedStationId || !userId}>Vincular usuario</button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Usuario</th><th>Email</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td>{link.user_name || link.user_id}</td>
                  <td>{link.user_email || '-'}</td>
                  <td>{link.active ? 'Ativo' : 'Inativo'}</td>
                  <td className="actions-inline">
                    <button type="button" className="ghost-button" onClick={() => toggleLink(link)}>{link.active ? 'Desativar' : 'Ativar'}</button>
                    <button type="button" className="ghost-button ghost-danger" onClick={() => removeLink(link.id)}>Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
