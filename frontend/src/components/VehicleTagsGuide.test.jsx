import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VehicleTagsGuide from './VehicleTagsGuide'

const mocks = vi.hoisted(() => ({ get: vi.fn(), acknowledge: vi.fn(), edit: true }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ canEdit: () => mocks.edit }) }))
vi.mock('../api/featureGuides', () => ({ featureGuidesAPI: { getVehicleTags: mocks.get, acknowledgeVehicleTags: mocks.acknowledge } }))

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  mocks.edit = true
  mocks.get.mockResolvedValue({ data: { acknowledged: false } })
  mocks.acknowledge.mockResolvedValue({ data: { acknowledged: true } })
})

describe('tour das etiquetas por usuário', () => {
  it('abre automaticamente, explica o fluxo sem alterar dados e salva ao concluir', async () => {
    render(<VehicleTagsGuide userId="ana" enabled />)
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Novidade: etiquetas nos veículos')
    expect(screen.getByText(/não alteram o status/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByText(/inclusive em posses encerradas/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByRole('heading', { name: '1. Crie seu catálogo pessoal' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByText(/Adicionar etiqueta/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByText(/pelo menos uma delas/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByText(/justificativa/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(mocks.acknowledge).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar tour' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocks.acknowledge).toHaveBeenCalledTimes(1)
  })

  it('não reapresenta quem já viu; permite rever e pular', async () => {
    mocks.get.mockResolvedValue({ data: { acknowledged: true } })
    render(<VehicleTagsGuide userId="ana" enabled />)
    await waitFor(() => expect(mocks.get).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('vehicle-tags-guide:replay')))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }))
    await waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledTimes(1))
  })

  it('apresenta consulta para leitor e usa o servidor mesmo em navegador compartilhado', async () => {
    mocks.edit = false
    window.localStorage.setItem('frota-vehicle-tags-tour-v1', '1')
    render(<VehicleTagsGuide userId="outro-usuario" enabled />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByRole('heading', { name: 'Consulta conforme seu acesso' })).toBeInTheDocument()
    expect(screen.getByText(/exige permissão/)).toBeInTheDocument()
    expect(screen.getByText('Passo 3 de 6')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledTimes(1))
  })

  it('aguarda diálogo anterior e não compete com outro tour', async () => {
    const { rerender } = render(<><section role="dialog">Aviso anterior</section><VehicleTagsGuide userId="ana" enabled /></>)
    await waitFor(() => expect(mocks.get).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 220))
    expect(screen.queryByRole('heading', { name: /Novidade: etiquetas/ })).not.toBeInTheDocument()
    rerender(<><VehicleTagsGuide userId="ana" enabled /></>)
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Novidade: etiquetas nos veículos')
  })

  it('bloqueia envio duplicado e permite tentar de novo se a gravação falhar', async () => {
    let reject
    mocks.acknowledge.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    render(<VehicleTagsGuide userId="ana" enabled />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mocks.acknowledge).toHaveBeenCalledTimes(1)
    await act(async () => reject(new Error('offline')))
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar')
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocks.acknowledge).toHaveBeenCalledTimes(2)
  })

  it('não apresenta durante senha/CPF obrigatório e retoma quando liberado', async () => {
    const { rerender } = render(<VehicleTagsGuide userId="ana" enabled={false} />)
    expect(mocks.get).not.toHaveBeenCalled()
    rerender(<VehicleTagsGuide userId="ana" enabled />)
    await screen.findByRole('dialog')
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })

  it('permite continuar trabalhando sem salvar quando a conexão falha', async () => {
    mocks.acknowledge.mockRejectedValue(new Error('offline'))
    render(<VehicleTagsGuide userId="ana" enabled />)
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Continuar sem salvar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    act(() => window.dispatchEvent(new Event('vehicle-tags-guide:replay')))
    await screen.findByRole('dialog')
  })

  it('falha de consulta não bloqueia trabalho e permite abrir manualmente', async () => {
    mocks.get.mockRejectedValue(new Error('offline'))
    render(<VehicleTagsGuide userId="ana" enabled />)
    await waitFor(() => expect(mocks.get).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('vehicle-tags-guide:replay')))
    await screen.findByRole('dialog')
  })
})
