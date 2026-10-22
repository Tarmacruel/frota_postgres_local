import { useEffect, useMemo, useState } from 'react'
import { contractControlAPI } from '../api/contractControl'
import { getApiErrorMessage } from '../utils/apiError'

export function useContractControl() {
  const [state, setState] = useState({ enabled: null, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    contractControlAPI.config().then(({ data }) => {
      if (active) setState({ enabled: Boolean(data.enabled), error: '' })
    }).catch((err) => {
      if (active) setState({ enabled: true, error: getApiErrorMessage(err, 'Não foi possível conferir o controle contratual. Atualize a tela.') })
    })
    return () => { active = false }
  }, [revision])
  return { ...state, reload: () => { setState({ enabled: null, error: '' }); setRevision((r) => r+1) } }
}

export default function useContractFunding({ kind = 'FUEL', stationId = '', liters, itemLiters, fuelType, estimatedCost, initialContractId = '' }) {
  const mode = useContractControl()
  const [contracts, setContracts] = useState([])
  const [selection, setSelection] = useState({ contract: initialContractId, provider: '', fuel: '' })
  const [catalog, setCatalog] = useState({ loading: false, error: '' })
  const [preview, setPreview] = useState({ quote: null, loading: false, error: '' })
  const [requestKey] = useState(() => crypto.randomUUID())
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (mode.enabled !== true || mode.error || (kind === 'FUEL' && !stationId)) return undefined
    let active = true
    setCatalog({ loading: true, error: '' })
    setContracts([])
    contractControlAPI.eligible({ kind, fuel_station_id: kind === 'FUEL' ? stationId : undefined }).then(({ data }) => {
      if (active) { setContracts(data || []); setCatalog({ loading: false, error: '' }) }
    }).catch((err) => {
      if (active) setCatalog({ loading: false, error: getApiErrorMessage(err, 'Não foi possível consultar os contratos disponíveis.') })
    })
    return () => { active = false }
  }, [mode.enabled, mode.error, kind, stationId, revision])

  const contract = contracts.find((c) => c.id === selection.contract) || (!selection.contract && contracts.length === 1 ? contracts[0] : null)
  const providers = contract?.providers || []
  const provider = providers.find((p) => p.id === selection.provider) || (providers.length === 1 ? providers[0] : null)
  const fuels = useMemo(() => [...new Set((contract?.prices || []).filter((p) => p.provider_id === provider?.id
    && new Date(p.valid_from).getTime() <= Date.now() && (!p.valid_until || new Date(p.valid_until).getTime() > Date.now()))
    .map((p) => p.fuel_type))], [contract, provider])
  const selectedFuel = fuelType !== undefined ? fuelType : fuels.includes(selection.fuel) ? selection.fuel : fuels.length === 1 ? fuels[0] : ''
  const contractId = contract?.id
  const providerId = provider?.id
  const itemQuantities = itemLiters ? JSON.stringify(itemLiters) : ''
  useEffect(() => {
    if (mode.enabled !== true || kind !== 'FUEL' || !contractId || !providerId || !selectedFuel || !(Number(liters) > 0)) {
      setPreview({ quote: null, loading: false, error: '' })
      return undefined
    }
    let active = true
    setPreview({ quote: null, loading: true, error: '' })
    const timer = setTimeout(() => {
      contractControlAPI.quote(contractId, { provider_id: providerId, fuel_type: selectedFuel, liters: String(liters),
        ...(itemQuantities ? { item_liters: JSON.parse(itemQuantities) } : {}) }).then(({ data }) => {
        if (active) setPreview({ quote: data, loading: false, error: '' })
      }).catch((err) => {
        if (active) setPreview({ quote: null, loading: false, error: getApiErrorMessage(err, 'Não foi possível calcular a reserva.') })
      })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [mode.enabled, kind, contractId, providerId, selectedFuel, liters, itemQuantities, revision])
  const enough = kind === 'FUEL' ? preview.quote?.sufficient : Number(estimatedCost) > 0 && Number(contract?.available_balance) >= Number(estimatedCost)
  const ready = Boolean(mode.enabled === false || (mode.enabled === true && !mode.error && !catalog.loading && !catalog.error
    && contract && provider && enough && (kind !== 'FUEL' || (!preview.loading && preview.quote && !preview.error))))
  return {
    ...mode, contracts: kind === 'FUEL' && !stationId ? [] : contracts, contract, providers, provider, fuels,
    fuelType: selectedFuel, kind, stationId, quote: preview.quote, estimatedCost,
    loading: mode.enabled === null || catalog.loading || preview.loading,
    error: mode.error || catalog.error || preview.error, ready,
    selectContract: (value) => setSelection({ contract: value, provider: '', fuel: '' }),
    selectProvider: (value) => setSelection((s) => ({ ...s, provider: value, fuel: '' })),
    selectFuel: (value) => setSelection((s) => ({ ...s, fuel: value })),
    refresh: () => { if (mode.error) mode.reload(); setRevision((r) => r+1) },
    payload: mode.enabled === false ? {} : { contract_id: contractId, contract_provider_id: providerId,
      requested_fuel_type: selectedFuel, expected_price_id: preview.quote?.price_id, request_key: requestKey },
  }
}
