import { useEffect, useMemo, useState } from 'react'
import { vehiclesAPI } from '../api/vehicles'

export default function useLoanVehicleIdentity(vehicles, enabled, scopeKey = '') {
  const [details, setDetails] = useState({ key: '', rows: [], status: 'idle' })
  useEffect(() => {
    let current = true
    if (!enabled) return undefined
    vehiclesAPI.listOptions().then(({ data }) => {
      if (current) setDetails({ key: scopeKey, rows: Array.isArray(data) ? data : [], status: 'ready' })
    }).catch(() => { if (current) setDetails({ key: scopeKey, rows: [], status: 'error' }) })
    return () => { current = false }
  }, [enabled, scopeKey])
  const permitted = enabled && details.key === scopeKey
  const result = useMemo(() => {
    const byId = new Map((permitted ? details.rows : []).map((item) => [item.id, item]))
    // Enrich only IDs already authorized by the loan catalogue; never widen it.
    return vehicles.map((item) => {
      const extra = byId.get(item.id)
      return extra ? { ...item, brand: item.brand || extra.brand, model: item.model || extra.model,
        ownership_type: extra.ownership_type, current_department: extra.current_department,
        chassis_number: extra.chassis_number, current_location: extra.current_location } : item
    })
  }, [vehicles, details.rows, permitted])
  return { vehicles: result, status: !enabled ? 'idle' : permitted ? details.status : 'loading' }
}
