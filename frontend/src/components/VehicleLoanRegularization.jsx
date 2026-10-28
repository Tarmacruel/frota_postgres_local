import JustificationField from './JustificationField'
import { useEffect, useRef, useState } from 'react'
import { LoanField, LoanFieldLabel, LoanFormLayout, LoanFormStep, LoanReview } from './LoanFormLayout'
import LoanFeedback from './LoanFeedback'
import LoanRecoveryLinks from './LoanRecoveryLinks'
import useLoanFormSteps from '../hooks/useLoanFormSteps'
import VehicleLoanSelect from './VehicleLoanSelect'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { loanFeedback } from '../utils/loanFeedback'
import { formatLoanDate, validLoanOdometer } from '../utils/vehicleLoans'
import useLoanVehicleIdentity from '../hooks/useLoanVehicleIdentity'

const empty = { vehicle_id: '', origin: '', recipient: '', origin_allocation_id: '', destination_allocation_id: '', started_at: '', returned_at: '', return_allocation_id: '', expected_return_at: '', delivery_odometer_km: '', return_odometer_km: '', delivery_condition: '', return_condition: '', reason: '', justification: '', document_reference: '', correct_owner: false }

const steps = ['Destino', 'Datas', 'Documento', 'Conferência']
export default function VehicleLoanRegularization({ onClose, onSaved, canView, user }) {
  const [catalog, setCatalog] = useState(null)
  const identity = useLoanVehicleIdentity(catalog?.vehicles || [], Boolean(canView?.('vehicles')), `${user?.id || ''}:${user?.role || ''}:${user?.organization_id || ''}`)
  const [form, setForm] = useState(empty)
  const [ended, setEnded] = useState(false)
  const [preview, setPreview] = useState(null)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errorReadOnly, setErrorReadOnly] = useState(true)
  const [retry, setRetry] = useState(0)
  const sending = useRef(false)
  const originAllocationEdited = useRef(false)
  async function refreshVehicleCatalog() {
    const { data } = await vehicleLoansAPI.regularizationCatalog()
    setCatalog(data)
  }
  useEffect(() => {
    let current = true
    setError('')
    vehicleLoansAPI.regularizationCatalog().then(({ data }) => { if (current) setCatalog(data) })
      .catch((err) => { if (current) setError(err) })
    return () => { current = false }
  }, [retry])
  function change(key, value) {
    setPreview(null); setReviewed(false)
    wizard.clear(key)
    if (key === 'vehicle_id') originAllocationEdited.current = false
    if (key === 'origin' || key === 'origin_allocation_id') originAllocationEdited.current = true
    setForm((previous) => {
      const next = { ...previous, [key]: value }
      if (key === 'vehicle_id') return { ...empty, vehicle_id: value, origin: catalog.vehicles.find((item) => item.id === value)?.owner_organization_id || '' }
      if (key === 'origin') Object.assign(next, { origin_allocation_id: '', return_allocation_id: '', correct_owner: false })
      if (key === 'recipient') next.destination_allocation_id = ''
      return next
    })
  }
  function payload() {
    const instant = (value) => value ? new Date(value).toISOString() : null
    return { vehicle_id: form.vehicle_id, origin_allocation_id: form.origin_allocation_id, destination_allocation_id: form.destination_allocation_id,
      started_at: instant(form.started_at), returned_at: ended ? instant(form.returned_at) : null, expected_return_at: instant(form.expected_return_at),
      return_allocation_id: ended ? form.return_allocation_id : null, delivery_odometer_km: form.delivery_odometer_km,
      return_odometer_km: ended ? form.return_odometer_km : null, delivery_condition: form.delivery_condition,
      return_condition: ended ? form.return_condition : null, reason: form.reason, justification: form.justification,
      document_reference: form.document_reference, correct_owner: form.correct_owner }
  }
  async function inspect(event) {
    event.preventDefault()
    if (sending.current) return
    if (wizard.step < 2) { go(wizard.step + 1); return }
    if (!wizard.validate(3)) { setError('Revise os campos destacados antes de conferir a prévia.'); return }
    sending.current = true; setBusy(true); setError(''); setErrorReadOnly(true); setPreview(null); setReviewed(false)
    try { const { data } = await vehicleLoansAPI.previewRegularization(payload()); setPreview(data); wizard.show(3) }
    catch (err) { setError(err) }
    finally { sending.current = false; setBusy(false) }
  }
  async function confirm() {
    if (sending.current || !preview?.can_confirm || !reviewed) return
    sending.current = true; setBusy(true); setError(''); setErrorReadOnly(false)
    try { const { data } = await vehicleLoansAPI.regularize({ ...payload(), preview_token: preview.preview_token }); onSaved(data) }
    catch (err) { setError(err); setPreview(null); setReviewed(false) }
    finally { sending.current = false; setBusy(false) }
  }
  const organizations = catalog?.organizations || []
  const allocations = (org) => (catalog?.allocations || []).filter((item) => item.organization_id === org)
  const vehicle = catalog?.vehicles.find((item) => item.id === form.vehicle_id)
  const ownerChange = vehicle && form.origin && vehicle.owner_organization_id !== form.origin
  const textIssue = (key, label, min, max = 2000) => form[key].trim().length < min || form[key].length > max ? [[key, `${label}: informe de ${min} a ${max} caracteres.`]] : []
  const selectIssue = (key, options, label) => !options.some((item) => item.id === form[key]) ? [[key, `Selecione ${label} na lista de resultados.`]] : []
  const numberIssue = (key) => !validLoanOdometer(form[key]) ? [[key, 'Informe o odômetro igual ou maior que zero, com até uma casa decimal.']] : []
  const dateIssue = (key) => !form[key] || !Number.isFinite(new Date(form[key]).getTime()) ? [[key, 'Informe uma data e hora válidas.']] : []
  const validation = [
    [...selectIssue('vehicle_id', catalog?.vehicles || [], 'o veículo'), ...selectIssue('origin', organizations, 'a secretaria de origem'),
      ...selectIssue('origin_allocation_id', allocations(form.origin), 'a lotação de origem'), ...selectIssue('recipient', organizations.filter((item) => item.id !== form.origin), 'a secretaria recebedora'),
      ...selectIssue('destination_allocation_id', allocations(form.recipient), 'a lotação de destino')],
    [...dateIssue('started_at'), ...numberIssue('delivery_odometer_km'), ...textIssue('delivery_condition', 'Condições de entrega', 3),
      ...(form.expected_return_at ? dateIssue('expected_return_at') : []), ...(ended ? [...dateIssue('returned_at'), ...numberIssue('return_odometer_km'), ...textIssue('return_condition', 'Condições de devolução', 3), ...selectIssue('return_allocation_id', allocations(form.origin), 'a lotação de retorno')] : [])],
    [...textIssue('reason', 'Motivo', 8), ...textIssue('document_reference', 'Referência documental', 8, 1000), ...textIssue('justification', 'Justificativa', 15, 1000)], [],
  ]
  const wizard = useLoanFormSteps(validation)
  const selectedIdentity = identity.vehicles.find((item) => item.id === form.vehicle_id)
  const suggestedOriginAllocation = allocations(form.origin).find((item) => item.id === selectedIdentity?.current_location?.allocation_id)
  const suggestedOriginAllocationId = suggestedOriginAllocation?.id
  const clearField = wizard.clear
  useEffect(() => {
    if (!suggestedOriginAllocationId || form.origin_allocation_id || originAllocationEdited.current) return
    setForm((current) => current.vehicle_id === form.vehicle_id && current.origin === form.origin && !current.origin_allocation_id
      ? { ...current, origin_allocation_id: suggestedOriginAllocationId } : current)
    clearField('origin_allocation_id')
  }, [suggestedOriginAllocationId, form.vehicle_id, form.origin, form.origin_allocation_id, clearField])
  function go(next) { if (!wizard.go(next)) setError('Revise os campos destacados para continuar.'); else setError('') }
  const originAllocationHint = form.vehicle_id ? form.origin_allocation_id === suggestedOriginAllocationId
    ? 'Sugerida pelo cadastro atual do veículo. Confira a lotação da época do empréstimo.'
    : identity.status === 'loading' ? 'Consultando a lotação cadastrada do veículo…'
      : 'Selecione a lotação de origem usada na época do empréstimo.' : undefined
  const select = (key, label, options) => <VehicleLoanSelect label={label} required options={options} value={form[key]} onOpen={key === 'vehicle_id' ? refreshVehicleCatalog : undefined}
    hint={key === 'origin_allocation_id' ? originAllocationHint : key === 'vehicle_id' && identity.status === 'loading' ? 'Carregando dados de identificação…' : key === 'vehicle_id' && identity.status === 'error' ? 'Os dados adicionais não puderam ser consultados. A lista mantém os dados disponíveis do empréstimo.' : undefined}
    searchPlaceholder={key === 'vehicle_id' ? 'Buscar por placa, marca ou modelo' : 'Digite para filtrar'}
    field={key} error={wizard.errors[key]} disabled={!catalog || busy || !options.length} onChange={(value) => change(key, value)} />
  const input = (key, label, type = 'text', required = true) => <LoanField name={key} label={label} error={wizard.errors[key]}><input className="app-input" type={type} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.1' : undefined} value={form[key]} onChange={(event) => change(key, event.target.value)} /></LoanField>
  const area = (key, label, minLength = 8, maxLength = 2000) => <LoanField wide name={key} label={label} error={wizard.errors[key]}><textarea className="app-input" rows={3} required minLength={minLength} maxLength={maxLength} value={form[key]} onChange={(event) => change(key, event.target.value)} /></LoanField>
  const complete = validation.map((issues, index) => index === 3 ? Boolean(preview?.can_confirm && reviewed) : !issues.length)
  const recoveryStep = (message) => ({ destination: 0, delivery: 1, period: 1, operations: 1, review: 2 }[loanFeedback(message).target] ?? 2)
  const firstInvalidField = Object.entries(wizard.errors).find(([, message]) => message)?.[0]
  const invalidStep = validation.findIndex((issues) => issues.some(([field]) => field === firstInvalidField))
  return <LoanFormLayout title="Regularizar empréstimo anterior" steps={steps} step={wizard.step} complete={complete} onStep={go}
    onClose={onClose} busy={busy} onSubmit={inspect} formRef={wizard.formRef}
    footer={<><span>{wizard.step === 3 ? preview?.can_confirm ? 'Confira os efeitos para liberar a confirmação.' : 'A prévia precisa estar sem impedimentos.' : `Etapa ${wizard.step + 1} de 4 · nada foi registrado`}</span><div>
      {wizard.step > 0 ? <button type="button" className="ghost-button" disabled={busy} onClick={() => go(wizard.step - 1)}>Voltar</button> : null}
      {wizard.step === 3 && preview ? <button type="button" className="app-button" disabled={!preview.can_confirm || !reviewed || busy} onClick={confirm}>{busy ? 'Processando…' : 'Confirmar regularização'}</button>
        : <button className="app-button" disabled={!catalog || busy}>{busy ? 'Processando…' : wizard.step < 2 ? 'Continuar' : 'Conferir prévia da regularização'}</button>}
    </div></>}>
    <LoanFeedback error={error} readOnly={errorReadOnly}><button type="button" className="ghost-button" disabled={busy} onClick={() => wizard.show(invalidStep >= 0 ? invalidStep : recoveryStep(error))}>Rever preenchimento</button></LoanFeedback>
    {!catalog ? <div className="loan-editor__hint"><p role="status">{error ? 'As opções ainda não foram carregadas.' : 'Carregando veículos, secretarias e lotações…'}</p><button type="button" className="ghost-button" onClick={() => setRetry((value) => value + 1)}>Recarregar opções</button></div> : null}
    <fieldset disabled={!catalog || busy}>
      <LoanFormStep title="Qual situação precisa ser registrada?" description="Registro administrativo de um empréstimo já ocorrido. Assinaturas e aceites do passado não serão criados." hidden={wizard.step !== 0}>
        <div className="loan-editor__grid">
          <div className="loan-editor__wide">{select('vehicle_id', 'Veículo', identity.vehicles)}</div>
          {select('origin', 'Secretaria de origem', organizations)}
          {select('origin_allocation_id', 'Lotação de origem no início do empréstimo', allocations(form.origin))}
          {ownerChange ? <label className="loan-notice loan-editor__wide"><input type="checkbox" checked={form.correct_owner} onChange={(event) => change('correct_owner', event.target.checked)} /> Confirmo a correção da secretaria proprietária para a origem informada, conforme a referência documental.</label> : null}
          {select('recipient', 'Secretaria recebedora', organizations.filter((item) => item.id !== form.origin))}
          {select('destination_allocation_id', 'Lotação de destino', allocations(form.recipient))}
        </div>
        {form.recipient && !allocations(form.recipient).length ? <p className="loan-editor__hint">Nenhuma lotação encontrada para a recebedora. Confira o cadastro com a gestão antes de continuar.</p> : null}
      </LoanFormStep>
      <LoanFormStep title="Quando o empréstimo aconteceu?" description="Use datas e horários efetivos. O prazo previsto não substitui a data de devolução." hidden={wizard.step !== 1}>
        <div className="loan-editor__grid">{input('started_at', 'Entrega efetiva (data e hora local)', 'datetime-local')}{input('delivery_odometer_km', 'Odômetro de entrega (km)', 'number')}
          {area('delivery_condition', 'Condições de entrega', 3)}{input('expected_return_at', 'Previsão de devolução (opcional)', 'datetime-local', false)}
          <div className="loan-editor__wide loan-editor__choice"><label><input type="checkbox" checked={ended} onChange={(event) => { setEnded(event.target.checked); setPreview(null); setReviewed(false) }} /> Este empréstimo já foi devolvido</label><small>Marque somente quando houver uma devolução efetiva a registrar.</small></div>
          {ended ? <>{input('returned_at', 'Devolução efetiva (data e hora local)', 'datetime-local')}{select('return_allocation_id', 'Lotação de retorno', allocations(form.origin))}{input('return_odometer_km', 'Odômetro de devolução (km)', 'number')}{area('return_condition', 'Condições de devolução', 3)}</> : null}
        </div>
      </LoanFormStep>
      <LoanFormStep title="Em qual documento o registro se baseia?" description="Identifique o motivo e a referência que permitem conferir a situação anterior." hidden={wizard.step !== 2}>
        <div className="loan-editor__grid">{area('reason', 'Motivo do empréstimo')}{area('document_reference', 'Referência documental (processo, protocolo ou termo existente)', 8, 1000)}
          <div className="loan-field loan-editor__wide" data-loan-field="justification" data-invalid={Boolean(wizard.errors.justification)}>
            <JustificationField label={<LoanFieldLabel label="Justificativa da regularização administrativa" required />} aria-label="Justificativa da regularização administrativa" aria-invalid={Boolean(wizard.errors.justification)} context="loan_regularization" className="app-input" required minLength={15} maxLength={1000} rows={3} value={form.justification} onChange={(event) => change('justification', event.target.value)} />
            {wizard.errors.justification ? <small className="loan-editor__field-error">{wizard.errors.justification}</small> : <small>Explique com pelo menos 15 caracteres por que o registro está sendo feito agora.</small>}
          </div>
        </div>
      </LoanFormStep>
      <LoanFormStep title="Confira os efeitos antes de registrar" description="A prévia verifica os registros do período. Alterar um campo exige uma nova conferência." hidden={wizard.step !== 3}>
        {preview ? <section aria-label="Prévia da regularização">
          <LoanReview rows={[
            ['Veículo', preview.vehicle_plate], ['Origem', preview.origin_name], ['Recebedora', preview.recipient_name], ['Situação', preview.status === 'RETURNED' ? 'Devolvido' : 'Em andamento'],
            ['Entrega efetiva', formatLoanDate(form.started_at)], ['Devolução efetiva', ended ? formatLoanDate(form.returned_at) : 'Ainda não devolvido'], ['Referência documental', form.document_reference],
          ]} />
          <p className="loan-editor__hint">{preview.location_change ? 'Lotação atual será alterada hoje.' : 'Lotação atual será preservada.'}{preview.owner_change ? ' A secretaria proprietária será corrigida.' : ''}</p>
          {preview.blockers.length ? <div className="loan-editor__blockers" role="alert"><h5>O que precisa ser corrigido</h5><ul>{preview.blockers.map((item) => <li key={item}><strong>{item}</strong><p>{loanFeedback(item).guidance}</p><button type="button" className="ghost-button" onClick={() => wizard.show(recoveryStep(item))}>Rever {steps[recoveryStep(item)].toLowerCase()}</button><LoanRecoveryLinks target={loanFeedback(item).target} vehicleId={form.vehicle_id} canView={canView} /></li>)}</ul></div> : null}
          {preview.warnings.length ? <details className="loan-editor__warnings"><summary>Observações da conferência ({preview.warnings.length})</summary><ul>{preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
          <details className="loan-editor__warnings"><summary>Registros encontrados no período</summary><div className="loan-table-wrap"><table className="loan-table"><thead><tr><th>Registros no período</th><th>Total</th><th>Sem responsável</th><th>Outra responsável</th></tr></thead><tbody>{preview.impact.map((item) => <tr key={item.module}><td>{item.module}</td><td>{item.records}</td><td>{item.without_responsibility}</td><td>{item.other_responsibility}</td></tr>)}</tbody></table></div></details>
          {preview.can_confirm ? <label className="loan-editor__review-check"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} /><span><LoanFieldLabel label="Conferi as datas, a referência e os efeitos. Os registros antigos permanecerão com seus vínculos atuais." required /></span></label> : null}
        </section> : <p className="loan-editor__hint">A prévia ainda não está disponível. Clique em Conferir prévia da regularização para verificar os efeitos, sem registrar o empréstimo.</p>}
      </LoanFormStep>
    </fieldset>
  </LoanFormLayout>
}
