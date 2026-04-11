import { useEffect, useMemo, useState } from 'react'
import { driversAPI } from '../api/drivers'
import SearchableSelect from './SearchableSelect'

function buildOption(driver) {
  return {
    value: driver.id,
    label: driver.nome_completo,
    description: `${driver.documento} | CNH ${driver.cnh_categoria}${driver.contato ? ` | ${driver.contato}` : ''}`,
    keywords: [driver.nome_completo, driver.documento, driver.contato, driver.email].filter(Boolean).join(' '),
    driver,
  }
}

export default function DriverSelect({ value, onChange, disabled = false, placeholder = 'Selecione o condutor' }) {
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadDrivers() {
      try {
        setLoading(true)
        const { data } = await driversAPI.listActive({ limit: 200 })
        setDrivers(data)
      } catch {
        setDrivers([])
      } finally {
        setLoading(false)
      }
    }
    loadDrivers()
  }, [])

  const options = useMemo(() => drivers.map(buildOption), [drivers])

  function handleSelect(nextValue) {
    const nextOption = options.find((option) => option.value === nextValue)
    onChange?.(nextOption?.driver || null)
  }

  return (
    <SearchableSelect
      value={value}
      onChange={handleSelect}
      options={options}
      placeholder={loading ? 'Carregando condutores...' : placeholder}
      searchPlaceholder="Buscar por nome, documento ou contato"
      emptyLabel="Nenhum condutor ativo encontrado."
      disabled={disabled || loading}
    />
  )
}
