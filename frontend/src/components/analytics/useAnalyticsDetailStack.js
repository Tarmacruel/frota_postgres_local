import { useCallback, useMemo, useState } from 'react'

export default function useAnalyticsDetailStack() {
  const [stack, setStack] = useState([])
  const open = useCallback((detail) => setStack((items) => [...items, detail]), [])
  const replace = useCallback((detail) => setStack((items) => items.length ? [...items.slice(0, -1), detail] : [detail]), [])
  const back = useCallback(() => setStack((items) => items.slice(0, -1)), [])
  const close = useCallback(() => setStack([]), [])
  return useMemo(() => ({ stack, current: stack.at(-1) || null, isOpen: stack.length > 0,
    canGoBack: stack.length > 1, open, replace, back, close }), [stack, open, replace, back, close])
}
