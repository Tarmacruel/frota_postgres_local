const DEFAULT_SIGNATURE_AGENT_URL = 'http://127.0.0.1:54174'
const DEFAULT_TIMEOUT_MS = 1800

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

export function resolveSignatureAgentUrl(env = import.meta.env) {
  const configured = trimTrailingSlash(env?.VITE_SIGNATURE_AGENT_URL || DEFAULT_SIGNATURE_AGENT_URL)

  try {
    const url = new URL(configured)
    const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]'])
    if (!loopbackHosts.has(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
      return DEFAULT_SIGNATURE_AGENT_URL
    }
    return url.origin
  } catch {
    return DEFAULT_SIGNATURE_AGENT_URL
  }
}

function createAgentError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined)
  error.code = code
  return error
}

async function readResponse(response) {
  if (response.status === 204) return null
  const contentType = response.headers?.get?.('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  const text = await response.text()
  return text ? { message: text } : null
}

async function agentRequest(path, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${resolveSignatureAgentUrl()}${path}`, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
    const data = await readResponse(response)
    if (!response.ok) {
      throw createAgentError(
        data?.detail || data?.message || `O agente respondeu com HTTP ${response.status}.`,
        'SIGNATURE_AGENT_HTTP_ERROR',
      )
    }
    return data
  } catch (error) {
    if (error?.code) throw error
    if (error?.name === 'AbortError') {
      throw createAgentError('O agente de assinatura não respondeu no tempo esperado.', 'SIGNATURE_AGENT_TIMEOUT', error)
    }
    throw createAgentError('O agente de assinatura não foi localizado neste computador.', 'SIGNATURE_AGENT_UNAVAILABLE', error)
  } finally {
    window.clearTimeout(timeout)
  }
}

function normalizeAgentRequest(session) {
  const envelope = session?.agent_request || session?.agentRequest || {}
  const provided = envelope.payload || envelope
  const sessionId = session?.id || session?.session_id

  return {
    session_id: provided.session_id || sessionId,
    one_time_token: provided.one_time_token
      || provided.token
      || session?.one_time_token
      || session?.agent_token
      || '',
    backend_base_url: provided.backend_base_url
      || session?.backend_base_url
      || session?.backend_url
      || import.meta.env.VITE_SIGNATURE_BACKEND_URL
      || 'http://127.0.0.1:8010',
    document_title: provided.document_title
      || session?.document_title
      || session?.document?.title
      || 'Documento eletrônico',
    document_type: provided.document_type
      || session?.document_type
      || session?.document?.type
      || 'DIGITAL_DOCUMENT',
    content_hash: provided.content_hash
      || session?.content_hash
      || session?.document_hash
      || session?.document?.sha256
      || '',
    expires_at: provided.expires_at || session?.expires_at,
  }
}

function normalizePairingRequest(pairing) {
  const envelope = pairing?.agent_request || pairing?.agentRequest || {}
  const provided = envelope.payload || envelope
  return {
    pairing_id: provided.pairing_id || pairing?.pairing_id || pairing?.id,
    pairing_code: provided.pairing_code || pairing?.pairing_code || '',
    backend_base_url: provided.backend_base_url
      || pairing?.backend_base_url
      || import.meta.env.VITE_SIGNATURE_BACKEND_URL
      || 'http://127.0.0.1:8010',
    expires_at: provided.expires_at || pairing?.expires_at,
  }
}

export const signatureAgentClient = {
  health: () => agentRequest('/health', { method: 'GET' }),
  openSession: (session) => {
    const payload = normalizeAgentRequest(session)
    return agentRequest('/v1/sign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, 5000)
  },
  pair: (pairing) => {
    const payload = normalizePairingRequest(pairing)
    return agentRequest('/v1/pair', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }, 60000)
  },
}
