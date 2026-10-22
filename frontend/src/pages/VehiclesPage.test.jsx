import '../test/mockJustificationSuggestions'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import VehiclesPage from './VehiclesPage'
import api from '../api/client'
import { exportRowsToXlsx } from '../utils/exportData'

vi.mock('../api/client', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'vehicle-operator' }, canCreate: () => true, canEdit: () => true, canDeleteModule: () => false, isAdmin: true }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [], allocations: [], loading: false, getDepartmentsByOrganization: () => [], getAllocationsByDepartment: () => [] }) }))
vi.mock('../utils/exportData', () => ({ exportRowsToXlsx: vi.fn(), previewRowsToPdf: vi.fn() }))

const vehicle = { id: 'vehicle-1', plate: 'ABC1D23', brand: 'Marca', model: 'Modelo', vehicle_type: 'SEDAN', ownership_type: 'PROPRIO', status: 'DISPONIVEL', current_location: null }
beforeEach(() => {
  vi.resetAllMocks()
  api.get.mockImplementation((url) => Promise.resolve(url === '/vehicles/locations' ? { data: [] } : { data: { data: [vehicle], pagination: { page: 1, pages: 1, total: 1 }, summary: { total: 1, own: 1, rented: 0, assigned: 0, active: 0, maintenance: 0, inactive: 0, without_driver: 1, latest_update: null } } }))
  api.put.mockResolvedValue({ data: vehicle })
})

async function openCorrection() {
  render(<MemoryRouter><VehiclesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Mais ações do veículo ABC1D23' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Editar cadastro' }))
  expect(screen.getByRole('button', { name: 'Atualizar veículo' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: 'Modelo corrigido' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ver modelos', exact: true })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ver modelos', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Identificação do veículo', exact: true }))
}

it('permite selecionar justificativa de edição e envia o texto ao salvar', async () => {
  await openCorrection()
  const reason = screen.getByLabelText('Justificativa da edição').value
  expect(reason).toContain('Correção de dados de identificação')
  expect(api.put).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar veículo' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/vehicles/vehicle-1', expect.objectContaining({ model: 'Modelo corrigido', edit_reason: reason })))
})

it('mantém o texto para revisão quando o salvamento é rejeitado', async () => {
  api.put.mockRejectedValueOnce({ response: { data: { detail: 'Edição rejeitada' } } })
  await openCorrection()
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar veículo' }))
  await screen.findByText('Edição rejeitada')
  expect(screen.getByLabelText('Justificativa da edição').value).toContain('Correção de dados de identificação')
})

it('aplica máscara, limita a 16 dígitos e salva somente os números', async () => {
  await openCorrection()
  const input = screen.getByLabelText('Número do cartão Prime')
  fireEvent.change(input, { target: { value: '000012345678901299' } })
  expect(input).toHaveValue('0000 1234 5678 9012')
  expect(input).toHaveAttribute('maxlength', '19')
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar veículo' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/vehicles/vehicle-1', expect.objectContaining({ prime_card_number: '0000123456789012' })))
})

it('carrega o cartão com máscara e permite limpar o número', async () => {
  api.get.mockImplementation((url) => Promise.resolve(url === '/vehicles/locations' ? { data: [] } : { data: { data: [{ ...vehicle, prime_card_number: '0000123456789012' }], pagination: { page: 1, pages: 1, total: 1 }, summary: { total: 1, own: 1, rented: 0, assigned: 0, active: 0, maintenance: 0, inactive: 0, without_driver: 1, latest_update: null } } }))
  await openCorrection()
  const input = screen.getByLabelText('Número do cartão Prime')
  expect(input).toHaveValue('0000 1234 5678 9012')
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar veículo' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/vehicles/vehicle-1', expect.objectContaining({ prime_card_number: null })))
})

it('impede salvar cartão incompleto', async () => {
  await openCorrection()
  fireEvent.change(screen.getByLabelText('Número do cartão Prime'), { target: { value: '1234' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Atualizar veículo' }).closest('form'))
  expect(await screen.findByText('Número do cartão Prime deve conter exatamente 16 dígitos.')).toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()
})

it('solicita somente a página visível e busca todo o filtro ao exportar', async () => {
  const nextVehicle = { ...vehicle, id: 'vehicle-2', plate: 'XYZ9Z99' }
  api.get.mockImplementation((url, { params } = {}) => {
    if (url !== '/vehicles/paginated') return Promise.resolve({ data: [] })
    const rows = params.limit === 100 ? [vehicle, nextVehicle] : params.page === 2 ? [nextVehicle] : [vehicle]
    return Promise.resolve({ data: { data: rows, pagination: { page: params.page, pages: params.limit === 100 ? 1 : 2, total: 11 }, summary: { total: 11, own: 11, rented: 0, assigned: 0, active: 11, maintenance: 0, inactive: 0, without_driver: 11, latest_update: null } } })
  })
  render(<MemoryRouter><VehiclesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Página 2' }))
  expect(await screen.findByText('XYZ9Z99')).toBeInTheDocument()
  expect(api.get).toHaveBeenCalledWith('/vehicles/paginated', expect.objectContaining({ params: expect.objectContaining({ page: 2, limit: 10 }) }))
  fireEvent.click(screen.getByRole('button', { name: 'Exportar XLSX' }))
  await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ rows: [vehicle, nextVehicle] })))
  expect(api.get).toHaveBeenCalledWith('/vehicles/paginated', expect.objectContaining({ params: expect.objectContaining({ page: 1, limit: 100 }) }))
})

