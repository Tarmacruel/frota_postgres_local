import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TripTimeline from './TripTimeline'

const restrictedTrip = {
  id: 'trip-1',
  sequence_number: 1,
  status: 'ENCERRADA',
  purpose: 'Atendimento externo',
  origin: 'Informação restrita',
  departure_at: '2026-07-13T12:00:00Z',
  return_at: '2026-07-13T13:00:00Z',
  start_odometer_km: '100.0',
  end_odometer_km: '110.0',
  kilometers_driven: '10.0',
  observation: null,
  cancellation_reason: null,
  destinations: [],
  operational_details_restricted: true,
}

describe('TripTimeline', () => {
  it('respeita a resposta restrita do backend e não oferece mutações ao perfil de consulta', () => {
    render(
      <TripTimeline
        trips={[restrictedTrip]}
        canEdit={false}
        onAddDestination={vi.fn()}
        onEnd={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText(/Detalhes operacionais restritos/)).toBeInTheDocument()
    expect(screen.queryByText('Informação restrita')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Registrar retorno/ })).not.toBeInTheDocument()
  })
})
