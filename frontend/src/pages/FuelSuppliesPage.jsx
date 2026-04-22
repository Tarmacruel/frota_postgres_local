import { useEffect, useMemo, useState } from 'react'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import SearchableSelect from '../components/SearchableSelect'
import FuelSupplyForm from '../components/FuelSupplyForm'
import api from '../api/client'
import { masterDataAPI } from '../api/masterData'
import { fuelSuppliesAPI } from '../api/fuelSupplies'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR')
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined) return '-'
  return Number(value).toFixed(digits)
}

function buildVehicleOption(vehicle) {
  const locationLabel = vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotacao'
  return { value: vehicle.id, label: `${vehicle.plate} . ${vehicle.brand} ${vehicle.model}`, description: locationLabel }
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload && Array.isArray(payload.data)) return payload.data
  return []
}

export default function FuelSuppliesPage() {
  const { canConfirmFuelOrders, isFuelStation } = useAuth()
  const [records, setRecords] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [organizations, setOrganizations] = useState([])
  const [filters, setFilters] = useState({ vehicle_id: '', driver_id: '', organization_id: '', only_anomalies: '' })
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    async function loadDependencies() {
      try {
        const [vehiclesResponse, driversResponse, organizationsResponse] = await Promise.all([
          api.get('/vehicles'),
          api.get('/drivers'),
          masterDataAPI.listOrganizations(),
        ])
        setVehicles(asArray(vehiclesResponse.data))
        setDrivers(asArray(driversResponse.data))
        setOrganizations(asArray(organizationsResponse.data))
      } catch (err) {
        setError(getApiErrorMessage(err, 'Nao foi possivel carregar os cadastros de apoio.'))
      }
    }
    loadDependencies()
  }, [])

  async function loadRecords() {
    try {
      setLoading(true)
      setError('')
      const params = { limit: 100, page: 1 }
      if (filters.vehicle_id) params.vehicle_id = filters.vehicle_id
      if (filters.driver_id) params.driver_id = filters.driver_id
      if (filters.organization_id) params.organization_id = filters.organization_id
      if (filters.only_anomalies === 'true') params.only_anomalies = true
      const { data } = await fuelSuppliesAPI.list(params)
      setRecords(data.data || [])
    } catch (err) {
      setError(getApiErrorMessage(err, 'Nao foi possivel carregar os abastecimentos.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRecords()
  }, [filters])

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()
    return records.filter((record) => {
      if (!term) return true
      return [record.vehicle_plate, record.driver_name, record.organization_name, record.fuel_station, record.notes]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(term))
    })
  }, [records, search])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / 10))
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * 10, currentPage * 10)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, filters, records.length])

  return (
    <div className="surface-panel">
      <div className="panel-heading">
        <div>
          <h2 className="section-title">Abastecimentos</h2>
          <p className="section-copy">Gestao de abastecimento com comprovante obrigatorio e alertas automaticos de consumo.</p>
        </div>
        {canConfirmFuelOrders ? <button className="app-button" type="button" onClick={() => setIsModalOpen(true)}>Confirmar ordem</button> : null}
      </div>

      <div className="toolbar-card">
        <div className="filter-inline">
          <input className="app-input" placeholder="Buscar por placa, condutor, orgao ou posto" value={search} onChange={(event) => setSearch(event.target.value)} />
          {!isFuelStation ? (
            <>
              <SearchableSelect value={filters.vehicle_id} onChange={(value) => setFilters((prev) => ({ ...prev, vehicle_id: value }))} options={[{ value: '', label: 'Todos os veiculos' }, ...vehicles.map(buildVehicleOption)]} placeholder="Filtrar veiculo" />
              <SearchableSelect value={filters.driver_id} onChange={(value) => setFilters((prev) => ({ ...prev, driver_id: value }))} options={[{ value: '', label: 'Todos os condutores' }, ...drivers.map((driver) => ({ value: driver.id, label: driver.nome_completo }))]} placeholder="Filtrar condutor" />
              <SearchableSelect value={filters.organization_id} onChange={(value) => setFilters((prev) => ({ ...prev, organization_id: value }))} options={[{ value: '', label: 'Todos os orgaos' }, ...organizations.map((org) => ({ value: org.id, label: org.name }))]} placeholder="Filtrar orgao" />
              <select className="app-input" value={filters.only_anomalies} onChange={(event) => setFilters((prev) => ({ ...prev, only_anomalies: event.target.value }))}>
                <option value="">Todos</option>
                <option value="true">Somente alertas</option>
              </select>
            </>
          ) : null}
        </div>
      </div>

      {error ? <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div> : null}
      {feedback ? <div className="alert alert-info" style={{ marginBottom: 16 }}>{feedback}</div> : null}

      <div className="surface-panel panel-nested">
        <div className="table-wrap table-wrap-wide">
          <table className="data-table data-table-wide">
            <thead>
              <tr>
                <th>Veiculo</th>
                <th>Data</th>
                <th>Condutor</th>
                <th>Orgao</th>
                <th>Litros</th>
                <th>Km/l</th>
                <th>Alerta</th>
                <th>Comprovante</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="muted">Carregando abastecimentos...</td></tr> : null}
              {!loading && paginatedRecords.length === 0 ? <tr><td colSpan={8}><div className="empty-state">Nenhum abastecimento encontrado.</div></td></tr> : null}
              {!loading && paginatedRecords.map((record) => (
                <tr key={record.id}>
                  <td>{record.vehicle_plate}</td>
                  <td>{formatDate(record.supplied_at)}</td>
                  <td>{record.driver_name || '-'}</td>
                  <td>{record.organization_name || '-'}</td>
                  <td>{formatNumber(record.liters)}</td>
                  <td>{formatNumber(record.consumption_km_l)}</td>
                  <td>{record.is_consumption_anomaly ? <span className="status-chip warning">Alerta</span> : '-'}</td>
                  <td><a className="link-inline" href={record.receipt_url} target="_blank" rel="noreferrer">Abrir</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title="Confirmar ordem de abastecimento" description="Confirme o abastecimento com comprovante obrigatorio.">
        <FuelSupplyForm
          vehicles={vehicles}
          drivers={drivers}
          organizations={organizations}
          onClose={() => setIsModalOpen(false)}
          onSuccess={(message) => {
            setFeedback(message)
            loadRecords()
          }}
        />
      </Modal>
    </div>
  )
}
