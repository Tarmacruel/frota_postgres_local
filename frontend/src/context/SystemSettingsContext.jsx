import { activeSeasonalTheme, brandingStyles, initialSettings } from '../utils/systemBranding'
import { SystemSettingsContext } from './systemSettingsStore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '../api/client'
import { applyOfficialBrand } from '../constants/officialBrand'


export function SystemSettingsProvider({ children }) {
  const [configuration, setConfiguration] = useState({ values: initialSettings, revision: 0 })
  const requestVersion = useRef(0)
  const expiryTimer = useRef(undefined)
  const publish = useCallback((next) => {
    requestVersion.current += 1
    window.clearTimeout(expiryTimer.current)
    const values = { ...initialSettings, ...next.values,
      identity: { ...initialSettings.identity, ...next.values?.identity },
      appearance: { ...initialSettings.appearance, ...next.values?.appearance } }
    applyOfficialBrand(values)
    const root = document.documentElement
    root.dataset.density = values.appearance.density
    document.title = values.identity.systemName

    function applyAppearance() {
      const theme = activeSeasonalTheme(next.seasonal_theme)
      Object.entries(brandingStyles(values, theme?.style)).forEach(([key, value]) => root.style.setProperty(key, value))
      if (theme) {
        root.dataset.seasonalTheme = theme.id
        const remaining = Date.parse(theme.expires_at) - Date.now()
        expiryTimer.current = window.setTimeout(applyAppearance, Math.min(remaining, 2_147_483_647))
      } else {
        delete root.dataset.seasonalTheme
      }
      setConfiguration({ ...next, values })
    }

    applyAppearance()
  }, [])
  const reload = useCallback(async () => {
    const version = ++requestVersion.current
    const { data } = await api.get('/system-settings/public')
    if (version === requestVersion.current) publish(data)
    return data
  }, [publish])
  useEffect(() => {
    reload().catch(() => {})
    return () => {
      requestVersion.current += 1
      window.clearTimeout(expiryTimer.current)
    }
  }, [reload])
  useEffect(() => {
    const refresh = () => { if (!document.hidden) reload().catch(() => {}) }
    const timer = window.setInterval(refresh, 60000)
    document.addEventListener('visibilitychange', refresh)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh) }
  }, [reload])
  const context = useMemo(() => ({ ...configuration, reload, publish }), [configuration, reload, publish])
  return <SystemSettingsContext.Provider value={context}>{children}</SystemSettingsContext.Provider>
}
