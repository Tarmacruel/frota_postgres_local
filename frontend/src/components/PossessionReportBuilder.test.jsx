import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PossessionReportBuilder from './PossessionReportBuilder'

const mocks = vi.hoisted(() => ({
  getReportMetadata: vi.fn(),
  getReportPreference: vi.fn(),
  updateReportPreference: vi.fn(),
  previewReportPdf: vi.fn(),
  exportReportXlsx: vi.fn(),
}))

vi.mock('../api/possession', () => ({ possessionAPI: mocks }))
vi.mock('./DriverSelect', () => ({
  default: ({ ariaLabel }) => <button type="button" aria-label={ariaLabel}>Todos os condutores</button>,
}))

const columns = [
  { key: 'possession_number', title: 'Nº da posse', category: 'POSSESSION', classification: 'ADMINISTRATIVE', contains_personal_data: false },
  { key: 'vehicle_plate', title: 'Placa', category: 'POSSESSION', classification: 'ADMINISTRATIVE', contains_personal_data: false },
  { key: 'driver_document', title: 'Documento do condutor', category: 'POSSESSION', classification: 'PERSONAL_HIGH_CRITICALITY', contains_personal_data: true },
]

const metadata = {
  default_mode: 'POSSESSION',
  default_preset: 'SUMMARY',
  can_export_xlsx: true,
  limits: { pdf_rows: 1500, xlsx_rows: 5000 },
  modes: [
    {
      key: 'POSSESSION',
      title: 'Por posse',
      columns,
      presets: [
        { key: 'SUMMARY', title: 'Resumido', column_keys: ['possession_number', 'vehicle_plate'] },
        { key: 'CUSTOM', title: 'Personalizado', column_keys: [] },
      ],
    },
    {
      key: 'TRIP',
      title: 'Por rota',
      columns: columns.slice(0, 2),
      presets: [
        { key: 'SUMMARY', title: 'Resumido', column_keys: ['possession_number', 'vehicle_plate'] },
        { key: 'CUSTOM', title: 'Personalizado', column_keys: [] },
      ],
    },
  ],
}

describe('PossessionReportBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getReportMetadata.mockResolvedValue({ data: metadata })
    mocks.getReportPreference.mockResolvedValue({
      data: { mode: 'POSSESSION', preset: 'SUMMARY', column_keys: ['possession_number', 'vehicle_plate'], sanitized: false },
    })
    mocks.updateReportPreference.mockImplementation(async (payload) => ({ data: { ...payload, sanitized: false } }))
  })

  it('carrega somente as colunas autorizadas pelo backend e abre Mais opções', async () => {
    const user = userEvent.setup()
    render(<PossessionReportBuilder />)

    const moreOptions = await screen.findByRole('button', { name: 'Mais opções' })
    expect(moreOptions).toBeEnabled()
    await user.click(moreOptions)

    expect(screen.getByRole('dialog', { name: 'Configurar relatório' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Nº da posse/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Documento do condutor/ })).not.toBeChecked()
    expect(screen.getByText(/preset padrão não contém documento/i)).toBeInTheDocument()
  })

  it('reordena por botão e salva somente modo, preset e chaves', async () => {
    const user = userEvent.setup()
    render(<PossessionReportBuilder initialFilters={{ search: 'não deve ser persistido' }} />)
    await user.click(await screen.findByRole('button', { name: 'Mais opções' }))
    await user.click(screen.getByRole('button', { name: 'Mover Nº da posse para baixo' }))
    await user.click(screen.getByRole('button', { name: 'Salvar preferência' }))

    await waitFor(() => expect(mocks.updateReportPreference).toHaveBeenCalledWith({
      mode: 'POSSESSION',
      preset: 'CUSTOM',
      column_keys: ['vehicle_plate', 'possession_number'],
    }))
    expect(JSON.stringify(mocks.updateReportPreference.mock.calls[0][0])).not.toContain('não deve ser persistido')
  })

  it('permite reordenação por Alt e setas com anúncio textual', async () => {
    const user = userEvent.setup()
    render(<PossessionReportBuilder />)
    await user.click(await screen.findByRole('button', { name: 'Mais opções' }))
    const firstColumn = screen.getByRole('checkbox', { name: /Nº da posse/ })
    fireEvent.keyDown(firstColumn, { key: 'ArrowDown', altKey: true })
    expect(screen.getByText(/Nº da posse movida para baixo/i)).toBeInTheDocument()
  })
})
