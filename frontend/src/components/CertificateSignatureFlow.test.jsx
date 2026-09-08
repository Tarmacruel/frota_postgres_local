import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CertificateSignatureFlow from './CertificateSignatureFlow'

const mocks = vi.hoisted(() => ({
  health: vi.fn(),
  openSession: vi.fn(),
  pair: vi.fn(),
  createCertificateSession: vi.fn(),
  getCertificateSession: vi.fn(),
  cancelCertificateSession: vi.fn(),
  getDocument: vi.fn(),
  downloadAgent: vi.fn(),
  getAgentManifest: vi.fn(),
  createAgentPairing: vi.fn(),
  getAgentPairing: vi.fn(),
  listAgentDevices: vi.fn(),
  revokeAgentDevice: vi.fn(),
  downloadBlobResponse: vi.fn(),
}))

vi.mock('../api/signatureAgent', () => ({
  signatureAgentClient: {
    health: mocks.health,
    openSession: mocks.openSession,
    pair: mocks.pair,
  },
}))

vi.mock('../api/documentSignatures', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    documentSignaturesAPI: {
      createCertificateSession: mocks.createCertificateSession,
      getCertificateSession: mocks.getCertificateSession,
      cancelCertificateSession: mocks.cancelCertificateSession,
      getDocument: mocks.getDocument,
      downloadAgent: mocks.downloadAgent,
      getAgentManifest: mocks.getAgentManifest,
      createAgentPairing: mocks.createAgentPairing,
      getAgentPairing: mocks.getAgentPairing,
      listAgentDevices: mocks.listAgentDevices,
      revokeAgentDevice: mocks.revokeAgentDevice,
    },
  }
})

vi.mock('../utils/downloadResponse', () => ({
  downloadBlobResponse: mocks.downloadBlobResponse,
}))

