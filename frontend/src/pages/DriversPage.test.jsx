import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { driversAPI } from '../api/drivers'
import DriversPage from './DriversPage'

vi.mock('../api/drivers', () => ({ driversAPI: { list: vi.fn(), create: vi.fn(), update: vi.fn() } }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ canCreate: () => true, canEdit: () => true, canDeleteModule: () => false }) }))
vi.mock('../hooks/useMasterDataCatalog', () => ({ useMasterDataCatalog: () => ({ organizations: [{ id: 'org', name: 'Secretaria teste' }] }) }))
vi.mock('../utils/exportData', () => ({ exportRowsToXlsx: vi.fn(), previewRowsToPdf: vi.fn() }))
vi.mock('../components/SearchableSelect', () => ({ default: ({ onChange }) => <button type="button" onClick={() => onChange('org')}>Selecionar secretaria</button> }))

const driver = { id: 'driver', nome_completo: 'Condutor Teste', documento: '12345678900', organization_id: 'org', cnh_categoria: 'B', matricula: '000123', ativo: true }

beforeEach(() => {
  vi.resetAllMocks()
  driversAPI.list.mockResolvedValue({ data: { data: [driver], pagination: { page: 1, pages: 1, total: 1 } } })
  driversAPI.create.mockResolvedValue({ data: driver })
  driversAPI.update.mockResolvedValue({ data: driver })
})

it('exige matrícula no novo cadastro e preserva zeros à esquerda', async () => {
  const user = userEvent.setup()
  render(<DriversPage />)
  await screen.findByText('Condutor Teste')
  await user.click(screen.getByRole('button', { name: 'Novo condutor' }))
  const registration = screen.getByLabelText('Matrícula (obrigatória)')
  expect(registration).toBeRequired()
  await user.click(screen.getByRole('button', { name: 'Cadastrar condutor' }))
  expect(driversAPI.create).not.toHaveBeenCalled()
  await user.type(registration, '   ')
  await user.click(screen.getByRole('button', { name: 'Cadastrar condutor' }))
  expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Informe a matrícula')
  await user.clear(registration)
  await user.type(registration, ' 000123 ')
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: driver.nome_completo } })
  fireEvent.change(screen.getByLabelText('Documento'), { target: { value: driver.documento } })
  await user.click(screen.getByRole('button', { name: 'Selecionar secretaria' }))
  await user.click(screen.getByRole('button', { name: 'Cadastrar condutor' }))
  await waitFor(() => expect(driversAPI.create).toHaveBeenCalledWith(expect.objectContaining({ matricula: '000123' })))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

it('mostra matrícula na listagem e carrega o valor ao editar', async () => {
  const user = userEvent.setup()
  render(<DriversPage />)
  expect(await screen.findByRole('cell', { name: '000123' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Editar' }))
  expect(screen.getByLabelText('Matrícula (obrigatória)')).toHaveValue('000123')
  await user.click(screen.getByRole('button', { name: 'Atualizar condutor' }))
  await waitFor(() => expect(driversAPI.update).toHaveBeenCalledWith('driver', expect.objectContaining({ matricula: '000123' })))
})
