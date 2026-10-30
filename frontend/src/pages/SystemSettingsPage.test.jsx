import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter } from 'react-router-dom'
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

it('exibe a densidade selecionada apenas na prévia até publicar', async () => {
  const actor = userEvent.setup(); mount('?section=appearance')
  await actor.selectOptions(await screen.findByLabelText('Densidade da interface'), 'compact')
  expect(screen.getByLabelText('Prévia da identidade do sistema')).toHaveAttribute('data-preview-density', 'compact')
  expect(document.documentElement.dataset.density).not.toBe('compact')
  expect(api.put).not.toHaveBeenCalled()
})

it('permite abrir a personalização de ícones e conferir os nomes da troca', async () => {
  const actor = userEvent.setup(); mount('?section=appearance')
  await actor.click(await screen.findByText('Ícones de cada aba'))
  await actor.selectOptions(screen.getByLabelText('Ícone de Veículos'), 'home')
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  const comparison = screen.getByLabelText('Alterações antes e depois')
  expect(comparison).toHaveTextContent('Ícones · Veículos')
  expect(comparison).toHaveTextContent('PublicadoVeículos')
  expect(comparison).toHaveTextContent('Após publicarInício')
  expect(api.put).not.toHaveBeenCalled()
})

it('valida também as abas ocultas e conduz à correção sem perder o formulário', async () => {
  const actor = userEvent.setup(); mount('?section=appearance')
  await actor.clear(await screen.findByLabelText('Código de Cor principal'))
  await actor.click(screen.getByRole('button', { name: 'Identidade', exact: true }))
  fireEvent.change(screen.getByLabelText(/Nome do sistema/), { target: { value: 'Rascunho válido' } })
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  expect(screen.getByText('Revise os campos antes de publicar')).toBeInTheDocument()
  expect(screen.getByLabelText('Código de Cor principal')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(api.put).not.toHaveBeenCalled()
  await actor.click(screen.getByRole('button', { name: 'Identidade', exact: true }))
  expect(screen.getByLabelText(/Nome do sistema/)).toHaveValue('Rascunho válido')
})

it('oferece nova tentativa após falha de carregamento', async () => {
  api.get.mockRejectedValueOnce(new Error('offline'))
  const actor = userEvent.setup(); mount()
  await actor.click(await screen.findByRole('button', { name: 'Tentar carregar novamente' }))
  expect(await screen.findByLabelText(/Nome do sistema/)).toHaveValue(identity.systemName)
})

it('concilia uma referência nova preservando alterações independentes das duas sessões', async () => {
  const actor = userEvent.setup(); mount()
  fireEvent.change(await screen.findByLabelText(/Nome do sistema/), { target: { value: 'Minha edição' } })
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  expect(screen.getByLabelText('Alterações antes e depois')).toHaveTextContent('Minha edição')
  await actor.type(screen.getByLabelText(/Justificativa/), 'Teste de alterações concorrentes')
  api.put.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'Outra sessão publicou.' } } })
  await actor.click(screen.getByRole('button', { name: 'Publicar parâmetros' }))
  const next = structuredClone(config); next.revision = 3; next.values.identity.city = 'Cidade da outra sessão'
  api.get.mockResolvedValueOnce({ data: next })
  await actor.click(await screen.findByRole('button', { name: 'Atualizar referência sem perder rascunho' }))
  expect(screen.getByLabelText(/Nome do sistema/)).toHaveValue('Minha edição')
  expect(screen.getByLabelText(/Município/)).toHaveValue('Cidade da outra sessão')
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  await actor.click(screen.getByRole('button', { name: 'Publicar parâmetros' }))
  expect(api.put.mock.lastCall[1]).toMatchObject({ expected_revision: 3, values: { identity: { city: 'Cidade da outra sessão', systemName: 'Minha edição' } } })
})

it('pede escolha quando as duas sessões editaram o mesmo parâmetro', async () => {
  const actor = userEvent.setup(); mount()
  fireEvent.change(await screen.findByLabelText(/Nome do sistema/), { target: { value: 'Minha edição' } })
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  await actor.type(screen.getByLabelText(/Justificativa/), 'Conferência das versões')
  api.put.mockRejectedValueOnce({ response: { status: 409, data: { detail: 'Outra sessão publicou.' } } })
  await actor.click(screen.getByRole('button', { name: 'Publicar parâmetros' }))
  const next = structuredClone(config); next.revision = 3; next.values.identity.systemName = 'Publicado por outra sessão'
  api.get.mockResolvedValueOnce({ data: next })
  await actor.click(await screen.findByRole('button', { name: 'Atualizar referência sem perder rascunho' }))
  const dialog = screen.getByRole('dialog', { name: 'Conciliar versões dos parâmetros' })
  expect(within(dialog).getByRole('button', { name: 'Aplicar escolhas ao rascunho' })).toBeDisabled()
  await actor.click(within(dialog).getByRole('radio', { name: /Manter meu preenchimento/ }))
  await actor.click(within(dialog).getByRole('button', { name: 'Aplicar escolhas ao rascunho' }))
  expect(screen.getByLabelText(/Nome do sistema/)).toHaveValue('Minha edição')
  expect(api.put).toHaveBeenCalledTimes(1)
})

it('não recicla o identificador de um campo removido e apresenta o impacto na conferência', async () => {
  const start = structuredClone(config)
  start.values.forms.vehicles = { fields: {}, custom: [{ key: 'campo_1', label: 'Informação anterior', type: 'text', required: false }] }
  api.get.mockResolvedValueOnce({ data: start })
  const actor = userEvent.setup(); mount('?section=forms')
  await actor.click(await screen.findByRole('button', { name: 'Excluir campo Informação anterior' }))
  await actor.click(screen.getByRole('button', { name: '+ Adicionar campo' }))
  await actor.click(screen.getByRole('button', { name: 'Conferir e publicar' }))
  expect(screen.getByText(/Os valores já registrados serão preservados/)).toBeInTheDocument()
  await actor.type(screen.getByLabelText(/Justificativa/), 'Troca de campos em teste')
  await actor.click(screen.getByRole('button', { name: 'Publicar parâmetros' }))
  expect(api.put.mock.lastCall[1].values.forms.vehicles.custom[0].key).not.toBe('campo_1')
})

it('impede sair por um link interno sem confirmar o descarte do rascunho', async () => {
  const actor = userEvent.setup()
  render(<MemoryRouter initialEntries={['/parametros']}><Link to="/vehicles">Abrir veículos</Link><SystemSettingsPage /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText(/Nome do sistema/), { target: { value: 'Meu rascunho' } })
  await actor.click(screen.getByRole('link', { name: 'Abrir veículos' }))
  expect(screen.getByRole('dialog', { name: 'Sair com alterações não publicadas?' })).toBeInTheDocument()
  await actor.click(screen.getByRole('button', { name: 'Continuar editando' }))
  expect(screen.getByLabelText(/Nome do sistema/)).toHaveValue('Meu rascunho')
})
