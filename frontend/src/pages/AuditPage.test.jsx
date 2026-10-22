import { MemoryRouter } from 'react-router-dom'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import AuditPage from './AuditPage'
import { exportRowsToXlsx } from '../utils/exportData'

const api = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../api/client', () => ({ default: api }))
vi.mock('../hooks/useMasterDataCatalog', () => ({
  useMasterDataCatalog: () => ({ organizations: [] }),
}))
vi.mock('../utils/exportData', () => ({ exportRowsToXlsx: vi.fn(), previewRowsToPdf: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

it('exporta todas as páginas da auditoria com o filtro aplicado', async () => {
  const logs = [
    { id: 'a', action: 'DELETE', entity_type: 'VEHICLE', entity_label: 'A', actor_name: 'Pessoa A' },
    { id: 'b', action: 'DELETE', entity_type: 'VEHICLE', entity_label: 'B', actor_name: 'Pessoa B' },
  ]
  api.get.mockImplementation((_path, { params }) => Promise.resolve({ data: {
    data: params.limit === 200 ? [logs[params.page - 1]] : [logs[0]],
    pagination: { page: params.page, pages: params.limit === 200 ? 2 : 1, total: 2 },
    deleted: 2,
  } }))
  render(<MemoryRouter><AuditPage /></MemoryRouter>)
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'DELETE' } })
  await screen.findByText('Pessoa A')
  fireEvent.click(screen.getByRole('button', { name: 'Exportar XLSX' }))
  await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ rows: logs })))
  expect(api.get).toHaveBeenCalledWith('/audit/paginated', { params: expect.objectContaining({ page: 2, limit: 200, action: 'DELETE' }) })
})

it('mostra a falha de requisição na listagem', async () => {
  api.get.mockRejectedValue(new Error('Falha simulada de rede'))
  render(<MemoryRouter><AuditPage /></MemoryRouter>)
  expect(await screen.findByText('Falha simulada de rede')).toBeInTheDocument()
  expect(screen.getByText('Nenhum evento de auditoria encontrado para os filtros atuais.')).toBeInTheDocument()
})
