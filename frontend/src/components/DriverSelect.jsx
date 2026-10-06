import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { driversAPI } from '../api/drivers'
import SearchableSelect from './SearchableSelect'
import DriverRegistrationModal from './DriverRegistrationModal'

function buildOption(driver) {
  const organizationLabel = driver.organization_name || 'Sem secretaria'
  return {
    value: driver.id,
    label: driver.nome_completo,
    description: `${organizationLabel} | ${driver.documento} | ${driver.matricula ? `Matrícula ${driver.matricula}` : 'Matrícula não informada'} | CNH ${driver.cnh_categoria}${driver.contato ? ` | ${driver.contato}` : ''}`,
    keywords: [driver.nome_completo, driver.documento, driver.matricula, driver.contato, driver.email, organizationLabel].filter(Boolean).join(' '),
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
  requireRegistration = true,
}) {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingDriver, setPendingDriver] = useState(null)
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

  useEffect(() => {
    if (!requireRegistration || disabled || pendingDriver || !value) return
    const selected = drivers.find((driver) => String(driver.id) === String(value))
    if (selected && !selected.matricula?.trim()) {
      setPendingDriver(selected)
      onChange?.(null)
    }
  }, [value, drivers, requireRegistration, disabled, pendingDriver, onChange])

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
    if (requireRegistration && nextOption?.driver && !nextOption.driver.matricula?.trim()) {
      setPendingDriver(nextOption.driver)
      return
    }
    onChange?.(nextOption?.driver || null)
  }

  function handleRegistrationSaved(driver) {
    // Ignore older search responses that may still contain the incomplete record.
    requestSequenceRef.current += 1
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    setLoading(false)
    setDrivers((current) => [driver, ...current.filter((item) => String(item.id) !== String(driver.id))])
    setPendingDriver(null)
    onChange?.(driver)
  }

  return (
    <>
      <SearchableSelect
        value={value}
        onChange={handleSelect}
        options={options}
        placeholder={loading && drivers.length === 0 ? 'Carregando condutores...' : placeholder}
        searchPlaceholder="Buscar por nome, matrícula, documento ou secretaria"
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
      {pendingDriver ? (
        <DriverRegistrationModal
          key={pendingDriver.id}
          driver={pendingDriver}
          onSaved={handleRegistrationSaved}
          onClose={() => setPendingDriver(null)}
        />
      ) : null}
    </>
  )
}
