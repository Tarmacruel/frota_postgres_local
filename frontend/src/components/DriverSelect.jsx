import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { driversAPI } from '../api/drivers'
import SearchableSelect from './SearchableSelect'

function buildOption(driver) {
  const organizationLabel = driver.organization_name || 'Sem secretaria'
  return {
    value: driver.id,
    label: driver.nome_completo,
    description: `${organizationLabel} | ${driver.documento} | CNH ${driver.cnh_categoria}${driver.contato ? ` | ${driver.contato}` : ''}`,
    keywords: [driver.nome_completo, driver.documento, driver.contato, driver.email, organizationLabel].filter(Boolean).join(' '),
    driver,
  }
}

function mergeDriver(list, driver) {
  if (!driver?.id) return list
  const exists = list.some((item) => String(item.id) === String(driver.id))
  return exists ? list : [driver, ...list]
}

export default function DriverSelect({
  value,
  onChange,
  disabled = false,
  placeholder = 'Selecione o condutor',
  ariaLabel = 'Condutor',
  allowClear = false,
  clearLabel = 'Limpar seleção',
}) {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const requestSequenceRef = useRef(0)
  const searchTimerRef = useRef(null)

  const loadDrivers = useCallback(async (search = '') => {
    const requestId = ++requestSequenceRef.current

    try {
      setLoading(true)
      const normalizedSearch = search.trim()
      const { data } = await driversAPI.listActive({
        search: normalizedSearch || undefined,
        limit: 30,
      })

      if (requestId === requestSequenceRef.current) {
        setDrivers(Array.isArray(data) ? data : [])
      }
    } catch {
      if (requestId === requestSequenceRef.current) {
        setDrivers([])
      }
    } finally {
      if (requestId === requestSequenceRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadDrivers()

    return () => {
      requestSequenceRef.current += 1
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current)
      }
    }
  }, [loadDrivers])

  useEffect(() => {
    if (!value) return

    const alreadyLoaded = drivers.some((driver) => String(driver.id) === String(value))
    if (alreadyLoaded) return

    let cancelled = false

    async function loadSelectedDriver() {
      try {
        const { data } = await driversAPI.getById(value)
        if (!cancelled && data) {
          setDrivers((current) => mergeDriver(current, data))
        }
      } catch {
        // Se o registro não puder ser recuperado, preserva o comportamento normal do seletor.
      }
    }

    loadSelectedDriver()

    return () => {
      cancelled = true
    }
  }, [value, drivers])

  const options = useMemo(() => drivers.map(buildOption), [drivers])

  const handleSearch = useCallback((query) => {
    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current)
    }

    searchTimerRef.current = window.setTimeout(() => {
      loadDrivers(query)
    }, 300)
  }, [loadDrivers])

  function handleSelect(nextValue) {
    const nextOption = options.find((option) => String(option.value) === String(nextValue))
    onChange?.(nextOption?.driver || null)
  }

  return (
    <SearchableSelect
      value={value}
      onChange={handleSelect}
      options={options}
      placeholder={loading && drivers.length === 0 ? 'Carregando condutores...' : placeholder}
      searchPlaceholder="Buscar por nome, documento ou secretaria"
      emptyLabel="Nenhum condutor ativo encontrado."
      loadingLabel="Buscando condutores..."
      disabled={disabled}
      ariaLabel={ariaLabel}
      allowClear={allowClear}
      clearLabel={clearLabel}
      remoteSearch
      onSearch={handleSearch}
      loading={loading}
    />
  )
}
