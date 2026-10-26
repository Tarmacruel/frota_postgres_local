import { useState } from 'react'
import Modal from '../Modal'
import { maintenanceOrdersAPI } from '../../api/contractControl'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatContractMoney as brl } from '../../utils/contractBalance'

export default function MaintenanceOrderActionDialog({ row, action, onClose, onSuccess }) {
  const [form, setForm] = useState({ total_cost: '', parts_replaced: '', justification: '', end_date: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const titles = { details: 'Pedido de manutenção', start: 'Iniciar manutenção', complete: 'Concluir manutenção', cancel: 'Cancelar pedido' }
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      if (action === 'start') await maintenanceOrdersAPI.start(row.id)
      if (action === 'cancel') await maintenanceOrdersAPI.cancel(row.id, { justification: form.justification })
      if (action === 'complete') await maintenanceOrdersAPI.complete(row.id, { total_cost: form.total_cost, parts_replaced: form.parts_replaced || null, end_date: form.end_date ? new Date(form.end_date).toISOString() : null })
      onClose(); onSuccess?.('Pedido atualizado. O saldo do contrato foi recalculado.')
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível atualizar o pedido.')) }
    finally { setSaving(false) }
  }
  return <Modal open={Boolean(row)} title={titles[action]} onClose={onClose} canClose={!saving}>
    {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    {action === 'details' ? <>
      <h4>{row.vehicle_plate} · {row.service_description}</h4>
      <dl className="contract-funding__summary"><div><dt>Contrato</dt><dd>{row.contract_number}</dd></div><div><dt>Oficina</dt><dd>{row.provider_name}</dd></div>
        <div><dt>Orçamento previsto</dt><dd>{brl(row.estimated_cost)}</dd></div><div><dt>Custo realizado</dt><dd>{brl(row.total_cost)}</dd></div>
        <div><dt>Secretaria</dt><dd>{row.organization_name || 'Sem secretaria'}</dd></div></dl>
      {row.cancellation_reason ? <p>{row.cancellation_reason}</p> : null}
    </> : <form className="contract-form" onSubmit={submit}>
      <p className="contract-form__wide">{row.vehicle_plate} · {row.provider_name}<br />{row.service_description}</p>
      {action === 'complete' ? <><label>Custo real (R$)<input className="app-input" aria-label="Custo real" type="number" min="0" step=".01" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} required /></label>
        <label>Conclusão (em branco: agora)<input className="app-input" type="datetime-local" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></label>
        <label className="contract-form__wide">Peças e observações<textarea className="app-textarea" value={form.parts_replaced} onChange={(e) => setForm({ ...form, parts_replaced: e.target.value })} /></label>
        <p className="muted contract-form__wide">Informe o valor do serviço realizado. A sobra da reserva será liberada; excedentes serão registrados e sinalizados.</p></> : null}
      {action === 'cancel' ? <label className="contract-form__wide">Justificativa<textarea className="app-textarea" minLength={10} required value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value })} /></label> : null}
      <div className="actions-inline"><button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Voltar</button><button className="app-button" disabled={saving}>{saving ? 'Salvando…' : 'Confirmar'}</button></div>
    </form>}
  </Modal>
}
