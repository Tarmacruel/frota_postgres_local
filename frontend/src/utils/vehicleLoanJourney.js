const stages = [
  { key: 'purpose', label: 'Proposta' }, { key: 'delivery', label: 'Entrega' },
  { key: 'units', label: 'Uso' }, { key: 'return', label: 'Devolução' },
]
const states = {
  DRAFT: { completed: 0, title: 'Prepare a entrega', next: 'Enviar para recebimento', owner: 'origin', hint: 'Revise a proposta antes de enviá-la à recebedora.' },
  AWAITING_RECEIPT: { completed: 1, title: 'Aguardando recebimento', next: 'Confirmar a entrega', owner: 'recipient', hint: 'A recebedora confere o veículo e confirma a entrega.' },
  ACTIVE: { completed: 2, title: 'Veículo em uso', next: 'Solicitar devolução', owner: 'recipient', hint: 'Ao encerrar o uso, a recebedora solicita a devolução.' },
  AWAITING_RETURN_RECEIPT: { completed: 3, title: 'Retorno em conferência', next: 'Confirmar a devolução', owner: 'origin', hint: 'A origem confere o retorno e confirma a devolução.' },
  RETURNED: { completed: 4, title: 'Percurso concluído', hint: 'Entrega e devolução registradas. Os documentos continuam disponíveis.' },
  REJECTED: { completed: 1, title: 'Proposta rejeitada', stopped: true, hint: 'A entrega não foi confirmada. Consulte o motivo no histórico.' },
  CANCELLED: { title: 'Proposta cancelada', stopped: true, hint: 'O histórico preserva as ações realizadas antes do cancelamento.' },
}

export function vehicleLoanJourney(loan, events = []) {
  const state = states[loan.status]
  if (!state) return null
  const regularized = Boolean(loan.regularized_at) && ['ACTIVE', 'AWAITING_RETURN_RECEIPT', 'RETURNED'].includes(loan.status)
  const steps = regularized ? stages.slice(1) : stages
  let completed = state.completed
  if (loan.status === 'CANCELLED') completed = events.some((event) => event.event_type === 'SUBMITTED') ? 1 : 0
  if (regularized) completed -= 1
  return { ...state, completed, regularized,
    hint: regularized ? 'Percurso registrado administrativamente; as datas informadas não representam aceites retroativos.' : state.hint,
    steps: steps.map((step, index) => ({ ...step, state: index < completed ? 'done'
      : index === completed ? state.stopped ? 'stopped' : 'current' : state.stopped ? 'skipped' : 'upcoming' })),
  }
}
