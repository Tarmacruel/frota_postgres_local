import { useSearchParams } from 'react-router-dom'

export function useFuelVehicleFilter(view) {
  const [params, setParams] = useSearchParams()
  const vehicleId = params.get('vehicle_id') || ''
  function selectVehicle(value) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set('vehicle_id', value)
      else next.delete('vehicle_id')
      // Clearing a vehicle from an older history link must keep that workspace.
      next.set('view', view)
      return next
    })
  }
  return { vehicleId, selectVehicle }
}
