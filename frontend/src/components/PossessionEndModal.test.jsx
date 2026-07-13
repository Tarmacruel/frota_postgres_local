import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PossessionEndModal from './PossessionEndModal'

const record = {
  public_number: 123,
  vehicle_plate: 'ABC1D23',
  driver_name: 'Condutor Teste',
  start_date: '2026-07-13T12:00:00Z',
}
const context = {
  possession_public_number: 123,
  minimum_end_odometer_km: 105,
  has_open_trip: false,
  declaration: {
    version: '1.0',
    text: 'Declaro que o veículo foi devolvido e confirmo os dados registrados.',
  },
}

function Harness({ onSubmit = vi.fn() }) {
  const form = {
    end_date: '2026-07-13T15:00',
    end_odometer_km: '105.0',
    vehicle_condition_notes: 'Sem ressalvas',
    declaration_accepted: false,
  }
  return <PossessionEndModal record={record} context={context} form={form} ending={false} error="" onChange={vi.fn()} onClose={vi.fn()} onSubmit={onSubmit} />
}

describe('PossessionEndModal', () => {
  it('exibe a declaração integral, deixa o aceite desmarcado e bloqueia o envio', () => {
    render(<Harness />)
    expect(screen.getByText(context.declaration.text)).toBeInTheDocument()
    expect(screen.getByText('Versão 1.0')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Li integralmente/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Confirmar devolução/ })).toBeDisabled()
  })

  it('encaminha a mudança explícita do checkbox sem alterar o texto', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PossessionEndModal record={record} context={context} form={{ end_date: '2026-07-13T15:00', end_odometer_km: '105', vehicle_condition_notes: 'Sem ressalvas', declaration_accepted: false }} ending={false} error="" onChange={onChange} onClose={vi.fn()} onSubmit={vi.fn()} />)
    await user.click(screen.getByRole('checkbox', { name: /Li integralmente/ }))
    expect(onChange).toHaveBeenCalledWith({ declaration_accepted: true })
  })

  it('mantém o encerramento bloqueado quando o backend informa rota aberta', () => {
    render(<PossessionEndModal record={record} context={{ ...context, has_open_trip: true }} form={{ end_date: '2026-07-13T15:00', end_odometer_km: '105', vehicle_condition_notes: 'Sem ressalvas', declaration_accepted: true }} ending={false} error="" onChange={vi.fn()} onClose={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByText(/há rota em andamento/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirmar devolução/ })).toBeDisabled()
  })
})
