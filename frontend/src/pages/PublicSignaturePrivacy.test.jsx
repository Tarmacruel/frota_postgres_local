import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PublicFuelSupplyOrderPage from './PublicFuelSupplyOrderPage'
import PublicPossessionTermPage from './PublicPossessionTermPage'

const mocks = vi.hoisted(() => ({
  getPublicOrder: vi.fn(),
  getPublicTerm: vi.fn(),
  downloadOrder: vi.fn(),
  previewOrder: vi.fn(),
  downloadTerm: vi.fn(),
  previewTerm: vi.fn(),
}))

vi.mock('../api/fuelSupplyOrders', () => ({
  fuelSupplyOrdersAPI: { getPublic: mocks.getPublicOrder },
}))

vi.mock('../api/possession', () => ({
  possessionAPI: { getPublicTerm: mocks.getPublicTerm },
}))

vi.mock('../utils/fuelSupplyOrderDocument', () => ({
  downloadFuelSupplyOrderDocument: mocks.downloadOrder,
  previewFuelSupplyOrderDocument: mocks.previewOrder,
}))

vi.mock('../utils/possessionTermDocument', () => ({
  downloadPossessionTermDocument: mocks.downloadTerm,
  previewPossessionTermDocument: mocks.previewTerm,
  getPossessionTermLabel: () => 'Termo de empréstimo',
  resolvePossessionTermValidationUrl: (path) => `http://localhost${path || ''}`,
}))

function signatureSummary() {
  return {
    document_id: 'document-private',
    content_hash: 'HASH-PRIVADO-NAO-EXIBIR',
    is_complete: true,
    signatures: [{ id: 'signature-1', signer_name: 'SIGNATÁRIO PRIVADO', signed_at: '2026-08-17T10:00:00Z' }],
  }
}

describe('privacidade de assinaturas nas páginas públicas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('não mostra nem inclui evidência no PDF público do termo', async () => {
    const user = userEvent.setup()
    mocks.getPublicTerm.mockResolvedValue({
      data: {
        validation_code: 'TERM-1',
        public_validation_path: '/validar/termo/TERM-1',
        vehicle_plate: 'ABC1D23',
        signature_summary: signatureSummary(),
      },
    })

    render(
      <MemoryRouter initialEntries={['/validar/termo/TERM-1']}>
        <Routes>
          <Route path="/validar/termo/:validationCode" element={<PublicPossessionTermPage termType="loan" />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('TERM-1')
    expect(screen.queryByText('SIGNATÁRIO PRIVADO')).not.toBeInTheDocument()
    expect(screen.queryByText('HASH-PRIVADO-NAO-EXIBIR')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Baixar termo em PDF' }))

    await waitFor(() => expect(mocks.downloadTerm).toHaveBeenCalled())
    expect(mocks.downloadTerm.mock.calls[0][0]).not.toHaveProperty('signature_summary')
  })

  it('não mostra nem inclui evidência no PDF público da ordem', async () => {
    const user = userEvent.setup()
    mocks.getPublicOrder.mockResolvedValue({
      data: {
        id: 'order-1',
        validation_code: 'ORDER-1',
        public_validation_path: '/validar/ordem/ORDER-1',
        vehicle_plate: 'ABC1D23',
        status: 'OPEN',
        signature_summary: signatureSummary(),
      },
    })

    render(
      <MemoryRouter initialEntries={['/validar/ordem/ORDER-1']}>
        <Routes>
          <Route path="/validar/ordem/:validationCode" element={<PublicFuelSupplyOrderPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText('ORDER-1')
    expect(screen.queryByText('SIGNATÁRIO PRIVADO')).not.toBeInTheDocument()
    expect(screen.queryByText('HASH-PRIVADO-NAO-EXIBIR')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Baixar comprovante em PDF' }))

    await waitFor(() => expect(mocks.downloadOrder).toHaveBeenCalled())
    expect(mocks.downloadOrder.mock.calls[0][0]).not.toHaveProperty('signature_summary')
  })
})
