import JustificationField from './JustificationField'
import { useRef, useState } from 'react'
import { LoanField, LoanFormLayout, LoanFormStep } from './LoanFormLayout'
import LoanFeedback from './LoanFeedback'
import LoanRecoveryLinks from './LoanRecoveryLinks'
import useLoanFormSteps from '../hooks/useLoanFormSteps'
import VehicleLoanSelect from './VehicleLoanSelect'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { loanFeedback } from '../utils/loanFeedback'
import { blockedLoanAction, loanActions, validLoanOdometer } from '../utils/vehicleLoans'

function Reason({ value, onChange, required, context, userId, error }) {
  return <div className="loan-field loan-editor__wide" data-loan-field="justification" data-invalid={Boolean(error)}>
    <JustificationField label={`Justificativa ${required ? '(obrigatória)' : '(opcional)'}`} context={context} userId={userId} className="app-input" value={value} onChange={(e) => onChange(e.target.value)} required={required} minLength={8} maxLength={1000} rows={3} />
    {error ? <small className="loan-editor__field-error">{error}</small> : null}
  </div>
}

export { default as LoanProposalForm } from './LoanProposalForm'

export function LoanActionForm({ operation, loan, context, catalog, user, onClose, onSaved, onRefresh, onEdit, canView }) {
  const action = loanActions[operation]
  const [justification, setJustification] = useState('')
  const [allocation, setAllocation] = useState(loan.origin_allocation_id || '')
  const [odometer, setOdometer] = useState(context?.minimum_odometer_km ?? '')
  const [condition, setCondition] = useState('')
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)
  const blocked = blockedLoanAction(user, loan, action, context)
  const returnRequest = operation === 'request-return'
  const represented = loan[`${action.side}_organization_name`]
  const requiredReason = user.role === 'ADMIN' || action.reason
  const validation = [
    ...(returnRequest && !catalog.allocations.some((item) => item.id === allocation && item.organization_id === loan.origin_organization_id) ? [['return_allocation_id', 'Selecione uma lotação de retorno na lista de resultados.']] : []),
    ...(returnRequest && !validLoanOdometer(odometer, context?.minimum_odometer_km ?? 0) ? [['return_odometer_km', `A referência mínima é ${context?.minimum_odometer_km ?? 0} km; use até uma casa decimal.`]] : []),
    ...(returnRequest && (condition.trim().length < 3 || condition.length > 2000) ? [['return_condition', 'Descreva as condições de devolução com 3 a 2000 caracteres.']] : []),
    ...((requiredReason || justification) && (justification.trim().length < 8 || justification.length > 1000) ? [['justification', 'Explique a ação com 8 a 1000 caracteres.']] : []),
  ]
  const wizard = useLoanFormSteps([validation])
  async function confirm(event) {
    event.preventDefault()
    if (sending.current || stale || blocked) return
    if (!wizard.validate()) { setError('Revise os campos destacados antes de confirmar.'); return }
    sending.current = true; setBusy(true); setError('')
    try {
      const { data } = await vehicleLoansAPI.act(loan.id, operation, {
        expected_version: loan.version, acting_organization_id: loan[`${action.side}_organization_id`],
        ...(justification.trim() ? { justification: justification.trim() } : {}),
        ...(returnRequest ? { return_allocation_id: allocation, return_odometer_km: odometer, return_condition: condition.trim() } : {}),
      })
      onSaved(data)
    } catch (err) {
      setError(err)
      if (err.response?.status === 409) setStale(true)
    } finally { sending.current = false; setBusy(false) }
  }
  return <LoanFormLayout title={action.label} steps={['Dados da ação']} step={0} complete={[!validation.length && !blocked && !stale]} onStep={() => {}}
    onSubmit={confirm} busy={busy} onClose={onClose} formRef={wizard.formRef}
    footer={<><span>{blocked ? 'Resolva o impedimento antes de confirmar.' : 'A alteração só ocorre ao confirmar.'}</span><div><button type="button" className="ghost-button" disabled={busy} onClick={onClose}>Voltar aos detalhes</button>
      {stale ? <button type="button" className="ghost-button" onClick={onRefresh}>Recarregar dados e revisar</button> : null}
      <button className="app-button" disabled={busy || stale || Boolean(blocked)}>{busy ? 'Processando…' : action.label}</button></div></>}>
    <LoanFeedback error={blocked} tone="warning"><LoanRecoveryLinks target={loanFeedback(blocked).target} vehicleId={loan.vehicle_id} canView={canView} />{['refresh', 'operations'].includes(loanFeedback(blocked).target) ? <button type="button" className="ghost-button" onClick={onRefresh}>Atualizar conferência</button> : null}</LoanFeedback>
    <LoanFeedback error={error}><LoanRecoveryLinks target={loanFeedback(error).target} vehicleId={loan.vehicle_id} canView={canView} />{onEdit && loanFeedback(error).target === 'delivery' ? <button type="button" className="ghost-button" onClick={onEdit}>Editar dados de entrega</button> : null}</LoanFeedback>
    {error && !onEdit && !returnRequest && loanFeedback(error).target === 'delivery' ? <p className="loan-editor__hint">Os dados de entrega são informados pela secretaria de origem. Volte aos detalhes e peça à origem para conferir a proposta.</p> : null}
    {stale ? <p className="loan-editor__hint">Os dados desta tentativa foram mantidos. Recarregar fecha este formulário para consultar a situação atual antes de uma nova tentativa.</p> : null}
    <LoanFormStep title={`${loan.vehicle_plate} · ${action.label}`} description={`Secretaria representada: ${represented}`}>
      <p className="loan-editor__route">{loan.origin_organization_name}<span aria-hidden="true"> → </span>{loan.recipient_organization_name}</p>
      {operation === 'accept' ? <p className="loan-editor__hint">Ao confirmar, o veículo passa a ser operado pela recebedora e permanece pertencendo à origem.</p> : null}
      {operation === 'accept-return' ? <p className="loan-editor__hint">Ao confirmar, a responsabilidade operacional volta à origem. O histórico do empréstimo será preservado.</p> : null}
      {action.reason ? <p className="loan-editor__hint">A justificativa ficará registrada no histórico desta ação.</p> : null}
      <fieldset className="loan-editor__grid" disabled={busy || stale || Boolean(blocked)}>
        {returnRequest ? <>
          <div className="loan-editor__wide"><VehicleLoanSelect label="Lotação de retorno" value={allocation} onChange={(value) => { setAllocation(value); wizard.clear('return_allocation_id') }} field="return_allocation_id" error={wizard.errors.return_allocation_id}
            options={catalog.allocations.filter((item) => item.organization_id === loan.origin_organization_id)} disabled={busy || stale || Boolean(blocked)} placeholder="Selecione a lotação de retorno" searchPlaceholder="Buscar lotação de retorno" /></div>
          <LoanField name="return_odometer_km" label="Odômetro de devolução (km)" error={wizard.errors.return_odometer_km} hint={`Referência mínima: ${context?.minimum_odometer_km ?? '—'} km. Confira o valor no veículo.`}><input className="app-input" type="number" required min={context?.minimum_odometer_km ?? 0} step="0.1" value={odometer} onChange={(e) => { setOdometer(e.target.value); wizard.clear('return_odometer_km') }} /></LoanField>
          <LoanField wide name="return_condition" label="Condições de devolução" error={wizard.errors.return_condition}><textarea className="app-input" required minLength={3} maxLength={2000} value={condition} rows={3} onChange={(e) => { setCondition(e.target.value); wizard.clear('return_condition') }} /></LoanField>
        </> : null}
        <Reason context={`loan_${operation}`} userId={user.id} required={requiredReason} value={justification} onChange={(value) => { setJustification(value); wizard.clear('justification') }} error={wizard.errors.justification} />
      </fieldset>
    </LoanFormStep>
  </LoanFormLayout>
}
