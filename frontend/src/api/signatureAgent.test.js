import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSignatureAgentUrl, signatureAgentClient } from './signatureAgent'

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => 'application/json' },
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn(),
  }
}

describe('signatureAgentClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('rejeita configuração remota e mantém o agente restrito ao loopback', () => {
    expect(resolveSignatureAgentUrl({ VITE_SIGNATURE_AGENT_URL: 'https://assinador.exemplo.gov.br' }))
      .toBe('http://127.0.0.1:54174')
    expect(resolveSignatureAgentUrl({ VITE_SIGNATURE_AGENT_URL: 'http://127.0.0.1:54174/' }))
      .toBe('http://127.0.0.1:54174')
  })

  it('detecta o agente sem enviar credenciais do navegador', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ version: '1.0.0' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(signatureAgentClient.health()).resolves.toEqual({ version: '1.0.0' })
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:54174/health', expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
    }))
  })

  it('entrega o contrato estrito ao agente sem colocar o token no endereço', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ accepted: true }))
    vi.stubGlobal('fetch', fetchMock)

    await signatureAgentClient.openSession({
      id: 'session-1',
      agent_token: 'token-ultrassecreto',
      document_id: 'document-1',
      content_hash: 'a'.repeat(64),
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:54174/v1/sign')
    expect(url).not.toContain('token-ultrassecreto')
    expect(options.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(options.body)).toEqual(expect.objectContaining({
      session_id: 'session-1',
      one_time_token: 'token-ultrassecreto',
      backend_base_url: 'http://127.0.0.1:8010',
      content_hash: 'a'.repeat(64),
    }))
    expect(options.credentials).toBe('omit')
  })

  it('encaminha um pareamento efêmero ao endpoint local esperado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'paired', device_id: 'a'.repeat(64) }))
    vi.stubGlobal('fetch', fetchMock)

    await signatureAgentClient.pair({
      id: '951724b6-653d-4d16-a2b3-e731edcd150a',
      pairing_code: '123456',
      backend_base_url: 'http://127.0.0.1:8010',
      expires_at: '2026-08-17T15:10:00Z',
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:54174/v1/pair')
    expect(JSON.parse(options.body)).toEqual({
      pairing_id: '951724b6-653d-4d16-a2b3-e731edcd150a',
      pairing_code: '123456',
      backend_base_url: 'http://127.0.0.1:8010',
      expires_at: '2026-08-17T15:10:00Z',
    })
    expect(options.credentials).toBe('omit')
  })
})
