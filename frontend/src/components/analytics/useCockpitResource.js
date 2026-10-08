import { useEffect, useState } from 'react'
import { getApiErrorMessage } from '../../utils/apiError'

export default function useCockpitResource(fetcher, query, revision, enabled = true) {
  const [resource, setResource] = useState({ data: null, loading: true, error: '' })
  const [retryTick, setRetryTick] = useState(0)
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    let current = true
    setResource({ data: null, loading: true, error: '', query })
    fetcher(query, controller.signal).then(({ data }) => {
      if (current) setResource({ data, loading: false, error: '', query })
    }).catch((error) => {
      if (current) setResource({ data: null, loading: false, error: getApiErrorMessage(error, 'Não foi possível carregar este bloco.'), query })
    })
    return () => { current = false; controller.abort() }
  }, [fetcher, query, revision, retryTick, enabled])
  return { ...(resource.query === query ? resource : { data: null, loading: true, error: '' }),
    onRetry: () => setRetryTick((value) => value + 1) }
}
