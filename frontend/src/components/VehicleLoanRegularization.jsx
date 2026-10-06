import JustificationField from './JustificationField'
import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import VehicleLoanSelect from './VehicleLoanSelect'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { getApiErrorMessage } from '../utils/apiError'

const empty = { vehicle_id: '', origin: '', recipient: '', origin_allocation_id: '', destination_allocation_id: '', started_at: '', returned_at: '', return_allocation_id: '', expected_return_at: '', delivery_odometer_km: '', return_odometer_km: '', delivery_condition: '', return_condition: '', reason: '', justification: '', document_reference: '', correct_owner: false }

export default function VehicleLoanRegularization({ onClose, onSaved }) {
  const [catalog, setCatalog] = useState(null)
  const [form, setForm] = useState(empty)
  const [ended, setEnded] = useState(false)
  const [preview, setPreview] = useState(null)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const sending = useRef(false)
  useEffect(() => {
    let current = true
    setError('')
    vehicleLoansAPI.regularizationCatalog().then(({ data }) => { if (current) setCatalog(data) })
      .catch((err) => { if (current) setError(getApiErrorMessage(err)) })
    return () => { current = false }
  }, [retry])
  function change(key, value) {
    setPreview(null); setReviewed(false)
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
    if (!form.vehicle_id || !form.origin || !form.recipient || !form.origin_allocation_id || !form.destination_allocation_id || (ended && !form.return_allocation_id)) {
      setError('Selecione o veículo, as secretarias e as lotações obrigatórias nas listas de resultados.')
      return
    }
    sending.current = true; setBusy(true); setError(''); setPreview(null); setReviewed(false)
    try { const { data } = await vehicleLoansAPI.previewRegularization(payload()); setPreview(data) }
    catch (err) { setError(getApiErrorMessage(err)) }
    finally { sending.current = false; setBusy(false) }
  }
  async function confirm() {
    if (sending.current || !preview?.can_confirm || !reviewed) return
    sending.current = true; setBusy(true); setError('')
    try { const { data } = await vehicleLoansAPI.regularize({ ...payload(), preview_token: preview.preview_token }); onSaved(data) }
    catch (err) { setError(getApiErrorMessage(err)); setPreview(null); setReviewed(false) }
    finally { sending.current = false; setBusy(false) }
  }
  const organizations = catalog?.organizations || []
  const allocations = (org) => (catalog?.allocations || []).filter((item) => item.organization_id === org)
  const vehicle = catalog?.vehicles.find((item) => item.id === form.vehicle_id)
  const ownerChange = vehicle && form.origin && vehicle.owner_organization_id !== form.origin
  const select = (key, label, options) => <VehicleLoanSelect label={label} options={options} value={form[key]}
    disabled={!catalog || busy || !options.length} onChange={(value) => change(key, value)} />
  const input = (key, label, type = 'text', required = true) => <label className="loan-field">{label}<input className="app-input" type={type} required={required} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.1' : undefined} value={form[key]} onChange={(event) => change(key, event.target.value)} /></label>
  const area = (key, label, minLength = 8, maxLength = 2000) => <label className="loan-field">{label}<textarea className="app-input" rows={3} required minLength={minLength} maxLength={maxLength} value={form[key]} onChange={(event) => change(key, event.target.value)} /></label>
  return <Modal open title="Regularizar empréstimo anterior" onClose={onClose} canClose={!busy}>
    <form className="loan-form" onSubmit={inspect}>
      <p>Inclusão administrativa de uma situação já existente. Informe as datas efetivas e a referência documental. As assinaturas e os aceites do passado não serão criados.</p>
      {error && <p className="loan-error" role="alert">{error}</p>}
      {!catalog && <button type="button" className="ghost-button" onClick={() => setRetry((value) => value + 1)}>Recarregar opções</button>}
      <fieldset disabled={!catalog || busy}>
        {select('vehicle_id', 'Veículo', catalog?.vehicles || [])}
        {select('origin', 'Secretaria de origem', organizations)}
        {select('origin_allocation_id', 'Lotação de origem no início do empréstimo', allocations(form.origin))}
        {ownerChange && <label className="loan-notice"><input type="checkbox" checked={form.correct_owner} onChange={(event) => change('correct_owner', event.target.checked)} /> Confirmo a correção da secretaria proprietária para a origem informada, conforme a referência documental.</label>}
        {select('recipient', 'Secretaria recebedora', organizations.filter((item) => item.id !== form.origin))}
        {select('destination_allocation_id', 'Lotação de destino', allocations(form.recipient))}
        {input('started_at', 'Entrega efetiva (data e hora local)', 'datetime-local')}
        {input('delivery_odometer_km', 'Odômetro de entrega (km)', 'number')}
        {area('delivery_condition', 'Condições de entrega', 3)}
        {input('expected_return_at', 'Previsão de devolução (opcional)', 'datetime-local', false)}
        <label><input type="checkbox" checked={ended} onChange={(event) => { setEnded(event.target.checked); setPreview(null); setReviewed(false) }} /> Este empréstimo já foi devolvido</label>
        {ended && <>{input('returned_at', 'Devolução efetiva (data e hora local)', 'datetime-local')}{select('return_allocation_id', 'Lotação de retorno', allocations(form.origin))}{input('return_odometer_km', 'Odômetro de devolução (km)', 'number')}{area('return_condition', 'Condições de devolução', 3)}</>}
        {area('reason', 'Motivo do empréstimo')}
        {area('document_reference', 'Referência documental (processo, protocolo ou termo existente)', 8, 1000)}
        <div className="loan-field">
          <JustificationField label="Justificativa da regularização administrativa" context="loan_regularization" className="app-input" required minLength={15} maxLength={1000} rows={3}
            value={form.justification} onChange={(event) => change('justification', event.target.value)} />
        </div>
      </fieldset>
      <button className="ghost-button" disabled={!catalog || busy}>{busy ? 'Processando…' : 'Conferir prévia da regularização'}</button>
    </form>
    {preview && <section className="loan-notice" aria-label="Prévia da regularização">
      <h3>Confira os efeitos antes de registrar</h3>
      <p><strong>{preview.vehicle_plate}</strong> · {preview.origin_name} → {preview.recipient_name}</p>
      <p>Situação: {preview.status === 'RETURNED' ? 'Devolvido' : 'Em andamento'}. {preview.location_change ? 'Lotação atual será alterada hoje.' : 'Lotação atual será preservada.'}</p>
      {preview.owner_change && <p><strong>A secretaria proprietária será corrigida.</strong></p>}
      {preview.blockers.length > 0 && <div role="alert"><strong>Impedimentos</strong><ul>{preview.blockers.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      <ul>{preview.warnings.map((item) => <li key={item}>{item}</li>)}</ul>
      <div className="loan-table-wrap"><table className="loan-table"><thead><tr><th>Registros no período</th><th>Total</th><th>Sem responsável</th><th>Outra responsável</th></tr></thead><tbody>{preview.impact.map((item) => <tr key={item.module}><td>{item.module}</td><td>{item.records}</td><td>{item.without_responsibility}</td><td>{item.other_responsibility}</td></tr>)}</tbody></table></div>
      {preview.can_confirm && <label><input type="checkbox" checked={reviewed} disabled={busy} onChange={(event) => setReviewed(event.target.checked)} /> Conferi as datas, a referência e os efeitos. Os registros antigos permanecerão com seus vínculos atuais.</label>}
      <div className="loan-actions"><button className="app-button" disabled={!preview.can_confirm || !reviewed || busy} onClick={confirm}>Confirmar regularização</button></div>
    </section>}
  </Modal>
}
