import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

// Keep consultation state when a contract drawer closes or an order returns.
export default function useContractFilters(prefix, defaults) {
  const [params, setParams] = useSearchParams()
  const filterKey = JSON.stringify(Object.fromEntries(Object.keys(defaults).map((name) => [name, params.get(`${prefix}_${name}`) ?? defaults[name]])))
  const filters = useMemo(() => JSON.parse(filterKey), [filterKey])
  const parsedPage = Number(params.get(`${prefix}_page`))
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  function update(name, value) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(`${prefix}_${name}`, value)
      else next.delete(`${prefix}_${name}`)
      next.delete(`${prefix}_page`)
      return next
    }, { replace: true })
  }
  function setPage(value) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value > 1) next.set(`${prefix}_page`, value)
      else next.delete(`${prefix}_page`)
      return next
    })
  }
  return { filters, page, update, setPage, params }
}
