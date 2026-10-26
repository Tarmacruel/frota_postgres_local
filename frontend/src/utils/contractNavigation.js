const modulePath = '/processos-pagamento'
const positionKey = 'frota-contract-return-position'

export function safeContractReturn(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return ''
  try {
    const url = new URL(value, 'https://contract.local')
    if (url.origin !== 'https://contract.local' || url.pathname !== modulePath) return ''
    url.searchParams.delete('return_to')
    return url.pathname + url.search
  } catch { return '' }
}

export function contractOrderPath(kind, id, returnTo) {
  const query = new URLSearchParams({ action: 'create', contract_id: id })
  const destination = safeContractReturn(returnTo)
  if (destination) query.set('return_to', destination)
  return `${kind === 'FUEL' ? '/abastecimentos' : '/manutencoes'}?${query}`
}

export function rememberContractPosition(url, contractId) {
  try { sessionStorage.setItem(positionKey, JSON.stringify({ url, contractId, top: window.scrollY })) } catch { /* Storage may be unavailable. */ }
}

export function restoreContractPosition(url) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(positionKey) || 'null')
    if (saved?.url !== url) return
    sessionStorage.removeItem(positionKey)
    window.scrollTo({ top: Number(saved.top) || 0, behavior: 'instant' })
  } catch { /* Navigation still works without restoring scroll. */ }
}
