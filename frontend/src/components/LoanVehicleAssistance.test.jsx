import '../test/mockJustificationSuggestions'
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import LoanProposalForm from './LoanProposalForm'
import VehicleLoanRegularization from './VehicleLoanRegularization'
import useLoanOdometerSuggestion from '../hooks/useLoanOdometerSuggestion'
import useLoanVehicleIdentity from '../hooks/useLoanVehicleIdentity'
import { possessionAPI } from '../api/possession'
import { vehiclesAPI } from '../api/vehicles'
import { vehicleLoansAPI } from '../api/vehicleLoans'

vi.mock('../api/possession', () => ({ possessionAPI: { getOdometerSuggestion: vi.fn() } }))
vi.mock('../api/vehicles', () => ({ vehiclesAPI: { listOptions: vi.fn() } }))
vi.mock('../api/vehicleLoans', () => ({ vehicleLoansAPI: { create: vi.fn(), update: vi.fn(), regularizationCatalog: vi.fn() } }))

const user = { id: 'operator', role: 'PRODUCAO', organization_id: 'origin' }
const catalog = {
  vehicles: [{ id: 'one', plate: 'ABC1234', owner_organization_id: 'origin' }, { id: 'two', plate: 'DEF5678', owner_organization_id: 'origin' }],
  organizations: [{ id: 'origin', name: 'Saúde' }, { id: 'recipient', name: 'Educação' }],
  allocations: [{ id: 'home', name: 'Garagem Saúde', organization_id: 'origin' }, { id: 'destination', name: 'Escola central', organization_id: 'recipient' }],
}
const reading = { odometer_km: 1234.5, end_date: '2026-10-28T09:00:00Z' }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done }); return { promise, resolve } }
async function pick(label, option) {
  await userEvent.click(screen.getByRole('button', { name: label }))
  await userEvent.click(screen.getByRole('button', { name: option }))
}
async function delivery() {
  await pick('Secretaria recebedora', 'Educação')
  await pick('Lotação de destino', 'Escola central')
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
}
beforeEach(() => {
  vi.resetAllMocks()
  possessionAPI.getOdometerSuggestion.mockResolvedValue({ data: reading })
  vehiclesAPI.listOptions.mockResolvedValue({ data: [] })
  vehicleLoansAPI.regularizationCatalog.mockResolvedValue({ data: catalog })
})

it('preenche a leitura existente, mostra sua origem e permite alterar sem perder ao voltar', async () => {
  render(<LoanProposalForm catalog={catalog} user={user} canView={() => true} />)
  await pick('Veículo', 'ABC1234'); await delivery()
  const field = screen.getByLabelText('Odômetro de entrega (km)')
  await waitFor(() => expect(field).toHaveValue(1234.5))
  expect(possessionAPI.getOdometerSuggestion).toHaveBeenCalledWith({ vehicle_id: 'one', start_date: expect.stringMatching(/Z$/) })
  expect(screen.getByRole('status')).toHaveTextContent('Último encerramento: 1234.5 km')
  fireEvent.change(field, { target: { value: '1300' } })
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(field).toHaveValue(1300)
  await userEvent.click(screen.getByRole('button', { name: 'Usar última leitura' }))
  expect(field).toHaveValue(1234.5)
  expect(vehicleLoansAPI.create).not.toHaveBeenCalled()
})

it.each(['0', ''])('uma resposta atrasada preserva a leitura digitada, inclusive %j', async (value) => {
  const pending = deferred()
  possessionAPI.getOdometerSuggestion.mockReturnValue(pending.promise)
  render(<LoanProposalForm catalog={catalog} user={user} canView={() => true} />)
  await pick('Veículo', 'ABC1234'); await delivery()
  const field = screen.getByLabelText('Odômetro de entrega (km)')
  fireEvent.change(field, { target: { value: '9' } })
  fireEvent.change(field, { target: { value } })
  await act(async () => pending.resolve({ data: reading }))
  expect(field).toHaveValue(value === '' ? null : 0)
  expect(screen.getByRole('button', { name: 'Usar última leitura' })).toBeVisible()
})

it('a troca rápida de veículo ignora a leitura anterior e aceita leitura zero do veículo atual', async () => {
  const first = deferred(); const second = deferred()
  possessionAPI.getOdometerSuggestion.mockImplementation(({ vehicle_id }) => vehicle_id === 'one' ? first.promise : second.promise)
  render(<LoanProposalForm catalog={catalog} user={user} canView={() => true} />)
  await pick('Veículo', 'ABC1234'); await pick('Veículo', 'DEF5678')
  await act(async () => first.resolve({ data: reading }))
  expect(screen.getByLabelText('Odômetro de entrega (km)')).toHaveValue(null)
  await act(async () => second.resolve({ data: { ...reading, odometer_km: 0 } }))
  expect(screen.getByLabelText('Odômetro de entrega (km)')).toHaveValue(0)
  expect(possessionAPI.getOdometerSuggestion).toHaveBeenCalledTimes(2)
})

