import { useEffect, useState } from 'react'
import { vehicleLoansAPI } from '../api/vehicleLoans'

export const LOANS_CHANGED_EVENT = 'vehicle-loans-changed'

export default function usePendingVehicleLoans(userId, enabled) {
  const [state, setState] = useState({ userId: null, total: 0 })
  useEffect(() => {
    if (!enabled || !userId) return undefined
    let active = true
    let request = 0
    async function refresh() {
      const current = ++request
      try {
        const { data } = await vehicleLoansAPI.pendingSummary()
        if (active && current === request) setState({ userId, total: data.total })
      } catch {
        // A temporary failure must not erase a known unresolved notification.
      }
    }
    function visible() { if (document.visibilityState === 'visible') refresh() }
    refresh()
    const timer = window.setInterval(visible, 30000)
    window.addEventListener('focus', refresh)
    window.addEventListener(LOANS_CHANGED_EVENT, refresh)
    document.addEventListener('visibilitychange', visible)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener(LOANS_CHANGED_EVENT, refresh)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [userId, enabled])
  return enabled && state.userId === userId ? state.total : 0
}
