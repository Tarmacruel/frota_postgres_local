import { CustomFormFields } from './ConfiguredFormFields'
import { useEffect, useRef, useState } from 'react'
import VehicleLoanSelect from './VehicleLoanSelect'
import JustificationField from './JustificationField'
import LoanFeedback from './LoanFeedback'
import { LoanField, LoanFieldLabel, LoanFormLayout, LoanFormStep, LoanReview } from './LoanFormLayout'
import useLoanFormSteps from '../hooks/useLoanFormSteps'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { toDateTimeLocalValue } from '../utils/datetime'
import { loanFeedback } from '../utils/loanFeedback'
import { formatLoanDate, validLoanOdometer } from '../utils/vehicleLoans'
import useLoanVehicleIdentity from '../hooks/useLoanVehicleIdentity'
import useLoanOdometerSuggestion from '../hooks/useLoanOdometerSuggestion'

const steps = ['Destino', 'Entrega', 'Conferência']
const validNumber = (value) => value === '' || validLoanOdometer(value)

export default function LoanProposalForm({ loan, catalog, user, onClose, onSaved, onRefresh, onVehicleOptionsOpen, canView }) {
  const [form, setForm] = useState({ vehicle_id: loan?.vehicle_id || '', destination_allocation_id: loan?.destination_allocation_id || '',
    recipient: loan?.recipient_organization_id || '', reason: loan?.reason || '', delivery_odometer_km: loan?.delivery_odometer_km ?? '',
    delivery_condition: loan?.delivery_condition || '', expected_return_at: toDateTimeLocalValue(loan?.expected_return_at), justification: '' })
  const [indefinite, setIndefinite] = useState(!loan?.expected_return_at)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [stale, setStale] = useState(false)
  const sending = useRef(false)
  const odometerEdited = useRef(Boolean(loan))
  const scopeKey = `${user.id}:${user.role}:${user.organization_id || ''}`
  const identity = useLoanVehicleIdentity(catalog.vehicles, Boolean(canView?.('vehicles')), scopeKey)
  const odometer = useLoanOdometerSuggestion(form.vehicle_id, !loan && Boolean(canView?.('possession')), scopeKey)
  useEffect(() => {
    if (loan || odometer.status !== 'ready' || !odometer.data || odometerEdited.current) return
    setForm((current) => current.vehicle_id === odometer.vehicleId ? { ...current, delivery_odometer_km: odometer.data.odometer_km } : current)
  }, [loan, odometer.status, odometer.data, odometer.vehicleId])
  const vehicle = catalog.vehicles.find((item) => item.id === form.vehicle_id)
  const owner = loan?.origin_organization_id || vehicle?.owner_organization_id
  const ownerName = catalog.organizations.find((item) => item.id === owner)?.name || loan?.origin_organization_name
  const recipientName = catalog.organizations.find((item) => item.id === form.recipient)?.name
  const destination = catalog.allocations.find((item) => item.id === form.destination_allocation_id && item.organization_id === form.recipient)
  const admin = user.role === 'SUPERUSER'
  const validation = [
    [...(!form.vehicle_id || !owner ? [['vehicle_id', 'Selecione um veículo com secretaria de origem identificada.']] : []),
      ...(!form.recipient ? [['recipient', 'Selecione a secretaria recebedora na lista de resultados.']] : !destination ? [['destination_allocation_id', 'Selecione a secretaria recebedora e uma lotação de destino na lista de resultados.']] : [])],
    [...(form.reason.trim().length < 8 || form.reason.length > 2000 ? [['reason', 'Descreva o motivo com 8 a 2000 caracteres.']] : []),
      ...(!indefinite && (!form.expected_return_at || !Number.isFinite(new Date(form.expected_return_at).getTime())) ? [['expected_return_at', 'Informe uma previsão de devolução válida ou escolha prazo indeterminado.']] : []),
      ...(!validNumber(form.delivery_odometer_km) ? [['delivery_odometer_km', 'Informe um odômetro igual ou maior que zero, com até uma casa decimal.']] : []),
      ...(form.delivery_condition && (form.delivery_condition.trim().length < 3 || form.delivery_condition.length > 2000) ? [['delivery_condition', 'Descreva as condições com 3 a 2000 caracteres ou complete antes de enviar.']] : [])],
    admin && (form.justification.trim().length < 8 || form.justification.length > 1000) ? [['justification', 'Justifique a representação da secretaria com 8 a 1000 caracteres.']] : [],
  ]
  const wizard = useLoanFormSteps(validation)
  function change(key, value) { wizard.clear(key); setForm((previous) => ({ ...previous, [key]: value, ...(key === 'recipient' ? { destination_allocation_id: '' } : {}) })) }
  function go(next) { if (!wizard.go(next)) setError('Revise os campos destacados para continuar.'); else setError(null) }
  async function save(event) {
    event.preventDefault()
    if (sending.current || stale) return
    if (wizard.step < 2) { go(wizard.step + 1); return }
    if (!wizard.validate()) { setError('Revise os campos destacados antes de salvar o rascunho.'); return }
    sending.current = true; setBusy(true); setError(null)
    try {
      const body = { acting_organization_id: owner, destination_allocation_id: form.destination_allocation_id,
        reason: form.reason.trim(), delivery_condition: form.delivery_condition.trim() || null,
        delivery_odometer_km: form.delivery_odometer_km === '' ? null : form.delivery_odometer_km,
        expected_return_at: indefinite ? null : new Date(form.expected_return_at).toISOString(),
        ...(form.justification.trim() ? { justification: form.justification.trim() } : {}) }
      const response = loan ? await vehicleLoansAPI.update(loan.id, { ...body, expected_version: loan.version })
        : await vehicleLoansAPI.create({ ...body, vehicle_id: form.vehicle_id })
      onSaved(response.data)
    } catch (err) { setError(err); if (err.response?.status === 409) setStale(true) }
    finally { sending.current = false; setBusy(false) }
  }
  const complete = validation.map((issues, index) => !issues.length && (index !== 2 || wizard.visited.includes(2)))
  const firstInvalidField = Object.entries(wizard.errors).find(([, message]) => message)?.[0]
  const invalidStep = validation.findIndex((issues) => issues.some(([field]) => field === firstInvalidField))
  const issueStep = invalidStep >= 0 ? invalidStep : ({ destination: 0, delivery: 1, period: 1, review: 2 }[loanFeedback(error || '').target] ?? wizard.step)
  const select = (field, props) => <VehicleLoanSelect {...props} required field={field} value={form[field]} error={wizard.errors[field]}
    disabled={busy || stale || props.disabled} onChange={(value) => change(field, value)} />
  return <LoanFormLayout title={loan ? 'Editar proposta de empréstimo' : 'Novo empréstimo entre secretarias'} steps={steps} step={wizard.step}
    complete={complete} onStep={go} onSubmit={save} busy={busy} onClose={onClose} formRef={wizard.formRef}
    footer={<><span>{wizard.step === 2 ? 'Salvar cria um rascunho. O envio é uma ação separada.' : `Etapa ${wizard.step + 1} de 3`}</span><div>
      {wizard.step > 0 ? <button type="button" className="ghost-button" disabled={busy} onClick={() => go(wizard.step - 1)}>Voltar</button> : null}
      {stale ? <button type="button" className="ghost-button" onClick={onRefresh}>Recarregar dados e revisar</button> : null}<button className="app-button" disabled={busy || stale}>{busy ? 'Salvando…' : wizard.step === 2 ? 'Salvar rascunho' : 'Continuar'}</button>
    </div></>}>
    <LoanFeedback error={error}>{!stale ? <button type="button" className="ghost-button" onClick={() => wizard.show(issueStep)}>Rever {steps[issueStep].toLowerCase()}</button> : null}</LoanFeedback>
    {stale ? <p className="loan-editor__hint">Recarregar fecha esta edição para consultar a versão atual. Os dados desta tentativa ainda não foram salvos.</p> : null}
    <fieldset disabled={busy || stale}>
      <LoanFormStep title="Quem vai receber o veículo?" description="Escolha o veículo e o destino. A origem é identificada pelo cadastro." hidden={wizard.step !== 0}>
        <div className="loan-editor__grid">
          <div className="loan-editor__wide">{loan ? <p className="loan-editor__identity"><span>Veículo</span><strong>{loan.vehicle_plate}</strong></p> : <VehicleLoanSelect field="vehicle_id" label="Veículo" required onOpen={onVehicleOptionsOpen}
            options={identity.vehicles} value={form.vehicle_id} disabled={busy || stale} error={wizard.errors.vehicle_id}
            hint={identity.status === 'loading' ? 'Carregando dados de identificação…' : identity.status === 'error' ? 'Os dados adicionais não puderam ser consultados. A lista mantém os dados disponíveis do empréstimo.' : undefined}
            placeholder="Selecione um veículo da origem" searchPlaceholder="Buscar por placa, marca ou modelo"
            onChange={(value) => { odometerEdited.current = false; wizard.clear('vehicle_id'); setForm((previous) => ({ ...previous, vehicle_id: value, recipient: '', destination_allocation_id: '', delivery_odometer_km: '', delivery_condition: '' })) }} />}</div>
          <p className="loan-editor__identity loan-editor__wide"><span>Secretaria de origem</span><strong>{ownerName || 'Identificada ao selecionar o veículo'}</strong></p>
          {select('recipient', { label: 'Secretaria recebedora', options: catalog.organizations.filter((item) => item.id !== owner), disabled: !owner,
            placeholder: 'Selecione a recebedora', searchPlaceholder: 'Buscar secretaria', onChange: undefined })}
          {select('destination_allocation_id', { label: 'Lotação de destino', options: catalog.allocations.filter((item) => item.organization_id === form.recipient), disabled: !form.recipient,
            placeholder: 'Selecione a lotação de destino', searchPlaceholder: 'Buscar lotação de destino' })}
        </div>
        {form.recipient && !catalog.allocations.some((item) => item.organization_id === form.recipient) ? <p className="loan-editor__hint">Esta secretaria não tem lotação disponível. Confira o cadastro de lotações com a gestão ou escolha outra recebedora que corresponda ao destino real.</p> : null}
        {!loan && !catalog.vehicles.length ? <LoanFeedback tone="warning" error="Nenhum veículo disponível para proposta. Confira a origem, a lotação atual e os empréstimos em andamento." /> : null}
      </LoanFormStep>
      <LoanFormStep title="Por que e em quais condições?" description="Informe o motivo. Odômetro e condições podem ser completados no rascunho antes do envio." hidden={wizard.step !== 1}>
        <div className="loan-editor__grid">
          <LoanField wide name="reason" label="Motivo do empréstimo" error={wizard.errors.reason}><textarea className="app-input" required minLength={8} maxLength={2000} rows={3} value={form.reason} onChange={(e) => change('reason', e.target.value)} /></LoanField>
          <div className="loan-editor__wide loan-editor__choice"><label><input type="checkbox" checked={indefinite} onChange={(e) => setIndefinite(e.target.checked)} /> Prazo indeterminado</label><small>A previsão não devolve o veículo automaticamente.</small></div>
          {!indefinite ? <LoanField name="expected_return_at" label="Previsão de devolução" error={wizard.errors.expected_return_at}><input className="app-input" type="datetime-local" required value={form.expected_return_at} onChange={(e) => change('expected_return_at', e.target.value)} /></LoanField> : null}
          <div><LoanField name="delivery_odometer_km" label="Odômetro de entrega (km)" hint="Opcional no rascunho; obrigatório para enviar." error={wizard.errors.delivery_odometer_km}><input className="app-input" type="number" min="0" step="0.1" value={form.delivery_odometer_km} onChange={(e) => { odometerEdited.current = true; change('delivery_odometer_km', e.target.value) }} /></LoanField>
            {!loan && form.vehicle_id ? <div className="loan-editor__lookup" role="status">
              {odometer.status === 'loading' ? 'Consultando o último encerramento…' : odometer.status === 'error' ? <>Não foi possível consultar a última leitura. Informe a leitura do veículo ou <button type="button" onClick={odometer.refresh}>consultar novamente</button>.</>
                : odometer.status === 'ready' && odometer.data ? <>Último encerramento: <strong>{odometer.data.odometer_km} km</strong> em {formatLoanDate(odometer.data.end_date)}. Confira a leitura no veículo.{Number(form.delivery_odometer_km) !== Number(odometer.data.odometer_km) || form.delivery_odometer_km === '' ? <button type="button" onClick={() => { odometerEdited.current = false; change('delivery_odometer_km', odometer.data.odometer_km) }}>Usar última leitura</button> : null}</>
                  : odometer.status === 'ready' ? 'Nenhum encerramento com odômetro foi encontrado. Informe a leitura conferida no veículo.' : 'Informe a leitura do veículo. A consulta automática exige acesso ao histórico de posses.'}
            </div> : null}
          </div>
          <LoanField wide name="delivery_condition" label="Condições de entrega" hint="Descreva as condições do veículo. Obrigatório para enviar." error={wizard.errors.delivery_condition}><textarea className="app-input" minLength={3} maxLength={2000} rows={3} value={form.delivery_condition} onChange={(e) => change('delivery_condition', e.target.value)} /></LoanField>
        </div>
      </LoanFormStep>
      <LoanFormStep title="Confira o rascunho" description="A responsabilidade muda somente após o aceite da recebedora." hidden={wizard.step !== 2}>
        <LoanReview rows={[
          ['Veículo', loan?.vehicle_plate || vehicle?.plate], ['Origem', ownerName], ['Recebedora', recipientName], ['Destino', destination?.name],
          ['Motivo', form.reason], ['Prazo', indefinite ? 'Indeterminado' : formatLoanDate(form.expected_return_at)],
          ['Odômetro de entrega', form.delivery_odometer_km === '' ? 'Completar antes do envio' : `${form.delivery_odometer_km} km`],
          ['Condições de entrega', form.delivery_condition || 'Completar antes do envio'],
        ]} />
        {loan?.status === 'AWAITING_RECEIPT' ? <p className="loan-notice">Editar esta proposta retorna o empréstimo ao rascunho. Será necessário enviar novamente.</p> : null}
        {admin ? <div className="loan-field" data-loan-field="justification" data-invalid={Boolean(wizard.errors.justification)}>
          <p className="loan-editor__hint">Você representa <strong>{ownerName || 'a secretaria de origem'}</strong> nesta ação.</p>
          <JustificationField label={<LoanFieldLabel label="Justificativa (obrigatória)" required />} aria-label="Justificativa (obrigatória)" aria-invalid={Boolean(wizard.errors.justification)} context={loan ? 'loan_proposal' : 'loan_create'} userId={user.id} className="app-input" required minLength={8} maxLength={1000} rows={3} value={form.justification} onChange={(e) => change('justification', e.target.value)} />
          {wizard.errors.justification ? <small className="loan-editor__field-error">{wizard.errors.justification}</small> : null}
        </div> : null}
      <CustomFormFields module="vehicle_loans" recordId={loan?.id} /></LoanFormStep>
    </fieldset>
  </LoanFormLayout>
}
