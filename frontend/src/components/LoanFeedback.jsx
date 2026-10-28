import { AppIcon } from './AppIcon'
import { loanFeedback } from '../utils/loanFeedback'

export default function LoanFeedback({ error, fallback, children, tone = 'error', readOnly = false }) {
  if (!error) return null
  const issue = loanFeedback(error, fallback, readOnly)
  return <div className="loan-feedback" data-tone={tone} role="alert" tabIndex={-1}>
    <AppIcon name="close" /><div><strong>{issue.title}</strong><p>{issue.message}</p><p className="loan-feedback__guidance">{issue.guidance}</p>{issue.technicalMessage ? <details><summary>Detalhe da validação</summary><p>{issue.technicalMessage}</p></details> : null}{children ? <div className="actions-inline">{children}</div> : null}</div>
  </div>
}
