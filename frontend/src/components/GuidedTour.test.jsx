import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { calculateTourLayout } from '../utils/guidedTourLayout'
import GuidedTour from './GuidedTour'

const steps = [
  { selector: '[data-tour="one"]', title: 'Primeiro passo', description: 'Descrição inicial.' },
  { selector: '[data-tour="two"]', title: 'Segundo passo', description: 'Descrição final.' },
]

function rectangle({ left, top, width, height }) {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }
}

describe('calculateTourLayout', () => {
  const viewport = { left: 0, top: 0, width: 1024, height: 768 }
  const dialogRect = rectangle({ left: 0, top: 0, width: 380, height: 220 })

  it('posiciona o balão abaixo ou acima do alvo conforme o espaço visível', () => {
    const nearTop = calculateTourLayout({
      targetRect: rectangle({ left: 360, top: 80, width: 180, height: 44 }),
      dialogRect,
      viewport,
    })
    const nearBottom = calculateTourLayout({
      targetRect: rectangle({ left: 360, top: 680, width: 180, height: 44 }),
      dialogRect,
      viewport,
    })

    expect(nearTop.placement).toBe('bottom')
    expect(nearTop.dialog.top).toBeGreaterThan(nearTop.spotlight.bottom)
    expect(nearBottom.placement).toBe('top')
    expect(nearBottom.dialog.top + dialogRect.height).toBeLessThan(nearBottom.spotlight.top)
  })

  it('mantém balão e destaque dentro de uma viewport mobile', () => {
    const mobileViewport = { left: 0, top: 0, width: 320, height: 568 }
    const layout = calculateTourLayout({
      targetRect: rectangle({ left: 90, top: 250, width: 140, height: 48 }),
      dialogRect: rectangle({ left: 0, top: 0, width: 296, height: 300 }),
      viewport: mobileViewport,
    })

    expect(layout.dialog.left).toBeGreaterThanOrEqual(12)
    expect(layout.dialog.top).toBeGreaterThanOrEqual(12)
    expect(layout.dialog.left + 296).toBeLessThanOrEqual(308)
    expect(layout.dialog.maxHeight).toBe(236)
    expect(layout.dialog.top + layout.dialog.maxHeight).toBeLessThanOrEqual(556)
    expect(layout.dialog.top).toBeGreaterThan(layout.spotlight.bottom)
    expect(layout.spotlight.left).toBeGreaterThanOrEqual(12)
    expect(layout.spotlight.right).toBeLessThanOrEqual(308)
  })

  it('restringe a largura quando o melhor espaço fica ao lado do alvo', () => {
    const layout = calculateTourLayout({
      targetRect: rectangle({ left: 400, top: 140, width: 100, height: 40 }),
      dialogRect: rectangle({ left: 0, top: 0, width: 400, height: 220 }),
      viewport: { left: 0, top: 0, width: 900, height: 320 },
    })

    expect(layout.placement).toBe('right')
    expect(layout.dialog.maxWidth).toBe(366)
    expect(layout.dialog.left).toBeGreaterThan(layout.spotlight.right)
    expect(layout.dialog.left + layout.dialog.maxWidth).toBeLessThanOrEqual(888)
  })

  it('usa modo central quando a viewport não comporta ancoragem segura', () => {
    const landscape = calculateTourLayout({
      targetRect: rectangle({ left: 300, top: 140, width: 100, height: 40 }),
      dialogRect: rectangle({ left: 0, top: 0, width: 400, height: 220 }),
      viewport: { left: 0, top: 0, width: 700, height: 320 },
    })
    const shortPortrait = calculateTourLayout({
      targetRect: rectangle({ left: 90, top: 150, width: 140, height: 48 }),
      dialogRect: rectangle({ left: 0, top: 0, width: 296, height: 300 }),
      viewport: { left: 0, top: 0, width: 320, height: 360 },
    })

    expect(landscape).toMatchObject({ placement: 'center', spotlight: null })
    expect(shortPortrait).toMatchObject({ placement: 'center', spotlight: null })
  })

  it('limita o destaque de alvos extensos à área realmente visível', () => {
    const layout = calculateTourLayout({
      targetRect: rectangle({ left: 0, top: -200, width: 900, height: 1400 }),
      dialogRect,
      viewport: { left: 0, top: 0, width: 390, height: 844 },
    })

    expect(layout.spotlight.width).toBe(366)
    expect(layout.spotlight.height).toBeLessThanOrEqual(220)
    expect(layout.spotlight.top).toBeGreaterThanOrEqual(12)
    expect(layout.spotlight.bottom).toBeLessThanOrEqual(832)
  })

  it('limita o balão à visual viewport quando teclado ou zoom reduzem a tela', () => {
    const layout = calculateTourLayout({
      targetRect: null,
      dialogRect: rectangle({ left: 0, top: 0, width: 366, height: 500 }),
      viewport: { left: 20, top: 100, width: 300, height: 280 },
    })

    expect(layout.placement).toBe('center')
    expect(layout.dialog.maxWidth).toBe(276)
    expect(layout.dialog.maxHeight).toBe(256)
    expect(layout.dialog.left).toBe(32)
    expect(layout.dialog.top).toBe(112)
  })
})

