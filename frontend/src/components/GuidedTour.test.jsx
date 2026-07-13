import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import GuidedTour from './GuidedTour'

const steps = [
  { selector: '[data-tour="one"]', title: 'Primeiro passo', description: 'Descrição inicial.' },
  { selector: '[data-tour="two"]', title: 'Segundo passo', description: 'Descrição final.' },
]

describe('GuidedTour', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.HTMLElement.prototype.scrollIntoView = () => {}
  })

  it('orienta por passos, destaca o alvo e persiste somente a conclusão', () => {
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
    expect(document.querySelector('[data-tour="two"]')).toHaveClass('guided-tour-highlight')

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('tour-test')).toBe('1')
  })

  it('pode ser reaberto sem armazenar dado pessoal', () => {
    window.localStorage.setItem('tour-test', '1')
    const { rerender } = render(<GuidedTour steps={steps} storageKey="tour-test" replayToken={0} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    rerender(<GuidedTour steps={steps} storageKey="tour-test" replayToken={1} />)
    expect(screen.getByRole('dialog', { name: 'Primeiro passo' })).toBeInTheDocument()
  })
})
