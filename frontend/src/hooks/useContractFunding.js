import { useEffect, useMemo, useState } from 'react'
import { contractControlAPI } from '../api/contractControl'
import { getApiErrorMessage } from '../utils/apiError'

export function useContractControl() {
  const [state, setState] = useState({ enabled: null, quantityEnabled: false, error: '' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    contractControlAPI.config().then(({ data }) => {
      if (active) setState({ enabled: Boolean(data.enabled), quantityEnabled: Boolean(data.quantity_enabled), error: '' })
    }).catch((err) => {
      if (active) setState({ enabled: true, quantityEnabled: false, error: getApiErrorMessage(err, 'Não foi possível conferir o controle contratual. Atualize a tela.') })
    })
    return () => { active = false }
  }, [revision])
  return { ...state, reload: () => { setState({ enabled: null, quantityEnabled: false, error: '' }); setRevision((r) => r+1) } }
}

const key = (value) => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()

export default function useContractFunding({ kind = 'FUEL', stationId = '', liters, itemLiters, fuelType, additiveType, additiveLiters, maintenanceLines = [], estimatedCost, initialContractId = '' }) {
  const mode = useContractControl()
  const [contracts, setContracts] = useState([])
  const [selection, setSelection] = useState({ contract: initialContractId, provider: '', fuel: '', item: '', additive: '', additiveQuantity: '' })
  const [catalog, setCatalog] = useState({ scope: '', loading: false, error: '' })
  const [preview, setPreview] = useState({ key: '', quote: null, loading: false, error: '' })
  const [requestKey] = useState(() => crypto.randomUUID())
  const [revision, setRevision] = useState(0)
  const scope = `${kind}:${kind === 'FUEL' ? stationId : ''}:${initialContractId}`
  useEffect(() => {
    if (mode.enabled !== true || mode.error || (kind === 'FUEL' && !stationId)) return undefined
    let active = true
    setCatalog({ scope, loading: true, error: '' }); setContracts([])
    contractControlAPI.eligible({ kind, fuel_station_id: kind === 'FUEL' ? stationId : undefined }).then(({ data }) => {
      if (active) { setContracts(data || []); setCatalog({ scope, loading: false, error: '' }) }
    }).catch((err) => {
      if (active) setCatalog({ scope, loading: false, error: getApiErrorMessage(err, 'Não foi possível consultar os contratos disponíveis.') })
    })
    return () => { active = false }
  }, [mode.enabled, mode.error, kind, stationId, scope, revision])
  const scopedContracts = mode.enabled === true && catalog.scope === scope && (kind !== 'FUEL' || stationId) ? contracts : []
  const currentContracts = initialContractId ? scopedContracts.filter((row) => row.id === initialContractId) : scopedContracts
  const contract = currentContracts.find((c) => c.id === (initialContractId || (selection.scope === scope ? selection.contract : ''))) || (currentContracts.length === 1 ? currentContracts[0] : null)
  const providers = (contract?.providers || []).filter((p) => kind !== 'FUEL' || p.fuel_station_id === stationId)
  const provider = kind === 'FUEL' ? (providers.length === 1 ? providers[0] : null) : providers.find((p) => p.id === selection.provider) || (providers.length === 1 ? providers[0] : null)
  const conflict = initialContractId && kind === 'FUEL' && scopedContracts.length && !currentContracts.length
    ? 'O posto selecionado não pertence ao contrato de origem.' : kind === 'FUEL' && contract && providers.length !== 1 ? 'O posto possui um vínculo inconsistente neste contrato. Solicite a conferência à gestão.' : ''
  const contextual = selection.scope === scope ? selection : {}
  const fuels = useMemo(() => [...new Set((contract?.prices || []).filter((p) => p.provider_id === provider?.id && new Date(p.valid_from).getTime() <= Date.now() && (!p.valid_until || new Date(p.valid_until).getTime() > Date.now())).map((p) => p.fuel_type))], [contract, provider])
  const selectedFuel = fuelType !== undefined ? fuelType : fuels.includes(contextual.fuel) ? contextual.fuel : fuels.length === 1 ? fuels[0] : ''
  const items = contract?.items || []
  const itemPrices = (contract?.item_prices || []).filter((p) => p.provider_id === provider?.id && p.current)
  const mainItems = items.filter((r) => r.category === 'FUEL' && key(r.product_key) === key(selectedFuel) && itemPrices.some((p) => p.item_id === r.id))
  const mainItem = mainItems.find((r) => r.id === contextual.item) || (mainItems.length === 1 ? mainItems[0] : null)
  const additiveItems = items.filter((r) => r.category === 'ADDITIVE' && itemPrices.some((p) => p.item_id === r.id))
  const additive = additiveType !== undefined ? additiveItems.find((r) => key(r.product_key) === key(additiveType)) : additiveItems.find((r) => r.id === contextual.additive)
  const extraQuantity = additiveType !== undefined ? additiveLiters : contextual.additiveQuantity
  const wantsAdditive = Boolean(additiveType !== undefined ? additiveType : contextual.additive)
  const extraError = mode.quantityEnabled && wantsAdditive && (!additive || !(Number(extraQuantity) > 0)) ? 'Selecione o item do aditivo e informe sua quantidade prevista.' : ''
  const multiplier = itemLiters?.length || 1
  const buildItemLines = (amount) => !mode.quantityEnabled || !mainItem ? [] : [{ item_id: mainItem.id, quantity: String(amount) }, ...(additive && Number(extraQuantity) > 0 ? [{ item_id: additive.id, quantity: String(extraQuantity) }] : [])]
  const fuelLines = buildItemLines(liters).map((line, i) => i === 0 ? line : { ...line, quantity: String(Number(line.quantity)*multiplier) })
  const requestedLines = kind === 'FUEL' ? fuelLines : maintenanceLines
  const contractId = contract?.id, providerId = provider?.id
  const quantitiesKey = JSON.stringify(itemLiters || [])
  const linesKey = JSON.stringify(requestedLines)
  const quoteKey = JSON.stringify([contractId, providerId, selectedFuel, String(liters), quantitiesKey, mode.quantityEnabled ? linesKey : '', revision])
  const needsQuote = Boolean(mode.enabled && contractId && providerId && !extraError && (kind === 'FUEL' ? selectedFuel && Number(liters) > 0 && (!mode.quantityEnabled || mainItem) : mode.quantityEnabled && maintenanceLines.length))
  const quote = preview.key === quoteKey ? preview.quote : null
  const previewError = preview.key === quoteKey ? preview.error : ''
  const previewPending = Boolean(needsQuote && (preview.key !== quoteKey || preview.loading))
  const catalogPending = Boolean(mode.enabled === true && (kind !== 'FUEL' || stationId) && (catalog.scope !== scope || catalog.loading))
  const catalogError = catalog.scope === scope ? catalog.error : ''
  useEffect(() => {
    if (!needsQuote) { setPreview({ key: quoteKey, quote: null, loading: false, error: '' }); return undefined }
    let active = true
    setPreview({ key: quoteKey, quote: null, loading: true, error: '' })
    const timer = setTimeout(() => {
      const request = kind === 'FUEL' ? contractControlAPI.quote(contractId, { provider_id: providerId, fuel_type: selectedFuel, liters: String(liters), ...(JSON.parse(quantitiesKey).length ? { item_liters: JSON.parse(quantitiesKey) } : {}), ...(mode.quantityEnabled ? { item_lines: JSON.parse(linesKey) } : {}) }) : contractControlAPI.itemQuote(contractId, { provider_id: providerId, lines: JSON.parse(linesKey) })
      request.then(({ data }) => { if (active) setPreview({ key: quoteKey, quote: data, loading: false, error: '' }) }).catch((err) => { if (active) setPreview({ key: quoteKey, quote: null, loading: false, error: getApiErrorMessage(err, 'Não foi possível calcular a reserva.') }) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [needsQuote, quoteKey, kind, contractId, providerId, selectedFuel, liters, quantitiesKey, linesKey, mode.quantityEnabled])
  const enough = kind === 'FUEL' || mode.quantityEnabled ? quote?.sufficient : Number(estimatedCost) > 0 && Number(contract?.available_balance) >= Number(estimatedCost)
  const ready = Boolean(mode.enabled === false || (mode.enabled === true && !mode.error && !catalogPending && !catalogError && !conflict && !extraError && contract && provider && enough && (!(kind === 'FUEL' || mode.quantityEnabled) || (!previewPending && quote && !previewError))))
  return {
    ...mode, contracts: currentContracts, contract, providers, provider, fuels, lockedContract: Boolean(initialContractId), fuelType: selectedFuel, kind, stationId, quote,
    estimatedCost: mode.quantityEnabled && kind !== 'FUEL' ? quote?.reserve_amount : estimatedCost,
    items, itemPrices, mainItems, mainItem, additiveItems, additive, additiveQuantity: extraQuantity, buildItemLines, externalAdditive: additiveType !== undefined,
    selectItem: (item) => setSelection((s) => ({ ...s, scope, item })), selectAdditive: (additive) => setSelection((s) => ({ ...s, scope, additive, additiveQuantity: '' })), setAdditiveQuantity: (additiveQuantity) => setSelection((s) => ({ ...s, scope, additiveQuantity })),
    loading: mode.enabled === null || catalogPending || previewPending, error: mode.error || catalogError || conflict || extraError || previewError, ready,
    selectContract: (value) => setSelection({ scope, contract: value, provider: '', fuel: '', item: '', additive: '', additiveQuantity: '' }),
    selectProvider: (value) => setSelection((s) => ({ ...s, scope, provider: value, fuel: '', item: '', additive: '', additiveQuantity: '' })), selectFuel: (value) => setSelection((s) => ({ ...s, scope, fuel: value, item: '' })),
    refresh: () => { if (mode.error) mode.reload(); setRevision((r) => r+1) },
    payload: mode.enabled === false || !ready ? {} : { contract_id: contractId, contract_provider_id: providerId, requested_fuel_type: selectedFuel, expected_price_id: quote?.price_id, request_key: requestKey, ...(mode.quantityEnabled ? { item_lines: requestedLines } : {}) },
  }
}
