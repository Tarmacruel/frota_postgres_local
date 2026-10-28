import SearchableSelect from './SearchableSelect'
import { useAuth } from '../context/AuthContext'
import { fuelStationOptions, fuelVehicleOptions } from '../utils/fuelWorkspaceFilters'

export default function FuelEntityFilters({ vehicleId, onVehicleChange, filters, onFilterChange,
  vehicles = [], organizations = [], stations = [], onVehiclesOpen, onStationsOpen }) {
  const { canView } = useAuth()
  const vehicleOptions = fuelVehicleOptions(vehicles, vehicleId)
  const organizationOptions = [{ value: '', label: 'Todas as secretarias' }, ...organizations.map((item) => ({ value: item.id, label: item.name }))]
  const stationOptions = fuelStationOptions(stations)
  const selectedLabel = (options, value) => options.find((option) => String(option.value) === String(value))?.label || 'Seleção atual'

  return <>
    {canView('vehicles') || vehicleId ? <SearchableSelect
      value={vehicleId} onChange={onVehicleChange} options={vehicleOptions}
      ariaLabel={`Filtrar veículo: ${selectedLabel(vehicleOptions, vehicleId)}`}
      placeholder="Filtrar veículo" searchPlaceholder="Buscar veículo por placa, marca ou modelo"
      onOpen={canView('vehicles') ? onVehiclesOpen : undefined}
    /> : null}
    <SearchableSelect value={filters.organization_id} onChange={(value) => onFilterChange('organization_id', value)}
      options={organizationOptions} ariaLabel={`Filtrar secretaria: ${selectedLabel(organizationOptions, filters.organization_id)}`}
      placeholder="Filtrar secretaria" searchPlaceholder="Buscar secretaria" />
    {canView('fuel_stations') ? <SearchableSelect
      value={filters.fuel_station_id} onChange={(value) => onFilterChange('fuel_station_id', value)}
      options={stationOptions} ariaLabel={`Filtrar posto: ${selectedLabel(stationOptions, filters.fuel_station_id)}`}
      placeholder="Filtrar posto" searchPlaceholder="Buscar posto" onOpen={onStationsOpen}
    /> : null}
  </>
}
