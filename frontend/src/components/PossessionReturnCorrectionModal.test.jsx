import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import PossessionReturnCorrectionModal from './PossessionReturnCorrectionModal'

it('explica o append-only e exige novo aceite na correção administrativa', () => {
  render(
    <PossessionReturnCorrectionModal
      record={{ public_number: 123 }}
      context={{
        possession_public_number: 123,
        minimum_end_odometer_km: 100,
        declaration: { version: '1.0', text: 'Declaração canônica da devolução.' },
        current_confirmation: { version: 2 },
      }}
      form={{ end_odometer_km: '105', vehicle_condition_notes: 'Sem ressalvas', correction_reason: 'Correção administrativa', declaration_accepted: false }}
      saving={false}
      error=""
      onChange={vi.fn()}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
    />,
  )
  expect(screen.getByText(/versão atual 2/)).toBeInTheDocument()
  expect(screen.getByText(/não será alterada nem apagada/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  expect(screen.getByRole('button', { name: 'Criar nova versão' })).toBeDisabled()
})
