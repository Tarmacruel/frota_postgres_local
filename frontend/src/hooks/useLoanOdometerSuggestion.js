import { useEffect, useState } from 'react'
import { possessionAPI } from '../api/possession'
import { validLoanOdometer } from '../utils/vehicleLoans'

export default function useLoanOdometerSuggestion(vehicleId, enabled, scopeKey = '') {
  const [result, setResult] = useState({ key: '', status: 'idle', data: null })
  const [revision, setRevision] = useState(0)
  const key = `${scopeKey}:${vehicleId}:${revision}`
  useEffect(() => {
    let current = true
    if (!vehicleId || !enabled) return undefined
    possessionAPI.getOdometerSuggestion({ vehicle_id: vehicleId, start_date: new Date().toISOString() })
      .then(({ data }) => {
        if (current) setResult({ key, status: 'ready', data: data && validLoanOdometer(data.odometer_km) ? data : null })
      }).catch(() => { if (current) setResult({ key, status: 'error', data: null }) })
    return () => { current = false }
  }, [vehicleId, enabled, key])
  return { ...(enabled && vehicleId ? result.key === key ? result : { status: 'loading', data: null } : { status: 'idle', data: null }), vehicleId,
    refresh: () => setRevision((value) => value + 1) }
}
