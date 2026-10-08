import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyticsAPI } from '../../api/analytics'
import { getApiErrorMessage } from '../../utils/apiError'

export default function useAnalyticsV1(query, refreshTick, enabled = true) {
  const [resources, setResources] = useState({})
  const generation = useRef(0)
  const requests = useMemo(() => ({
    overview: () => analyticsAPI.overview(query),
    efficiency: () => analyticsAPI.efficiency(query),
    tco: () => analyticsAPI.tco(query),
    driverRisk: () => analyticsAPI.driverRisk(query),
    insights: () => analyticsAPI.insights(query),
    trend: () => analyticsAPI.costTrend({ months: 12, vehicle_type: query.vehicle_type, organization: query.organization }),
  }), [query])

  const load = useCallback(async (key, version) => {
    setResources((current) => ({ ...current, [key]: { loading: true, error: '', data: null } }))
    let result
    try {
      const { data } = await requests[key]()
      result = { data, error: '', loading: false }
    } catch (error) {
      result = { data: null, error: getApiErrorMessage(error, 'Não foi possível carregar esta análise.'), loading: false }
    }
    if (version === generation.current) setResources((current) => ({ ...current, [key]: result }))
  }, [requests])

  useEffect(() => {
    if (!enabled) return undefined
    const version = ++generation.current
    Object.keys(requests).forEach((key) => { load(key, version) })
    return () => { generation.current += 1 }
  }, [requests, load, refreshTick, enabled])

  const retry = (key) => load(key, generation.current)
  const loading = Object.keys(requests).some((key) => !resources[key] || resources[key].loading)
  return { resources, loading, retry }
}
