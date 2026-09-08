import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DocumentSignaturePanel from './DocumentSignaturePanel'

const mocks = vi.hoisted(() => ({
  createDocument: vi.fn(),
  getDocument: vi.fn(),
  sign: vi.fn(),
  requestJointSignature: vi.fn(),
  declineRequest: vi.fn(),
  cancelRequest: vi.fn(),
  signers: vi.fn(),
  downloadArtifact: vi.fn(),
  getValidation: vi.fn(),
}))

vi.mock('../api/documentSignatures', async (importOriginal) => ({
  ...(await importOriginal()),
  documentSignaturesAPI: mocks,
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Servidor responsável' },
    isAdmin: false,
  }),
}))

vi.mock('./SearchableSelect', () => ({
  default: ({ placeholder }) => <button type="button">{placeholder}</button>,
}))

vi.mock('./CertificateSignatureFlow', () => ({
  default: ({ documentId }) => <div data-testid="certificate-flow">Sessão ICP-Brasil para {documentId}</div>,
}))

const unsigned = {
  document_id: null,
  status: 'UNSIGNED',
  required_signatures: 1,
  signed_count: 0,
  signatures: [],
  requests: [],
}

const pending = {
  ...unsigned,
  document_id: 'document-1',
  status: 'PENDING',
  content_hash_short: 'abc123def456',
}

