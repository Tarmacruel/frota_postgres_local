export const loanStatuses = {
  DRAFT: 'Rascunho', AWAITING_RECEIPT: 'Aguardando recebimento', ACTIVE: 'Em andamento',
  AWAITING_RETURN_RECEIPT: 'Aguardando devolução', RETURNED: 'Devolvido', REJECTED: 'Rejeitado', CANCELLED: 'Cancelado',
}
export const loanActions = {
  submit: { label: 'Enviar para recebimento', side: 'origin', statuses: ['DRAFT'], handoff: true },
  accept: { label: 'Confirmar recebimento', side: 'recipient', statuses: ['AWAITING_RECEIPT'], handoff: true, distinct: 'submitted_by_user_id' },
  reject: { label: 'Rejeitar proposta', side: 'recipient', statuses: ['AWAITING_RECEIPT'], reason: true },
  cancel: { label: 'Cancelar proposta', side: 'origin', statuses: ['DRAFT', 'AWAITING_RECEIPT'], reason: true },
  'request-return': { label: 'Solicitar devolução', side: 'recipient', statuses: ['ACTIVE'], handoff: true },
  'accept-return': { label: 'Confirmar devolução', side: 'origin', statuses: ['AWAITING_RETURN_RECEIPT'], handoff: true, distinct: 'return_submitted_by_user_id' },
  'reject-return': { label: 'Rejeitar devolução', side: 'origin', statuses: ['AWAITING_RETURN_RECEIPT'], reason: true },
  'cancel-return': { label: 'Retirar solicitação de devolução', side: 'recipient', statuses: ['AWAITING_RETURN_RECEIPT'], reason: true },
}
export const loanEventLabels = {
  REGULARIZED: 'Regularização administrativa',
  CREATED: 'Rascunho criado', RECTIFIED: 'Proposta retificada', SUBMITTED: 'Proposta enviada',
  RECEIPT_ACCEPTED: 'Recebimento confirmado', REJECTED: 'Proposta rejeitada', CANCELLED: 'Proposta cancelada',
  RETURN_SUBMITTED: 'Devolução solicitada', RETURN_ACCEPTED: 'Devolução confirmada',
  RETURN_REJECTED: 'Devolução rejeitada', RETURN_CANCELLED: 'Solicitação de devolução retirada',
}
export function canRepresent(user, loan, side) {
  return user?.role === 'ADMIN' || (user?.role === 'PRODUCAO' && Boolean(user.organization_id) && user.organization_id === loan[`${side}_organization_id`])
}
export function availableLoanActions(user, loan) {
  return Object.entries(loanActions).filter(([, action]) => action.statuses.includes(loan.status) && canRepresent(user, loan, action.side))
}
export function blockedLoanAction(user, loan, action, context) {
  if (action.distinct && loan[action.distinct] === user?.id) return 'Outro usuário deve confirmar este recebimento.'
  if (action.handoff && !context) return 'Atualize as pendências antes de continuar.'
  if (action.handoff && Object.values(context?.blockers || {}).some(Number)) return 'Resolva as pendências abertas antes de continuar.'
  if (action.handoff && context.version !== loan.version) return 'O empréstimo mudou. Atualize os dados antes de continuar.'
  return ''
}
export function formatLoanDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—'
}
