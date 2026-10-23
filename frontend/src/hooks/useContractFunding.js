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
  const [catalog, setCatalog] = useState({ scope: '', loading: false, error: '' })
  const [preview, setPreview] = useState({ key: '', quote: null, loading: false, error: '' })
  const [requestKey] = useState(() => crypto.randomUUID())
  const [revision, setRevision] = useState(0)
  const scope = `${kind}:${kind === 'FUEL' ? stationId : ''}`
  useEffect(() => {
    if (mode.enabled !== true || mode.error || (kind === 'FUEL' && !stationId)) return undefined
    let active = true
    setCatalog({ scope, loading: true, error: '' })
    setContracts([])
    contractControlAPI.eligible({ kind, fuel_station_id: kind === 'FUEL' ? stationId : undefined }).then(({ data }) => {
      if (active) { setContracts(data || []); setCatalog({ scope, loading: false, error: '' }) }
    }).catch((err) => {
      if (active) setCatalog({ scope, loading: false, error: getApiErrorMessage(err, 'Não foi possível consultar os contratos disponíveis.') })
    })
    return () => { active = false }
  }, [mode.enabled, mode.error, kind, stationId, scope, revision])

  const currentContracts = mode.enabled === true && catalog.scope === scope && (kind !== 'FUEL' || stationId) ? contracts : []
  const contract = kind === 'FUEL' ? (currentContracts.length === 1 ? currentContracts[0] : null)
    : currentContracts.find((c) => c.id === selection.contract) || (!selection.contract && currentContracts.length === 1 ? currentContracts[0] : null)
  const providers = (contract?.providers || []).filter((p) => kind !== 'FUEL' || p.fuel_station_id === stationId)
  const provider = kind === 'FUEL' ? (providers.length === 1 ? providers[0] : null)
    : providers.find((p) => p.id === selection.provider) || (providers.length === 1 ? providers[0] : null)
  const conflict = kind === 'FUEL' && (currentContracts.length > 1 || (contract && providers.length !== 1))
    ? 'O posto possui um vínculo contratual inconsistente. A gestão precisa manter apenas um contrato ativo para este posto.' : ''
  const fuels = useMemo(() => [...new Set((contract?.prices || []).filter((p) => p.provider_id === provider?.id
    && new Date(p.valid_from).getTime() <= Date.now() && (!p.valid_until || new Date(p.valid_until).getTime() > Date.now()))
    .map((p) => p.fuel_type))], [contract, provider])
  const selectedFuel = fuelType !== undefined ? fuelType : fuels.includes(selection.fuel) ? selection.fuel : fuels.length === 1 ? fuels[0] : ''
  const contractId = contract?.id
  const providerId = provider?.id
  const itemQuantities = itemLiters ? JSON.stringify(itemLiters) : ''
  const quoteKey = JSON.stringify([contractId, providerId, selectedFuel, String(liters), itemQuantities, revision])
  const needsQuote = mode.enabled === true && kind === 'FUEL' && contractId && providerId && selectedFuel && Number(liters) > 0
  const quote = preview.key === quoteKey ? preview.quote : null
  const previewError = preview.key === quoteKey ? preview.error : ''
  const previewPending = Boolean(needsQuote && (preview.key !== quoteKey || preview.loading))
  const catalogPending = Boolean(mode.enabled === true && (kind !== 'FUEL' || stationId) && (catalog.scope !== scope || catalog.loading))
  const catalogError = catalog.scope === scope ? catalog.error : ''
  useEffect(() => {
    if (mode.enabled !== true || kind !== 'FUEL' || !contractId || !providerId || !selectedFuel || !(Number(liters) > 0)) {
      setPreview({ key: quoteKey, quote: null, loading: false, error: '' })
      return undefined
    }
    let active = true
    setPreview({ key: quoteKey, quote: null, loading: true, error: '' })
    const timer = setTimeout(() => {
      contractControlAPI.quote(contractId, { provider_id: providerId, fuel_type: selectedFuel, liters: String(liters),
        ...(itemQuantities ? { item_liters: JSON.parse(itemQuantities) } : {}) }).then(({ data }) => {
        if (active) setPreview({ key: quoteKey, quote: data, loading: false, error: '' })
      }).catch((err) => {
        if (active) setPreview({ key: quoteKey, quote: null, loading: false, error: getApiErrorMessage(err, 'Não foi possível calcular a reserva.') })
      })
    }, 200)
    return () => { active = false; clearTimeout(timer) }
  }, [mode.enabled, kind, contractId, providerId, selectedFuel, liters, itemQuantities, revision, quoteKey])
  const enough = kind === 'FUEL' ? quote?.sufficient : Number(estimatedCost) > 0 && Number(contract?.available_balance) >= Number(estimatedCost)
  const ready = Boolean(mode.enabled === false || (mode.enabled === true && !mode.error && !catalogPending && !catalogError && !conflict
    && contract && provider && enough && (kind !== 'FUEL' || (!previewPending && quote && !previewError))))
  return {
    ...mode, contracts: currentContracts, contract, providers, provider, fuels,
    fuelType: selectedFuel, kind, stationId, quote, estimatedCost,
    loading: mode.enabled === null || catalogPending || previewPending,
    error: mode.error || catalogError || conflict || previewError, ready,
    selectContract: (value) => setSelection({ contract: value, provider: '', fuel: '' }),
    selectProvider: (value) => setSelection((s) => ({ ...s, provider: value, fuel: '' })),
    selectFuel: (value) => setSelection((s) => ({ ...s, fuel: value })),
    refresh: () => { if (mode.error) mode.reload(); setRevision((r) => r+1) },
    payload: mode.enabled === false || !ready ? {} : { contract_id: contractId, contract_provider_id: providerId,
      requested_fuel_type: selectedFuel, expected_price_id: quote?.price_id, request_key: requestKey },
  }
}
