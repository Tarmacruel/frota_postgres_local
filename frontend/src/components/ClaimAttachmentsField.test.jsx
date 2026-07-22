import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ClaimAttachmentsField, {
  MAX_DOCUMENT_SIZE,
  MAX_IMAGE_SIZE,
} from './ClaimAttachmentsField'

const mocks = vi.hoisted(() => ({
  getAttachment: vi.fn(),
}))

vi.mock('../api/claims', () => ({
  claimsAPI: {
    getAttachment: mocks.getAttachment,
  },
}))

function ControlledClaimAttachmentsField({
  initialPendingAttachments = [],
  initialRemovedAttachmentIds = [],
  ...props
}) {
  const [pendingAttachments, setPendingAttachments] = useState(initialPendingAttachments)
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState(initialRemovedAttachmentIds)

  return (
    <ClaimAttachmentsField
      claimId="claim-1"
      existingAttachments={[]}
      legacyReferences={[]}
      pendingAttachments={pendingAttachments}
      onPendingAttachmentsChange={setPendingAttachments}
      removedAttachmentIds={removedAttachmentIds}
      onRemovedAttachmentIdsChange={setRemovedAttachmentIds}
      {...props}
    />
  )
}

function sizedFile(name, type, size) {
  const file = new File(['arquivo de teste'], name, { type, lastModified: 1 })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function renderField(props = {}) {
  const result = render(<ControlledClaimAttachmentsField {...props} />)
  return {
    ...result,
    fileInput: result.container.querySelector('input[type="file"]'),
  }
}

describe('ClaimAttachmentsField', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adiciona várias fotos e documentos válidos à lista de pendentes', async () => {
    const user = userEvent.setup()
    const { fileInput } = renderField()
    const photo = sizedFile('avaria-frontal.jpg', 'image/jpeg', 2 * 1024 * 1024)
    const report = sizedFile('boletim.pdf', 'application/pdf', 640 * 1024)

    await user.upload(fileInput, [photo, report])

    expect(screen.getByText('avaria-frontal.jpg')).toBeInTheDocument()
    expect(screen.getByText('boletim.pdf')).toBeInTheDocument()
    expect(screen.getByText('Novos anexos')).toBeInTheDocument()
    expect(screen.getByText('2/20')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejeita MIME não permitido e arquivos acima dos limites de foto e documento', async () => {
    const user = userEvent.setup({ applyAccept: false })
    const { fileInput } = renderField()

    await user.upload(fileInput, sizedFile('executavel.exe', 'application/x-msdownload', 1024))
    expect(screen.getByRole('alert')).toHaveTextContent('executavel.exe: formato não permitido.')

    await user.upload(fileInput, sizedFile('foto-grande.png', 'image/png', MAX_IMAGE_SIZE + 1))
    expect(screen.getByRole('alert')).toHaveTextContent('foto-grande.png: excede o limite de 8 MB.')

    await user.upload(fileInput, sizedFile('laudo-grande.pdf', 'application/pdf', MAX_DOCUMENT_SIZE + 1))
    expect(screen.getByRole('alert')).toHaveTextContent('laudo-grande.pdf: excede o limite de 12 MB.')
    expect(screen.getByText('0/20')).toBeInTheDocument()
    expect(screen.queryByText('Novos anexos')).not.toBeInTheDocument()
  })

  it('aceita formato seguro pela extensão quando o navegador não informa o MIME', async () => {
    const user = userEvent.setup()
    const { fileInput } = renderField()

    await user.upload(fileInput, sizedFile('boletim.pdf', '', 1024))

    expect(screen.getByText('boletim.pdf')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('remove um anexo pendente antes de salvar', async () => {
    const user = userEvent.setup()
    const { fileInput } = renderField()

    await user.upload(fileInput, sizedFile('orcamento.pdf', 'application/pdf', 256 * 1024))
    expect(screen.getByText('orcamento.pdf')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remover' }))

    expect(screen.queryByText('orcamento.pdf')).not.toBeInTheDocument()
    expect(screen.queryByText('Novos anexos')).not.toBeInTheDocument()
    expect(screen.getByText('0/20')).toBeInTheDocument()
  })

  it('marca um anexo salvo para remoção e permite desfazer', async () => {
    const user = userEvent.setup()
    renderField({
      existingAttachments: [{
        id: 'attachment-1',
        filename: 'laudo-tecnico.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
        kind: 'DOCUMENT',
      }],
    })

    expect(screen.getByText('1/20')).toBeInTheDocument()
    expect(screen.getByText(/salvo no registro/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remover' }))

    expect(screen.getByText('0/20')).toBeInTheDocument()
    expect(screen.getByText(/será removido ao salvar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Baixar' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Desfazer' }))

    expect(screen.getByText('1/20')).toBeInTheDocument()
    expect(screen.getByText(/salvo no registro/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeInTheDocument()
    expect(mocks.getAttachment).not.toHaveBeenCalled()
  })

  it('mantém visíveis as referências legadas do sinistro', async () => {
    const user = userEvent.setup()
    renderField({
      legacyReferences: [
        'https://arquivos.exemplo.gov.br/boletim-123.pdf',
        'Protocolo físico 2026/0042',
      ],
    })

    const summary = screen.getByText('Referências antigas (2)')
    await user.click(summary)

    expect(summary.closest('details')).toHaveAttribute('open')
    expect(screen.getByText('https://arquivos.exemplo.gov.br/boletim-123.pdf')).toBeInTheDocument()
    expect(screen.getByText('Protocolo físico 2026/0042')).toBeInTheDocument()
  })

  it('permite editar referências antigas quando o usuário pode gerenciar o sinistro', async () => {
    const user = userEvent.setup()
    const onLegacyReferenceValueChange = vi.fn()
    renderField({
      legacyReferences: ['Protocolo físico 2026/0042'],
      legacyReferenceValue: 'Protocolo físico 2026/0042',
      onLegacyReferenceValueChange,
    })

    await user.click(screen.getByText('Referências antigas (1)'))
    await user.type(screen.getByLabelText('Informe uma URL ou referência por linha.'), ' atualizado')

    expect(onLegacyReferenceValueChange).toHaveBeenCalled()
  })

  it('mantém abertura e download disponíveis no modo somente leitura', () => {
    renderField({
      canManage: false,
      existingAttachments: [{
        id: 'attachment-1',
        filename: 'laudo.pdf',
        mime_type: 'application/pdf',
        size_bytes: 1024,
        kind: 'DOCUMENT',
      }],
    })

    expect(screen.getByRole('button', { name: 'Abrir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Selecionar arquivos' })).not.toBeInTheDocument()
  })
})
