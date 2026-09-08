import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { driversAPI } from '../api/drivers'
import DriverSelect from './DriverSelect'

vi.mock('../api/drivers', () => ({
  driversAPI: {
    getById: vi.fn(),
    listActive: vi.fn(),
  },
}))

const matchingDriver = {
  id: 'driver-321',
  nome_completo: 'Condutor 321',
  documento: '321.321.321-32',
  cnh_categoria: 'B',
  organization_name: 'Secretaria de Testes',
}

describe('DriverSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
