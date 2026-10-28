export function fuelVehicleOptions(vehicles, selectedId = '') {
  return [
    { value: '', label: 'Todos os veículos' },
    ...(selectedId && !vehicles.some((vehicle) => String(vehicle.id) === String(selectedId))
      ? [{ value: selectedId, label: 'Veículo selecionado', description: 'Não consta no catálogo disponível.' }] : []),
    ...vehicles.map((vehicle) => ({
      value: vehicle.id,
      label: [vehicle.plate, [vehicle.brand, vehicle.model].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
      description: vehicle.current_location?.display_name || vehicle.current_department || 'Sem lotação',
      tags: vehicle.tags || [],
    })),
  ]
}

export function fuelStationOptions(stations) {
  return [{ value: '', label: 'Todos os postos' }, ...stations.map((station) => ({
    value: station.id, label: station.name,
    description: [station.address, station.phone].filter(Boolean).join(' | '),
    keywords: [station.name, station.cnpj, station.address, station.phone].filter(Boolean).join(' '),
  }))]
}
