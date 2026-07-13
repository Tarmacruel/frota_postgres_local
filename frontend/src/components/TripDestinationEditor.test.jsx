import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { createDestinationDraft } from '../utils/tripDestination'
import TripDestinationEditor from './TripDestinationEditor'

function Harness() {
  const [destinations, setDestinations] = useState([
    createDestinationDraft({ description: 'Almoxarifado' }),
    createDestinationDraft({ description: 'Oficina' }),
  ])
  return <TripDestinationEditor idPrefix="test" destinations={destinations} onChange={setDestinations} />
}

describe('TripDestinationEditor', () => {
  it('permite reordenar destinos pelo teclado sem depender de drag-and-drop', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: 'Mover destino 2 para cima' }))

    const descriptions = screen.getAllByRole('textbox', { name: /Descrição do destino/ })
    expect(descriptions[0]).toHaveValue('Oficina')
    expect(descriptions[1]).toHaveValue('Almoxarifado')
    expect(screen.getByRole('button', { name: 'Mover destino 1 para cima' })).toBeDisabled()
  })
})
