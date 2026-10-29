import { initialSettings, brandingStyles } from '../utils/systemBranding'
import { SystemSettingsContext } from './systemSettingsStore'
import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { applyOfficialBrand } from '../constants/officialBrand'


export function SystemSettingsProvider({ children }) {
  const [configuration, setConfiguration] = useState({ values: initialSettings, revision: 0 })
  const publish = useCallback((next) => {
    const values = { ...initialSettings, ...next.values,
      identity: { ...initialSettings.identity, ...next.values?.identity },
      appearance: { ...initialSettings.appearance, ...next.values?.appearance } }
    applyOfficialBrand(values)
    Object.entries(brandingStyles(values)).forEach(([key, value]) => document.documentElement.style.setProperty(key, value))
    document.documentElement.dataset.density = values.appearance.density
    document.title = values.identity.systemName
    setConfiguration({ ...next, values })
  }, [])
  const reload = useCallback(async () => {
    const { data } = await api.get('/system-settings/public')
    publish(data)
    return data
  }, [publish])
  useEffect(() => { reload().catch(() => {}) }, [reload])
  useEffect(() => {
    const refresh = () => { if (!document.hidden) reload().catch(() => {}) }
    const timer = window.setInterval(refresh, 60000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [reload])
  const context = useMemo(() => ({ ...configuration, reload, publish }), [configuration, reload, publish])
  return <SystemSettingsContext.Provider value={context}>{children}</SystemSettingsContext.Provider>
}