it('abre um veículo da busca global mesmo fora da primeira página', async () => {
  const focusedVehicle = { ...vehicle, id: 'vehicle-2', plate: 'XYZ9Z99' }
  api.get.mockImplementation((url) => Promise.resolve(url === '/vehicles/locations' || url.endsWith('/historico') ? { data: [] } : {
    data: { data: [focusedVehicle], pagination: { page: 1, pages: 1, total: 1 }, summary: { total: 1, own: 1, rented: 0, assigned: 0, active: 0, maintenance: 0, inactive: 0, without_driver: 1, latest_update: null } },
  }))
  render(<MemoryRouter initialEntries={['/vehicles?focus=vehicle-2']}><VehiclesPage /></MemoryRouter>)
  expect(await screen.findByText('Mostrando apenas XYZ9Z99')).toBeInTheDocument()
  expect(api.get).toHaveBeenCalledWith('/vehicles/paginated', expect.objectContaining({ params: expect.objectContaining({ focus_id: 'vehicle-2' }) }))
})

it('filtra etiquetas de autores diferentes por ids e mantém o filtro na exportação', async () => {
  const labels = [
    { id: 'tag-a', name: 'Em lavagem', color: 'blue', owner_name: 'Ana' },
    { id: 'tag-b', name: 'Em lavagem', color: 'blue', owner_name: 'Carlos' },
  ]
  api.get.mockImplementation((url) => Promise.resolve(url === '/vehicles/locations' ? { data: [] } : url === '/vehicles/tag-options' ? { data: labels } : { data: { data: [vehicle], pagination: { page: 1, pages: 1, total: 1 }, summary: { total: 1 } } }))
  render(<MemoryRouter><VehiclesPage /></MemoryRouter>)
  await screen.findByText('ABC1D23')
  fireEvent.click(screen.getByRole('button', { name: 'Etiquetas', exact: true }))
  fireEvent.click(await screen.findByRole('checkbox', { name: /Ana/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Carlos/ }))
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/vehicles/paginated', expect.objectContaining({ params: expect.objectContaining({ tag_ids: ['tag-a', 'tag-b'] }), paramsSerializer: { indexes: null } })))
  fireEvent.click(screen.getByRole('button', { name: 'Concluir filtro' }))
  fireEvent.click(screen.getByRole('button', { name: 'Exportar XLSX' }))
  await waitFor(() => expect(exportRowsToXlsx).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.arrayContaining([{ label: 'Etiquetas atuais', value: 'Em lavagem (Ana) ou Em lavagem (Carlos)' }]) })))
  expect(api.get).toHaveBeenCalledWith('/vehicles/paginated', expect.objectContaining({ params: expect.objectContaining({ limit: 100, tag_ids: ['tag-a', 'tag-b'] }) }))
})

it('mostra eventos de etiqueta como comunicação visual no histórico', async () => {
  api.get.mockImplementation((url) => Promise.resolve(url === '/vehicles/locations' ? { data: [] } : url.endsWith('/historico') ? { data: [{ id: 'mark-event', event_type: 'TAG', action: 'TAG_APPLY', occurred_at: '2026-10-21T12:00:00Z', title: 'Etiqueta aplicada: Em lavagem', actor_name: 'Ana', justification: 'Conferência da limpeza' }] } : { data: { data: [vehicle], pagination: { page: 1, pages: 1, total: 1 }, summary: { total: 1 } } }))
  render(<MemoryRouter><VehiclesPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Histórico', exact: true }))
  expect(await screen.findByText('Marcação de comunicação visual adicionada ao veículo.')).toBeInTheDocument()
  expect(screen.getByText('Observação', { exact: true })).toBeInTheDocument()
  expect(screen.queryByText('Edição registrada sem diferenças adicionais nos campos auditados.')).not.toBeInTheDocument()
})
