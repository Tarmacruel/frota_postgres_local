import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'

export function useInteractiveKpis(parameter = 'indicator') {
  const [params, setParams] = useSearchParams()
  const [metadata, setMetadata] = useState(null)
  const selected = params.get(parameter) || 'total'

  function select(key) {
    const next = new URLSearchParams(params)
    if (!key || key === 'total' || key === selected) next.delete(parameter)
    else next.set(parameter, key)
    next.delete('focus')
    setParams(next)
  }

  return { selected, metadata, setMetadata, select, parameter }
}
