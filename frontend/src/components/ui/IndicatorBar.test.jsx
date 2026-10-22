import { useEffect } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import IndicatorBar from './IndicatorBar'
import { useInteractiveKpis } from '../../hooks/useInteractiveKpis'
import { formatIndicator } from '../../utils/indicatorFormat'

const metadata = { population: 120, items: [
  { key: 'total', label: 'Todos', value: 120 },
  { key: 'pending', label: 'Pendentes', value: 7, tone: 'warning' },
  { key: 'empty', label: 'Sem comprovante', value: 0 },
] }
function Harness(props) {
  const state = useInteractiveKpis()
  const { setMetadata } = state
  useEffect(() => { setMetadata(metadata) }, [setMetadata])
  const location = useLocation()
  return <><IndicatorBar state={state} {...props} /><output aria-label="URL">{location.search}</output></>
}
function mount(props = {}, path = '/?search=abc&focus=1') {
  return render(<MemoryRouter initialEntries={[path]}><Harness {...props} /></MemoryRouter>)
}
describe('indicadores interativos', () => {
  it('seleciona o indicador, preserva busca, remove foco e limpa sem alterar os totais', () => {
    mount()
    const pending = screen.getByRole('button', { name: /Pendentes/ })
    fireEvent.click(pending)
    expect(pending).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('URL')).toHaveTextContent('search=abc&indicator=pending')
    expect(screen.getByLabelText('URL')).not.toHaveTextContent('focus')
    expect(within(screen.getByRole('button', { name: /Todos/ })).getByText('120')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar indicador' }))
    expect(screen.getByLabelText('URL')).toHaveTextContent('?search=abc')
  })
  it('permite consultar zero, alternar a seleção e operar pelo teclado', async () => {
    const user = userEvent.setup()
    mount()
    const empty = screen.getByRole('button', { name: /Sem comprovante/ })
    empty.focus(); await user.keyboard('{Enter}')
    expect(empty).toHaveAttribute('aria-pressed', 'true')
    expect(within(empty).getByText('0')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(empty).toHaveAttribute('aria-pressed', 'false')
  })
  it('lê o filtro de um link direto e oculta números antigos ao carregar ou falhar', () => {
    mount({ loading: true }, '/?indicator=pending')
    expect(screen.getByRole('button', { name: /Pendentes/ })).toBeDisabled()
    expect(screen.queryByText('120')).not.toBeInTheDocument()
  })
  it('formata contagem, litros e moeda sem transformar ausência em zero', () => {
    expect(formatIndicator(1234)).toBe('1.234')
    expect(formatIndicator(12.5, 'L')).toBe('12,5 L')
    expect(formatIndicator(0, 'BRL')).toMatch(/R\$\s0,00/)
    expect(formatIndicator(null)).toBe('—')
  })
})
