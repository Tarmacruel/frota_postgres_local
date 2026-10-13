import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FuelSupplyAlertBadge from './FuelSupplyAlertBadge'

const record = { vehicle_plate: 'ABC1D23', anomaly_details: 'Consumo abaixo da média histórica registrada.' }
afterEach(() => vi.useRealTimers())

describe('FuelSupplyAlertBadge', () => {
  it('descreve o motivo no foco e permite dispensar por Escape sem abrir o drawer', () => {
    const open = vi.fn()
    render(<FuelSupplyAlertBadge record={record} onOpen={open} />)
    const button = screen.getByRole('button')
    fireEvent.focus(button)
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
    expect(screen.getByRole('tooltip')).toHaveTextContent(record.anomaly_details)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(open).not.toHaveBeenCalled()
  })

  it('permite mover o ponteiro para ler o tooltip e fecha ao sair', () => {
    vi.useFakeTimers()
    render(<FuelSupplyAlertBadge record={record} onOpen={vi.fn()} />)
    const button = screen.getByRole('button')
    fireEvent.mouseEnter(button)
    fireEvent.mouseLeave(button)
    fireEvent.mouseEnter(screen.getByRole('tooltip'))
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByRole('tooltip'))
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('remove o resumo ao rolar a página para não apontar a outro registro', () => {
    render(<FuelSupplyAlertBadge record={record} onOpen={vi.fn()} />)
    fireEvent.mouseEnter(screen.getByRole('button'))
    fireEvent.scroll(window)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('acompanha o botão quando o navegador rola para dar foco a ele', () => {
    render(<FuelSupplyAlertBadge record={record} onOpen={vi.fn()} />)
    const button = screen.getByRole('button')
    vi.spyOn(button, 'getBoundingClientRect')
      .mockReturnValueOnce({ top: 100, bottom: 120, left: 100, right: 150 })
      .mockReturnValue({ top: 50, bottom: 70, left: 100, right: 150 })
    fireEvent.focus(button)
    expect(screen.getByRole('tooltip')).toHaveStyle({ top: '128px' })
    fireEvent.scroll(window)
    expect(screen.getByRole('tooltip')).toHaveStyle({ top: '78px' })
    expect(button).toHaveAttribute('aria-describedby', screen.getByRole('tooltip').id)
  })
})
