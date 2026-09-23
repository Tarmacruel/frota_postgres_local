import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { driversAPI } from '../api/drivers'
import DriverSelect from './DriverSelect'
import Modal from './Modal'

const auth = vi.hoisted(() => ({ canEdit: vi.fn(() => true) }))
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }))

vi.mock('../api/drivers', () => ({
  driversAPI: {
    getById: vi.fn(),
    listActive: vi.fn(),
    update: vi.fn(),
  },
}))

const matchingDriver = {
  id: 'driver-321',
  nome_completo: 'Condutor 321',
  documento: '321.321.321-32',
  matricula: '000321',
  cnh_categoria: 'B',
  organization_name: 'Secretaria de Testes',
}

describe('DriverSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    auth.canEdit.mockReturnValue(true)
    driversAPI.listActive.mockResolvedValue({ data: [] })
  })

  it('busca no servidor e permite selecionar um condutor além da primeira página', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    driversAPI.listActive.mockImplementation(({ search }) => Promise.resolve({
      data: search === 'Condutor 321' ? [matchingDriver] : [],
    }))

    render(<DriverSelect value="" onChange={onChange} />)

    await waitFor(() => expect(driversAPI.listActive).toHaveBeenCalledWith({
      search: undefined,
      limit: 30,
    }))

    await user.click(screen.getByRole('button', { name: 'Condutor' }))
    await user.type(screen.getByRole('searchbox'), 'Condutor 321')

    expect(await screen.findByRole('button', { name: /Condutor 321/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Condutor 321/ }))

    expect(onChange).toHaveBeenCalledWith(matchingDriver)
    expect(driversAPI.listActive).toHaveBeenLastCalledWith({
      search: 'Condutor 321',
      limit: 30,
    })
  })

  it.each([null, '', '   '])('solicita matrícula ausente (%j) e só seleciona após salvar', async (matricula) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    driversAPI.listActive.mockResolvedValue({ data: [{ ...matchingDriver, matricula }] })
    driversAPI.update.mockResolvedValue({ data: matchingDriver })
    render(<DriverSelect value="" onChange={onChange} />)
    await user.click(await screen.findByRole('button', { name: 'Condutor' }))
    await user.click(await screen.findByRole('button', { name: /Condutor 321/ }))
    const dialog = screen.getByRole('dialog', { name: 'Editar condutor' })
    const input = within(dialog).getByLabelText('Matrícula (obrigatória)')
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('maxlength', '30')
    expect(onChange).not.toHaveBeenCalled()
    await user.type(input, '   ')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar e continuar' }))
    expect(driversAPI.update).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe a matrícula')
    await user.clear(input)
    await user.type(input, ' 000321 ')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar e continuar' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(matchingDriver))
    expect(driversAPI.update).toHaveBeenCalledWith(matchingDriver.id, { matricula: '000321' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mantém o modal aberto e impede a seleção se o salvamento falhar', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    driversAPI.listActive.mockResolvedValue({ data: [{ ...matchingDriver, matricula: null }] })
    driversAPI.update.mockRejectedValue({})
    render(<DriverSelect value="" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Condutor' }))
    await user.click(await screen.findByRole('button', { name: /Condutor 321/ }))
    await user.type(screen.getByLabelText('Matrícula (obrigatória)'), '000321')
    await user.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('regulariza também o condutor previamente selecionado ao editar um registro', async () => {
    const user = userEvent.setup()
    driversAPI.getById.mockResolvedValue({ data: { ...matchingDriver, matricula: null } })
    driversAPI.update.mockResolvedValue({ data: matchingDriver })
    function ExistingRecord() {
      const [driver, setDriver] = useState(matchingDriver)
      return <><output aria-label="Condutor selecionado">{driver?.id || 'nenhum'}</output><DriverSelect value={driver?.id || ''} onChange={setDriver} /></>
    }
    render(<ExistingRecord />)
    await screen.findByRole('dialog')
    expect(screen.getByLabelText('Condutor selecionado')).toHaveTextContent('nenhum')
    await user.type(screen.getByLabelText('Matrícula (obrigatória)'), '000321')
    await user.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await waitFor(() => expect(screen.getByLabelText('Condutor selecionado')).toHaveTextContent(matchingDriver.id))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('não exige atualização para filtros de consulta', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const legacy = { ...matchingDriver, matricula: null }
    driversAPI.listActive.mockResolvedValue({ data: [legacy] })
    render(<DriverSelect value="" onChange={onChange} requireRegistration={false} />)
    await user.click(screen.getByRole('button', { name: 'Condutor' }))
    await user.click(await screen.findByRole('button', { name: /Condutor 321/ }))
    expect(onChange).toHaveBeenCalledWith(legacy)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('respeita a permissão de edição sem liberar o condutor incompleto', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    auth.canEdit.mockReturnValue(false)
    driversAPI.listActive.mockResolvedValue({ data: [{ ...matchingDriver, matricula: null }] })
    render(<DriverSelect value="" onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Condutor' }))
    await user.click(await screen.findByRole('button', { name: /Condutor 321/ }))
    expect(screen.getByRole('alert')).toHaveTextContent('Você não tem permissão')
    expect(screen.queryByRole('button', { name: 'Salvar e continuar' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('não envia nem fecha o formulário de origem ao usar o modal de matrícula', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event) => event.preventDefault())
    const onClose = vi.fn()
    driversAPI.listActive.mockResolvedValue({ data: [{ ...matchingDriver, matricula: null }] })
    driversAPI.update.mockResolvedValue({ data: matchingDriver })
    render(<Modal open title="Nova posse" onClose={onClose}><form onSubmit={onSubmit}><DriverSelect value="" onChange={vi.fn()} /></form></Modal>)
    await user.click(screen.getByRole('button', { name: 'Condutor' }))
    await user.click(await screen.findByRole('button', { name: /Condutor 321/ }))
    await user.keyboard('{Escape}')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'Editar condutor' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Condutor' }))
    await user.click(await screen.findByRole('button', { name: /Condutor 321/ }))
    const input = screen.getByLabelText('Matrícula (obrigatória)')
    fireEvent.change(input, { target: { value: '000321' } })
    await user.click(screen.getByRole('button', { name: 'Salvar e continuar' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar condutor' })).not.toBeInTheDocument())
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Nova posse' })).toBeInTheDocument()
  })
})
