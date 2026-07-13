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
}))

vi.mock('../api/documentSignatures', () => ({
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
    await user.click(screen.getByRole('button', { name: 'Assinar' }))

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
    expect(screen.queryByRole('button', { name: 'Assinar' })).not.toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Assinar' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({
      document_id: null,
      status: 'UNSIGNED',
      source_id: 'possession-1',
    })))
    expect(screen.getByText('Status: Não emitida')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Emitir' })).toBeInTheDocument()
  })
})