describe('DocumentSignaturePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.signers.mockResolvedValue({ data: [] })
  })

  it('emite o documento próprio do termo único com linguagem de assinatura eletrônica', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    mocks.createDocument.mockResolvedValue({ data: pending })

    render(
      <DocumentSignaturePanel
        documentType="POSSESSION_RESPONSIBILITY_TERM"
        sourceId="possession-1"
        summary={unsigned}
        title="Assinatura eletrônica do responsável pela entrega"
        onChanged={onChanged}
      />,
    )

    expect(screen.getByText('Assinatura eletrônica do responsável pela entrega')).toBeInTheDocument()
    expect(screen.queryByText(/assinatura digital/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Emitir' }))

    await waitFor(() => expect(mocks.createDocument).toHaveBeenCalledWith({
      document_type: 'POSSESSION_RESPONSIBILITY_TERM',
      source_id: 'possession-1',
    }))
    expect(onChanged).toHaveBeenCalledWith(pending)
    expect(screen.getByText('Documento emitido para assinatura eletrônica.')).toBeInTheDocument()
  })

  it('confirma a assinatura com senha e impede nova assinatura do mesmo usuário', async () => {
    const user = userEvent.setup()
    const completed = {
      ...pending,
      status: 'COMPLETED',
      is_complete: true,
      signed_count: 1,
      signatures: [{
        id: 'signature-1',
        signer_user_id: 'user-1',
        signer_name: 'Servidor responsável',
        signature_fingerprint: 'abcdef1234567890',
        signed_at: '2026-07-13T18:00:00Z',
      }],
    }
    mocks.sign.mockResolvedValue({ data: completed })

    render(
      <DocumentSignaturePanel
        documentType="POSSESSION_RESPONSIBILITY_TERM"
        sourceId="possession-1"
        summary={pending}
      />,
    )

    await user.type(screen.getByLabelText('Registrar assinatura eletrônica'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Assinar com senha' }))

    await waitFor(() => expect(mocks.sign).toHaveBeenCalledWith('document-1', {
      current_password: 'senha-segura',
    }))
    expect(screen.getByText('Servidor responsável').parentElement).toHaveTextContent('assinou em')
    expect(screen.queryByLabelText('Registrar assinatura eletrônica')).not.toBeInTheDocument()
  })

  it('mostra apenas situação e contagem para consulta restrita', () => {
    render(
      <DocumentSignaturePanel
        documentType="POSSESSION_RESPONSIBILITY_TERM"
        sourceId="possession-1"
        summary={{
          ...pending,
          document_id: null,
          status: 'COMPLETED',
          is_complete: true,
          signed_count: 1,
          signatures: [],
        }}
        readOnly
      />,
    )

    expect(screen.getByText('Status: Concluída')).toBeInTheDocument()
    expect(screen.getByText('1/1')).toBeInTheDocument()
    expect(screen.getByText('Assinatura registrada; identificação protegida nesta consulta.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhuma assinatura registrada.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Emitir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Assinar com senha' })).not.toBeInTheDocument()
  })

  it('limpa o documento local quando o conteúdo assinado ficou obsoleto', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    mocks.sign.mockRejectedValue({
      response: {
        status: 409,
        data: {
          detail: {
            code: 'DIGITAL_DOCUMENT_SOURCE_CHANGED',
            message: 'O conteúdo do documento foi atualizado e precisa ser emitido novamente.',
          },
        },
      },
    })

    render(
      <DocumentSignaturePanel
        documentType="POSSESSION_RESPONSIBILITY_TERM"
        sourceId="possession-1"
        summary={pending}
        onChanged={onChanged}
      />,
    )

    await user.type(screen.getByLabelText('Registrar assinatura eletrônica'), 'senha-segura')
    await user.click(screen.getByRole('button', { name: 'Assinar com senha' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({
      document_id: null,
      status: 'UNSIGNED',
      source_id: 'possession-1',
    })))
    expect(screen.getByText('Status: Não emitida')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir' })).toBeInTheDocument()
  })

  it('permite escolher certificado ICP-Brasil sem remover o fluxo legado por senha', async () => {
    const user = userEvent.setup()

    render(
      <DocumentSignaturePanel
        documentType="POSSESSION_RESPONSIBILITY_TERM"
        sourceId="possession-1"
        summary={{ ...pending, certificate_signing_enabled: true }}
      />,
    )

    expect(screen.getByRole('button', { name: /Assinar com senha Evidência eletrônica interna/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Registrar assinatura eletrônica')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Assinar com certificado ICP-Brasil/ }))

    expect(screen.getByTestId('certificate-flow')).toHaveTextContent('document-1')
    expect(screen.queryByLabelText('Registrar assinatura eletrônica')).not.toBeInTheDocument()
  })

  it('identifica assinaturas mistas e oferece o PDF certificado', () => {
    render(
      <DocumentSignaturePanel
        documentType="POSSESSION_RESPONSIBILITY_TERM"
        sourceId="possession-1"
        summary={{
          ...pending,
          signed_count: 2,
          required_signatures: 2,
          canonical_artifact_available: true,
          certified_artifact_available: true,
          signature_counts_by_method: { INTERNAL_PASSWORD: 1, ICP_BRASIL_PADES: 1 },
          signatures: [
            {
              id: 'password-signature',
              signer_user_id: 'user-2',
              signer_name: 'Coassinante interno',
              method: 'INTERNAL_PASSWORD',
              signed_at: '2026-07-13T18:00:00Z',
            },
            {
              id: 'certificate-signature',
              signer_user_id: 'user-3',
              signer_name: 'Coassinante ICP',
              method: 'ICP_BRASIL_PADES',
              certificate_issuer_summary: 'AC Teste ICP-Brasil',
              timestamped_at: '2026-07-13T18:10:30Z',
              validation_status: 'VALID',
              signed_at: '2026-07-13T18:10:00Z',
            },
          ],
        }}
      />,
    )

    expect(screen.getByLabelText('Assinaturas por método')).toHaveTextContent('Senha: 1')
    expect(screen.getByLabelText('Assinaturas por método')).toHaveTextContent('ICP-Brasil: 1')
    expect(screen.getByText('Certificado ICP-Brasil (PAdES)')).toBeInTheDocument()
    expect(screen.getByText('Emissor: AC Teste ICP-Brasil')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar PDF certificado' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Consultar validação' })).toBeInTheDocument()
  })

  it('apresenta o resultado autenticado da validação do PDF certificado', async () => {
    const user = userEvent.setup()
    mocks.getValidation.mockResolvedValue({
      data: {
        document_id: 'document-1',
        validations: [{ id: 'validation-1', status: 'VALID', validated_at: '2026-08-17T12:00:00Z' }],
      },
    })

    render(
      <DocumentSignaturePanel
        documentType="POSSESSION_RESPONSIBILITY_TERM"
        sourceId="possession-1"
        summary={{
          ...pending,
          certified_artifact_available: true,
          signature_counts_by_method: { ICP_BRASIL_PADES: 1 },
        }}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Consultar validação' }))

    expect(mocks.getValidation).toHaveBeenCalledWith('document-1')
    expect(await screen.findByText('Validação: Válida')).toBeInTheDocument()
    expect(screen.getByText('1 assinatura(s) verificada(s)')).toBeInTheDocument()
  })
})
