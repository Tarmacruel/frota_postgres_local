import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import SystemSettingsPage from './SystemSettingsPage'
import { officialBrand } from '../constants/officialBrand'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
const publish = vi.hoisted(() => vi.fn())
vi.mock('../api/client', () => ({ default: api }))
vi.mock('../hooks/useSystemSettings', () => ({ useSystemSettings: () => ({ publish, values: { forms: {} } }) }))
const identity = Object.fromEntries(Object.entries(officialBrand).filter(([key]) => !['colors', 'reportFooter'].includes(key)))
const values = { identity, appearance: { primary: '#2452e8', sidebar: '#071426', density: 'comfortable' }, icons: {}, forms: {} }
const config = { revision: 2, values, defaults: values, icons: ['fleet', 'fuel', 'home'], navigation: { fleet: 'Veículos', home: 'Início' },
  form_catalog: { vehicles: [{ key: 'plate', label: 'Placa', required: true }, { key: 'chassi', label: 'Número do chassi', required: false }] } }
beforeEach(() => {
  vi.clearAllMocks()
  api.get.mockResolvedValue({ data: structuredClone(config) })
  api.put.mockImplementation(async (_path, body) => ({ data: { ...config, revision: 3, values: body.values } }))
})
function mount(search = '') { return render(<MemoryRouter initialEntries={['/parametros' + search]}><SystemSettingsPage /></MemoryRouter>) }

it('mantém as alterações na prévia até a conferência e publicação explícita', async () => {
  const actor = userEvent.setup(); mount()
  await actor.clear(await screen.findByLabelText(/Nome do sistema/))
  await actor.type(screen.getByLabelText(/Nome do sistema/), 'Frota Exemplo')
  expect(within(screen.getByLabelText('Prévia da identidade do sistema')).getByText('Frota Exemplo')).toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  const dialog = screen.getByRole('dialog', { name: 'Conferir alterações' })
  await actor.type(within(dialog).getByLabelText(/Justificativa/), 'Atualização da identidade institucional')
  await actor.click(within(dialog).getByRole('button', { name: 'Publicar parâmetros' }))
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/system-settings', expect.objectContaining({ expected_revision: 2,
    values: expect.objectContaining({ identity: expect.objectContaining({ systemName: 'Frota Exemplo' }) }) })))
  expect(publish).toHaveBeenCalled()
})

it('muda cores e formato na prévia sem alterar os parâmetros publicados', async () => {
  const actor = userEvent.setup(); mount('?section=appearance')
  await actor.click(await screen.findByRole('button', { name: 'Verde' }))
  expect(screen.getByLabelText('Prévia da identidade do sistema').style.getPropertyValue('--brand-primary')).toBe('#087f5b')
  await actor.click(screen.getByRole('button', { name: 'Celular', exact: true }))
  expect(screen.getByLabelText('Prévia da identidade do sistema')).toHaveClass('settings-preview--mobile')
  expect(api.put).not.toHaveBeenCalled()
})

it('protege identificação obrigatória e permite ocultar campo opcional e criar campo adicional', async () => {
  const actor = userEvent.setup(); mount('?section=forms')
  expect(await screen.findByLabelText('Exibir Placa')).toBeDisabled()
  await actor.click(screen.getByLabelText('Exibir Número do chassi'))
  expect(screen.getByLabelText('Exibir Número do chassi')).not.toBeChecked()
  await actor.click(screen.getByRole('button', { name: '+ Adicionar campo' }))
  await actor.clear(screen.getByLabelText('Nome do campo'))
  await actor.type(screen.getByLabelText('Nome do campo'), 'Centro de custo')
  expect(screen.getByRole('button', { name: 'Excluir campo Centro de custo' })).toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()
})

it('preserva o rascunho quando outra sessão já mudou a configuração', async () => {
  api.put.mockRejectedValue({ response: { status: 409, data: { detail: 'A configuração mudou. Atualize a referência.' } } })
  const actor = userEvent.setup(); mount()
  fireEvent.change(await screen.findByLabelText(/Nome do sistema/), { target: { value: 'Rascunho preservado' } })
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  await actor.type(screen.getByLabelText(/Justificativa/), 'Conferência de conflito entre sessões')
  await actor.click(screen.getByRole('button', { name: 'Publicar parâmetros' }))
  await screen.findByText('A configuração mudou. Atualize a referência.', { selector: '.settings-review .form-error' })
  expect(screen.getByLabelText(/Nome do sistema/)).toHaveValue('Rascunho preservado')
  expect(publish).not.toHaveBeenCalled()
})
