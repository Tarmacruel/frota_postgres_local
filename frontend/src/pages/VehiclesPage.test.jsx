import '../test/mockJustificationSuggestions'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import VehiclesPage from './VehiclesPage'
import api from '../api/client'

vi.mock('../api/client', () => ({ default: { get: vi.fn(), put: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'vehicle-operator' }, canCreate: () => true, canEdit: () => true, canDeleteModule: () => false, isAdmin: true }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [], allocations: [], loading: false, getDepartmentsByOrganization: () => [], getAllocationsByDepartment: () => [] }) }))
vi.mock('../utils/exportData', () => ({ exportRowsToXlsx: vi.fn(), previewRowsToPdf: vi.fn() }))

const vehicle = { id: 'vehicle-1', plate: 'ABC1D23', brand: 'Marca', model: 'Modelo', vehicle_type: 'SEDAN', ownership_type: 'PROPRIO', status: 'DISPONIVEL', current_location: null }
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: [vehicle] }); api.put.mockResolvedValue({ data: vehicle }) })

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
  api.get.mockResolvedValue({ data: [{ ...vehicle, prime_card_number: '0000123456789012' }] })
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