describe('CertificateSignatureFlow', () => {
  const deviceId = 'a'.repeat(64)

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.health.mockResolvedValue({ version: '1.0.0-hml', device_id: deviceId })
    mocks.openSession.mockResolvedValue({ accepted: true })
    mocks.pair.mockResolvedValue({ status: 'paired', device_id: deviceId })
    mocks.listAgentDevices.mockResolvedValue({ data: [{ device_id: deviceId, status: 'ACTIVE' }] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cria a sessão, chama o agente e acompanha até a conclusão', async () => {
    const user = userEvent.setup()
    const onDocumentChanged = vi.fn()
    const onFeedback = vi.fn()
    const created = {
      id: 'session-1',
      status: 'CREATED',
      agent_token: 'one-time',
      document_id: 'document-1',
    }
    mocks.createCertificateSession.mockResolvedValue({ data: created })
    mocks.getCertificateSession.mockResolvedValue({ data: { ...created, status: 'COMPLETED' } })
    mocks.getDocument.mockResolvedValue({ data: { document_id: 'document-1', status: 'COMPLETED' } })

    render(
      <CertificateSignatureFlow
        documentId="document-1"
        contentHash="abc123def456"
        onDocumentChanged={onDocumentChanged}
        onFeedback={onFeedback}
        pollIntervalMs={5}
      />,
    )

    await screen.findByText('Agente pareado para este usuário')
    await user.click(screen.getByRole('button', { name: 'Iniciar assinatura ICP-Brasil' }))

    expect(mocks.createCertificateSession).toHaveBeenCalledWith('document-1', { device_id: deviceId })
    expect(mocks.openSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'session-1' }))
    await waitFor(() => expect(mocks.getCertificateSession).toHaveBeenCalledWith('session-1'))
    await waitFor(() => expect(onDocumentChanged).toHaveBeenCalledWith({ document_id: 'document-1', status: 'COMPLETED' }))
    expect(onFeedback).toHaveBeenCalledWith('Assinatura ICP-Brasil concluída e PDF certificado armazenado.')
  })

  it('cancela uma sessão ativa sem interromper outros processos', async () => {
    const user = userEvent.setup()
    const onFeedback = vi.fn()
    mocks.cancelCertificateSession.mockResolvedValue({
      data: { id: 'session-2', status: 'CANCELLED' },
    })

    render(
      <CertificateSignatureFlow
        documentId="document-1"
        initialSession={{ id: 'session-2', status: 'AWAITING_SIGNATURE' }}
        onFeedback={onFeedback}
        pollIntervalMs={10000}
      />,
    )

    await screen.findByText(/Agente disponível/)
    await user.click(screen.getByRole('button', { name: 'Cancelar sessão' }))

    expect(mocks.cancelCertificateSession).toHaveBeenCalledWith('session-2')
    expect(await screen.findByText('Sessão cancelada')).toBeInTheDocument()
    expect(onFeedback).toHaveBeenCalledWith('Sessão de certificado cancelada.')
  })

  it('orienta o download quando o agente não está disponível', async () => {
    mocks.health.mockRejectedValue(new Error('Agente não encontrado'))

    render(<CertificateSignatureFlow documentId="document-1" />)

    expect(await screen.findByText('Agente não detectado em 127.0.0.1:54174')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar agente de homologação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pareie o agente para continuar' })).toBeDisabled()
  })

  it('só baixa o agente depois de conferir o SHA-256', async () => {
    const user = userEvent.setup()
    const onFeedback = vi.fn()
    mocks.health.mockRejectedValue(new Error('Agente não encontrado'))
    mocks.getAgentManifest.mockResolvedValue({
      data: { sha256: '00'.repeat(32), authenticode: 'NotSigned' },
    })
    const agentBlob = new Blob(['agente-hml'])
    agentBlob.arrayBuffer = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer)
    mocks.downloadAgent.mockResolvedValue({
      data: agentBlob,
      headers: { 'x-artifact-sha256': '00'.repeat(32) },
    })
    vi.stubGlobal('crypto', {
      subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) },
    })

    render(<CertificateSignatureFlow documentId="document-1" onFeedback={onFeedback} />)

    await screen.findByText('Agente não detectado em 127.0.0.1:54174')
    await user.click(screen.getByRole('button', { name: 'Baixar agente de homologação' }))

    await waitFor(() => expect(mocks.downloadBlobResponse).toHaveBeenCalled())
    expect(mocks.getAgentManifest).toHaveBeenCalledWith()
    expect(mocks.downloadAgent).toHaveBeenCalledWith()
    expect(onFeedback).toHaveBeenCalledWith(
      'Agente baixado com SHA-256 verificado. Authenticode: NotSigned.',
    )
  })

  it('pareia explicitamente o agente sem persistir código ou token no navegador', async () => {
    const user = userEvent.setup()
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem')
    const pairing = {
      id: '951724b6-653d-4d16-a2b3-e731edcd150a',
      pairing_id: '951724b6-653d-4d16-a2b3-e731edcd150a',
      status: 'CREATED',
      pairing_code: '123456',
      backend_base_url: 'http://127.0.0.1:8010',
      expires_at: '2026-08-17T15:10:00Z',
    }
    mocks.listAgentDevices
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ device_id: deviceId, status: 'ACTIVE' }] })
    mocks.createAgentPairing.mockResolvedValue({ data: pairing })
    mocks.getAgentPairing.mockResolvedValue({ data: { ...pairing, status: 'COMPLETED', device_id: deviceId } })

    render(<CertificateSignatureFlow documentId="document-1" />)

    expect(await screen.findByText(/Antes da primeira assinatura/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Parear este agente' }))

    expect(mocks.createAgentPairing).toHaveBeenCalledWith()
    expect(mocks.pair).toHaveBeenCalledWith(pairing)
    expect(mocks.getAgentPairing).toHaveBeenCalledWith(pairing.id)
    expect(await screen.findByText('Agente pareado para este usuário')).toBeInTheDocument()
    expect(screen.queryByText('123456')).not.toBeInTheDocument()
    expect(storageSpy).not.toHaveBeenCalled()
    storageSpy.mockRestore()
  })

  it('exige confirmação antes de revogar o dispositivo pareado', async () => {
    const user = userEvent.setup()
    mocks.revokeAgentDevice.mockResolvedValue({ data: { status: 'REVOKED', device_id: deviceId } })

    render(<CertificateSignatureFlow documentId="document-1" />)

    await screen.findByText('Agente pareado para este usuário')
    await user.click(screen.getByRole('button', { name: 'Revogar pareamento' }))
    expect(screen.getByText(/deixará de iniciar assinaturas/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Confirmar revogação' }))

    expect(mocks.revokeAgentDevice).toHaveBeenCalledWith(deviceId)
    expect(await screen.findByText(/Antes da primeira assinatura/)).toBeInTheDocument()
  })
})
