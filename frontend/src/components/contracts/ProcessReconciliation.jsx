import { useState } from 'react'
import { contractControlAPI } from '../../api/contractControl'
import { useContractControl } from '../../hooks/useContractFunding'
import { getApiErrorMessage } from '../../utils/apiError'
import Modal from '../Modal'
import { formatContractMoney as brl } from '../../utils/contractBalance'

export default function ProcessReconciliation({ process, onChange }) {
  const mode = useContractControl()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [operations, setOperations] = useState([])
  const [selected, setSelected] = useState([])
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [stale, setStale] = useState(false)
  async function show() {
    setOpen(true); setLoading(true); setError(''); setFeedback('')
    try {
      if (!process.contract_id) throw new Error('Vincule o processo a um contrato antes de conciliar.')
      const [first, current] = await Promise.all([
        contractControlAPI.operations(process.contract_id, { unbilled: true, process_id: process.id, page: 1, limit: 200 }),
        contractControlAPI.reconciliation(process.id),
      ])
      const rows = [...(first.data.data || [])]
      for (let page = 2; page <= first.data.pages; page++) {
        const { data } = await contractControlAPI.operations(process.contract_id, { unbilled: true, process_id: process.id, page, limit: 200 })
        rows.push(...data.data)
      }
      setOperations(rows); setSelected(current.data?.operation_ids || []); setReason(current.data?.justification || ''); setStale(Boolean(current.data?.stale))
    } catch (err) { setError(getApiErrorMessage(err, err.message || 'Não foi possível consultar as operações.')) }
    finally { setLoading(false) }
  }
  const total = operations.filter((o) => selected.includes(o.id)).reduce((sum, o) => sum+Number(o.amount), 0)
  const difference = Number(process.amount || 0)-total
  async function save(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await contractControlAPI.reconcile(process.id, { operation_ids: selected, justification: reason || null })
      setOpen(false); setFeedback('Conciliação salva. Operações já consumidas não foram descontadas novamente.')
      onChange?.()
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível conciliar a fatura.')) }
    finally { setSaving(false) }
  }
  if (!mode.enabled || mode.error) return null
  return <section className="contract-reconciliation">
    <button className="secondary-button" type="button" onClick={show}>Conciliar operações da fatura</button>
    {feedback ? <p className="alert alert-success" role="status">{feedback}</p> : null}
    <Modal open={open} title="Conciliar fatura e serviços realizados" onClose={() => setOpen(false)} canClose={!saving && !loading}>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {loading ? <p role="status">Consultando operações disponíveis…</p> : <form onSubmit={save}>
        <p>Selecione os serviços desta fatura. O consumo já registrado no contrato será preservado.</p>
        {stale ? <p className="alert alert-warning" role="status">A fatura ou uma operação foi alterada após a última conciliação. Confira os valores atualizados e confirme novamente.</p> : null}
        <div className="contract-checklist">{operations.map((o) => <label key={o.id}><input type="checkbox" checked={selected.includes(o.id)} onChange={() => setSelected((s) => s.includes(o.id) ? s.filter((id) => id !== o.id) : [...s, o.id])} />
          <span><strong>{o.vehicle_plate || 'Sem veículo'} · {brl(o.amount)}</strong><br /><small>{new Date(o.occurred_at).toLocaleDateString('pt-BR')} · {o.provider_name || o.source_type} · {o.organization_name || 'Sem secretaria'}</small></span></label>)}</div>
        {!operations.length ? <p>Nenhuma operação disponível para conciliar neste contrato.</p> : null}
        <dl className="contract-funding__summary"><div><dt>Fatura</dt><dd>{brl(process.amount)}</dd></div><div><dt>Operações selecionadas</dt><dd>{brl(total)}</dd></div><div><dt>Diferença a ajustar</dt><dd>{brl(difference)}</dd></div></dl>
        {Math.abs(difference) >= .005 ? <label className="form-field">Justificativa da diferença<textarea className="app-textarea" minLength={10} required value={reason} onChange={(e) => setReason(e.target.value)} /><small>Somente a diferença confirmada será lançada como ajuste no extrato.</small></label> : null}
        <div className="actions-inline modal-actions"><button className="ghost-button" type="button" disabled={saving} onClick={() => setOpen(false)}>Voltar</button><button className="app-button" disabled={saving || !selected.length}>{saving ? 'Salvando…' : 'Confirmar conciliação'}</button></div>
      </form>}
    </Modal>
  </section>
}
