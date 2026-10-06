import { useEffect, useRef, useState } from 'react'
import { justificationSuggestionsAPI } from '../api/justificationSuggestions'
import { useAuth } from '../context/AuthContext'

export function useReasonSuggestions(context, { userId, enabled = true } = {}) {
  const auth = useAuth()
  const actorId = auth?.user?.id ?? userId
  const identity = `${actorId || ''}:${context}`
  const activeIdentity = useRef(identity)
  activeIdentity.current = identity
  const [result, setResult] = useState(null)
  useEffect(() => {
    if (!enabled || !actorId) return undefined
    let active = true
    setResult(null)
    // No persistent cache: each form opening queries the account on the server.
    Promise.resolve().then(() => justificationSuggestionsAPI.list(context))
      .then(({ data }) => { if (active) setResult({ identity, presets: Array.isArray(data?.presets) ? data.presets : [], history: Array.isArray(data?.history) ? data.history : [] }) })
      .catch(() => { if (active) setResult({ identity, presets: [], history: [], unavailable: true }) })
    return () => { active = false }
  }, [actorId, context, identity, enabled])
  return {
    scope: identity,
    presets: enabled && result?.identity === identity ? result.presets : [],
    unavailable: result?.identity === identity && result.unavailable,
    history: enabled && result?.identity === identity ? result.history : [],
    async forget(id) {
      try {
        await justificationSuggestionsAPI.forget(id)
        if (activeIdentity.current === identity) {
          setResult((previous) => previous?.identity === identity
            ? { ...previous, history: previous.history.filter((item) => item.id !== id) } : previous)
        }
        return true
      } catch { return false }
    },
  }
}
