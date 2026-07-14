import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FineInfractionsCatalog from './FineInfractionsCatalog'

const mocks = vi.hoisted(() => ({
  listInfractions: vi.fn(),
  createInfraction: vi.fn(),
  updateInfraction: vi.fn(),
}))

vi.mock('../api/fines', () => ({
  finesAPI: mocks,
}))

vi.mock('./Pagination', () => ({ default: () => null }))

const infraction = {
  id: 'infraction-1',
  code: '7455',
  desdobramento: '0',
  description: 'Transitar em velocidade superior à máxima permitida',
  ctb_article: 'Art. 218',
  offender: 'Condutor',
  severity: 'Grave',
  competent_body: 'Órgão autuador',
  default_amount: '195.23',
  points: 5,
  is_active: true,
  is_official: true,
  is_provisional: false,
  source: 'CTB',
}

describe('FineInfractionsCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listInfractions.mockResolvedValue({ data: [infraction] })
    mocks.createInfraction.mockResolvedValue({ data: infraction })
    mocks.updateInfraction.mockResolvedValue({ data: infraction })
  })

  it('carrega todo o catálogo dentro do limite aceito pelo backend', async () => {
    render(<FineInfractionsCatalog />)

    expect(await screen.findByText(infraction.description)).toBeInTheDocument()
    expect(mocks.listInfractions).toHaveBeenCalledWith({ limit: 500, active_only: false })
    expect(screen.getByLabelText('Pontos')).toHaveAttribute('max', '99')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('normaliza o cadastro e não envia o identificador interno no payload', async () => {
    const user = userEvent.setup()
    mocks.listInfractions.mockResolvedValue({ data: [] })
    render(<FineInfractionsCatalog />)
    await waitFor(() => expect(mocks.listInfractions).toHaveBeenCalledTimes(1))

    await user.type(screen.getByLabelText('Código'), ' 7455 ')
    await user.clear(screen.getByLabelText('Desdobramento'))
    await user.type(screen.getByLabelText('Desdobramento'), ' 1 ')
    await user.type(screen.getByLabelText('Descrição'), '  Infração de teste válida  ')
    await user.type(screen.getByLabelText('Valor padrão'), '195.23')
    await user.type(screen.getByLabelText('Pontos'), '5')
    await user.click(screen.getByRole('button', { name: 'Cadastrar enquadramento' }))

    await waitFor(() => expect(mocks.createInfraction).toHaveBeenCalledTimes(1))
    const payload = mocks.createInfraction.mock.calls[0][0]
    expect(payload).toMatchObject({
      code: '7455',
      desdobramento: '1',
      description: 'Infração de teste válida',
      ctb_article: null,
      offender: null,
      severity: null,
      competent_body: null,
      default_amount: 195.23,
      points: 5,
      source: null,
      is_active: true,
    })
    expect(payload).not.toHaveProperty('id')
    expect(await screen.findByRole('status')).toHaveTextContent('Enquadramento cadastrado.')
  })

  it('edita pelo identificador da rota sem incluí-lo no corpo da requisição', async () => {
    const user = userEvent.setup()
    render(<FineInfractionsCatalog />)
    await screen.findByText(infraction.description)

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    const description = screen.getByLabelText('Descrição')
    await user.clear(description)
    await user.type(description, 'Descrição atualizada')
    await user.click(screen.getByRole('button', { name: 'Atualizar enquadramento' }))

    await waitFor(() => expect(mocks.updateInfraction).toHaveBeenCalledTimes(1))
    expect(mocks.updateInfraction).toHaveBeenCalledWith(
      infraction.id,
      expect.objectContaining({ description: 'Descrição atualizada' }),
    )
    expect(mocks.updateInfraction.mock.calls[0][1]).not.toHaveProperty('id')
  })
})