it('não presume zero sem histórico e oferece nova consulta depois de falha', async () => {
  possessionAPI.getOdometerSuggestion.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: null })
  render(<LoanProposalForm catalog={catalog} user={user} canView={() => true} />)
  await pick('Veículo', 'ABC1234'); await delivery()
  await userEvent.click(await screen.findByRole('button', { name: 'consultar novamente' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Nenhum encerramento com odômetro foi encontrado'))
  expect(screen.getByLabelText('Odômetro de entrega (km)')).toHaveValue(null)
  expect(vehicleLoansAPI.create).not.toHaveBeenCalled()
})

it('mantém o odômetro do rascunho editado sem consultar nem substituir por uma sugestão', async () => {
  render(<LoanProposalForm catalog={catalog} user={user} canView={() => true}
    loan={{ vehicle_id: 'one', vehicle_plate: 'ABC1234', recipient_organization_id: 'recipient', destination_allocation_id: 'destination', delivery_odometer_km: 800 }} />)
  expect(screen.getByLabelText('Odômetro de entrega (km)')).toHaveValue(800)
  expect(possessionAPI.getOdometerSuggestion).not.toHaveBeenCalled()
})

it('consultas auxiliares respeitam permissões e descartam dados do usuário anterior', async () => {
  const old = deferred()
  possessionAPI.getOdometerSuggestion.mockReturnValueOnce(old.promise).mockResolvedValue({ data: { ...reading, odometer_km: 10 } })
  const { result, rerender } = renderHook(({ enabled, scope }) => useLoanOdometerSuggestion('one', enabled, scope), { initialProps: { enabled: false, scope: 'old' } })
  expect(possessionAPI.getOdometerSuggestion).not.toHaveBeenCalled()
  rerender({ enabled: true, scope: 'old' }); rerender({ enabled: true, scope: 'new' })
  await waitFor(() => expect(result.current.data?.odometer_km).toBe(10))
  await act(async () => old.resolve({ data: reading }))
  expect(result.current.data.odometer_km).toBe(10)
  rerender({ enabled: false, scope: 'new' })
  expect(result.current.data).toBeNull()
})

it('enriquece somente IDs permitidos pelo catálogo e não troca a origem por dados auxiliares', async () => {
  const old = deferred()
  vehiclesAPI.listOptions.mockReturnValueOnce(old.promise).mockResolvedValue({ data: [
    { id: 'one', brand: 'Fiat', model: 'Argo', owner_organization_id: 'other', current_department: 'Garagem', ownership_type: 'LOCADO', chassis_number: '123456789' },
    { id: 'forbidden', plate: 'NEW0000' },
  ] })
  const { result, rerender } = renderHook(({ enabled, scope }) => useLoanVehicleIdentity(catalog.vehicles, enabled, scope), { initialProps: { enabled: false, scope: 'old' } })
  expect(vehiclesAPI.listOptions).not.toHaveBeenCalled()
  rerender({ enabled: true, scope: 'old' }); rerender({ enabled: true, scope: 'new' })
  await waitFor(() => expect(result.current.vehicles[0].model).toBe('Argo'))
  expect(result.current.vehicles).toHaveLength(2)
  expect(result.current.vehicles[0]).toMatchObject({ owner_organization_id: 'origin', brand: 'Fiat', model: 'Argo', current_department: 'Garagem' })
  await act(async () => old.resolve({ data: [{ id: 'one', model: 'Desatualizado' }] }))
  expect(result.current.vehicles[0].model).toBe('Argo')
  rerender({ enabled: false, scope: 'new' })
  expect(result.current.vehicles[0].model).toBeUndefined()
})

it('regularização identifica e filtra veículos por modelo, lotação e chassi sem sugerir odômetro atual', async () => {
  vehiclesAPI.listOptions.mockResolvedValue({ data: [{ id: 'one', brand: 'Fiat', model: 'Argo', ownership_type: 'LOCADO', current_department: 'Garagem Saúde', chassis_number: '123456789' }] })
  render(<VehicleLoanRegularization canView={() => true} user={user} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Veículo' })).toBeEnabled())
  await waitFor(() => expect(screen.queryByText('Carregando dados de identificação…')).not.toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: 'Veículo' }))
  const option = screen.getByRole('button', { name: /ABC1234 · Fiat · Argo.*Locado.*Lotação atual: Garagem Saúde.*Chassi final 456789/ })
  await userEvent.type(screen.getByPlaceholderText('Buscar por placa, marca ou modelo'), '456789')
  expect(option).toBeVisible()
  expect(screen.queryByRole('button', { name: 'DEF5678' })).not.toBeInTheDocument()
  await userEvent.click(option)
  expect(possessionAPI.getOdometerSuggestion).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Odômetro de entrega (km)')).toHaveValue(null)
})

it('campos obrigatórios têm indicador e erros ficam associados ao campo sem marcar opcionais', async () => {
  render(<VehicleLoanRegularization />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Veículo' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  const vehicle = screen.getByRole('button', { name: 'Veículo' })
  expect(vehicle).toHaveAttribute('aria-invalid', 'true')
  expect(vehicle).toHaveAccessibleDescription('Selecione o veículo na lista de resultados.')
  expect(vehicle.closest('.loan-field').querySelector('.loan-editor__required')).toHaveTextContent('*')
  expect(vehicle.closest('.loan-field').querySelector('.loan-editor__field-error')).toBeVisible()
  const date = screen.getByLabelText('Entrega efetiva (data e hora local)')
  expect(date.closest('.loan-field').querySelector('.loan-editor__required')).toHaveTextContent('*')
  expect(screen.getByLabelText('Previsão de devolução (opcional)').closest('.loan-field').querySelector('.loan-editor__required')).toBeNull()
})
