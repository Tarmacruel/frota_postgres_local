import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { driversAPI } from '../api/drivers'
import SearchableSelect from './SearchableSelect'
import DriverRegistrationModal from './DriverRegistrationModal'
import DriverLicenseNotice from './DriverLicenseNotice'
import { getCnhIssues } from '../utils/driverLicense'

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
  checkLicense = requireRegistration,
}) {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingDriver, setPendingDriver] = useState(null)
  const [selectedDetails, setSelectedDetails] = useState(null)
  const [licenseRefreshing, setLicenseRefreshing] = useState(false)
  const [licenseRefreshError, setLicenseRefreshError] = useState('')
  const [licenseFeedback, setLicenseFeedback] = useState('')
  const licenseRequestRef = useRef(0)
  const licenseBusyRef = useRef(false)
  const editingLicenseRef = useRef(false)
  const onChangeRef = useRef(onChange)
  const requestSequenceRef = useRef(0)
  const searchTimerRef = useRef(null)

  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => {
    licenseRequestRef.current += 1
    licenseBusyRef.current = false
    editingLicenseRef.current = false
    setLicenseRefreshing(false); setLicenseRefreshError(''); setLicenseFeedback('')
    return () => { licenseRequestRef.current += 1 }
  }, [value])

  const refreshLicense = useCallback(async () => {
    if (!value || !checkLicense || disabled || licenseBusyRef.current) return
    licenseBusyRef.current = true
    const sequence = ++licenseRequestRef.current
    setLicenseRefreshing(true); setLicenseRefreshError(''); setLicenseFeedback('')
    try {
      const { data } = await driversAPI.getById(value)
      if (sequence !== licenseRequestRef.current) return
      if (!data || String(data.id) !== String(value)) throw new Error('Cadastro indisponível')
      setSelectedDetails(data)
      setDrivers((current) => [data, ...current.filter((item) => String(item.id) !== String(data.id))])
      editingLicenseRef.current = false
      onChangeRef.current?.(data)
      setLicenseFeedback(getCnhIssues(data).length ? 'Consulta concluída. As pendências da CNH permanecem; regularize os dados indicados acima.' : 'Dados do condutor atualizados. A CNH está sem pendências no cadastro.')
    } catch {
      if (sequence === licenseRequestRef.current) setLicenseRefreshError('Não foi possível atualizar o cadastro. O aviso anterior foi mantido; tente novamente.')
    } finally {
      if (sequence === licenseRequestRef.current) { licenseBusyRef.current = false; setLicenseRefreshing(false) }
    }
  }, [value, checkLicense, disabled])

  useEffect(() => {
    if (!value || !checkLicense) return undefined
    const onReturn = () => { if (editingLicenseRef.current && document.visibilityState !== 'hidden') refreshLicense() }
    window.addEventListener('focus', onReturn)
    document.addEventListener('visibilitychange', onReturn)
    return () => { window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn) }
  }, [value, checkLicense, refreshLicense])

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
          setSelectedDetails((current) => String(current?.id) === String(value) ? current : data)
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
  const selectedDriver = String(selectedDetails?.id) === String(value) ? selectedDetails : drivers.find((driver) => String(driver.id) === String(value))

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
    const nextDriver = nextOption?.driver && String(nextOption.driver.id) === String(selectedDetails?.id) ? selectedDetails : nextOption?.driver
    if (requireRegistration && nextDriver && !nextDriver.matricula?.trim()) {
      setPendingDriver(nextDriver)
      return
    }
    setSelectedDetails(nextDriver || null)
    onChange?.(nextDriver || null)
  }

  function handleRegistrationSaved(driver) {
    // Ignore older search responses that may still contain the incomplete record.
    requestSequenceRef.current += 1
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    setLoading(false)
    setDrivers((current) => [driver, ...current.filter((item) => String(item.id) !== String(driver.id))])
    setPendingDriver(null)
    setSelectedDetails(driver)
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
      {checkLicense && value && selectedDriver ? <DriverLicenseNotice driver={selectedDriver} disabled={disabled} refreshing={licenseRefreshing} error={licenseRefreshError} onEdit={() => { editingLicenseRef.current = true }} onRefresh={refreshLicense} /> : null}
      {checkLicense && licenseFeedback ? <p className="driver-license-refresh-status" role="status">{licenseFeedback}</p> : null}
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
