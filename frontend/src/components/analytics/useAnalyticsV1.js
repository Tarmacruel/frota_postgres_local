import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { analyticsAPI } from '../../api/analytics'
import { getApiErrorMessage } from '../../utils/apiError'

const ALL_SOURCES = ['overview', 'efficiency', 'tco', 'driverRisk', 'insights', 'trend']

export default function useAnalyticsV1(query, refreshTick, enabled = true, sources = ALL_SOURCES) {
  const [resources, setResources] = useState({})
  const generation = useRef(0)
  const controllers = useRef(new Map())
  const requests = useMemo(() => {
    const available = {
      overview: (signal) => analyticsAPI.overview(query, signal),
      efficiency: (signal) => analyticsAPI.efficiency(query, signal),
      tco: (signal) => analyticsAPI.tco(query, signal),
      driverRisk: (signal) => analyticsAPI.driverRisk(query, signal),
      insights: (signal) => analyticsAPI.insights(query, signal),
      trend: (signal) => analyticsAPI.costTrend({ months: 12, vehicle_type: query.vehicle_type, organization: query.organization }, signal),
    }
    return Object.fromEntries(sources.map((key) => [key, available[key]]))
  }, [query, sources])

  const load = useCallback(async (key, version) => {
    controllers.current.get(key)?.abort()
    const controller = new AbortController()
    controllers.current.set(key, controller)
    setResources((current) => ({ ...current, [key]: { loading: true, error: '', data: null } }))
    let result
    try {
      const { data } = await requests[key](controller.signal)
      result = { data, error: '', loading: false }
    } catch (error) {
      result = { data: null, error: getApiErrorMessage(error, 'Não foi possível carregar esta análise.'), loading: false }
    }
    if (controllers.current.get(key) === controller) controllers.current.delete(key)
    if (version === generation.current && !controller.signal.aborted) setResources((current) => ({ ...current, [key]: result }))
  }, [requests])

  useEffect(() => {
    if (!enabled) return undefined
    const version = ++generation.current
    Object.keys(requests).forEach((key) => { load(key, version) })
    const pending = controllers.current
    return () => { generation.current += 1; pending.forEach((controller) => controller.abort()); pending.clear() }
  }, [requests, load, refreshTick, enabled])

  const retry = (key) => load(key, generation.current)
  const loading = Object.keys(requests).some((key) => !resources[key] || resources[key].loading)
  return { resources, loading, retry }
}