describe('GuidedTour', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 })
  })

  afterEach(() => {
    document.getElementById('root')?.remove()
  })

  it('orienta por passos, destaca o alvo e persiste somente ao encerrar', async () => {
    render(
      <>
        <div data-tour="one">Alvo um</div>
        <div data-tour="two">Alvo dois</div>
        <GuidedTour steps={steps} storageKey="tour-test" />
      </>,
    )

    expect(screen.getByRole('dialog', { name: 'Primeiro passo' })).toBeInTheDocument()
    expect(document.querySelector('[data-tour="one"]')).toHaveClass('guided-tour-highlight')
    expect(window.localStorage.getItem('tour-test')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByRole('dialog', { name: 'Segundo passo' })).toBeInTheDocument()
    expect(document.querySelector('[data-tour="one"]')).not.toHaveClass('guided-tour-highlight')
    expect(document.querySelector('[data-tour="two"]')).toHaveClass('guided-tour-highlight')

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar tour' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.localStorage.getItem('tour-test')).toBe('1')
  })

  it('renderiza em portal, bloqueia a aplicação e mantém as ações em foco', async () => {
    const previousFocus = document.createElement('button')
    previousFocus.textContent = 'Abrir tour'
    document.body.append(previousFocus)
    previousFocus.focus()
    const appRoot = document.createElement('div')
    appRoot.id = 'root'
    document.body.append(appRoot)

    render(
      <>
        <div data-tour="one">Alvo um</div>
        <GuidedTour steps={[steps[0]]} storageKey="tour-portal" />
      </>,
      { container: appRoot },
    )

    const layer = screen.getByTestId('guided-tour-layer')
    expect(layer.parentElement).toBe(document.body)
    expect(appRoot).toHaveAttribute('inert')
    expect(screen.getByLabelText('Conteúdo do passo atual')).toHaveAttribute('tabindex', '0')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Encerrar tour' })).toHaveFocus())

    fireEvent.click(screen.getByRole('button', { name: 'Pular tour' }))
    await waitFor(() => expect(appRoot).not.toHaveAttribute('inert'))
    await waitFor(() => expect(previousFocus).toHaveFocus())
    previousFocus.remove()
  })

  it('acompanha o alvo durante rolagem e troca o lado do balão', async () => {
    let targetTop = 80
    render(
      <>
        <div data-tour="one">Alvo um</div>
        <GuidedTour steps={[steps[0]]} storageKey="tour-position" />
      </>,
    )
    const target = document.querySelector('[data-tour="one"]')
    target.getBoundingClientRect = () => rectangle({ left: 360, top: targetTop, width: 180, height: 44 })

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'bottom'))
    const initialTop = screen.getByRole('dialog').style.top

    targetTop = 680
    window.dispatchEvent(new Event('scroll'))

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'top'))
    expect(screen.getByRole('dialog').style.top).not.toBe(initialTop)
  })

  it('usa seletores alternativos e centraliza quando nenhum alvo existe', async () => {
    const fallbackSteps = [{
      selectors: ['[data-tour="missing"]', '[data-tour="fallback"]'],
      title: 'Alvo alternativo',
      description: 'Descrição.',
    }]
    const { container, rerender } = render(
      <>
        <div style={{ display: 'none' }}>
          <button type="button" data-tour="missing">Alvo oculto</button>
        </div>
        <div data-tour="fallback">Alvo encontrado</div>
        <GuidedTour steps={fallbackSteps} storageKey="tour-fallback" />
      </>,
    )

    expect(document.querySelector('[data-tour="fallback"]')).toHaveClass('guided-tour-highlight')
    const preferredTarget = document.createElement('button')
    preferredTarget.dataset.tour = 'missing'
    preferredTarget.textContent = 'Alvo carregado depois'
    container.prepend(preferredTarget)
    await waitFor(() => expect(preferredTarget).toHaveClass('guided-tour-highlight'))
    expect(document.querySelector('[data-tour="fallback"]')).not.toHaveClass('guided-tour-highlight')

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar tour' }))
    window.localStorage.removeItem('tour-fallback')
    preferredTarget.remove()

    rerender(
      <GuidedTour
        steps={[{ selector: '[data-tour="absent"]', title: 'Sem alvo', description: 'Descrição.' }]}
        storageKey="tour-fallback"
        replayToken={1}
      />,
    )

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-placement', 'center'))
  })

  it('pode ser reaberto sem armazenar dado pessoal', () => {
    window.localStorage.setItem('tour-test', '1')
    const { rerender } = render(<GuidedTour steps={steps} storageKey="tour-test" replayToken={0} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<GuidedTour steps={steps} storageKey="tour-test" replayToken={1} />)
    expect(screen.getByRole('dialog', { name: 'Primeiro passo' })).toBeInTheDocument()
    expect(Object.keys(window.localStorage)).toEqual(['tour-test'])
  })
})
