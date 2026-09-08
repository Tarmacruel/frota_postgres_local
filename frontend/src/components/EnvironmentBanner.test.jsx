import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import EnvironmentBanner from './EnvironmentBanner'

describe('EnvironmentBanner', () => {
  it('exibe uma identificação permanente quando a homologação está ativa', () => {
    render(<EnvironmentBanner enabled />)

    expect(screen.getByRole('status', { name: 'Ambiente de homologação' })).toHaveTextContent('AMBIENTE DE HOMOLOGAÇÃO')
    expect(screen.getByText(/Não utilize para operação oficial/)).toBeInTheDocument()
  })

  it('não altera a produção quando a flag está desativada', () => {
    const { container } = render(<EnvironmentBanner enabled={false} />)
    expect(container).toBeEmptyDOMElement()
  })
})
