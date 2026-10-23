import { useEffect, useState } from 'react'
import { paymentProcessesAPI } from '../../api/paymentProcesses'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatContractMoney as brl } from '../../utils/contractBalance'

export default function ContractInvoicesPanel({ contract, onOpen, onBrowse, revision }) {
  const [indicator, setIndicator] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ data: [], pagination: { pages: 1, total: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const id = contract.id
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    paymentProcessesAPI.list({ contract_id: id, indicator: indicator || undefined, page, limit: 20 }).then(({ data }) => { if (active) setResult(data) })
      .catch((err) => { if (active) setError(getApiErrorMessage(err, 'Não foi possível consultar as faturas.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [id, indicator, page, revision])
  function select(value) { setIndicator(indicator === value ? '' : value); setPage(1) }
  return <section className="contract-detail__section" aria-label="Faturas do contrato">
    <div className="contract-summary contract-summary--financial">
      <button aria-pressed={indicator === 'paid_amount'} onClick={() => select('paid_amount')}><span>Pago em faturas</span><strong>{brl(contract.paid_amount)}</strong></button>
      <button aria-pressed={indicator === 'pending_amount'} onClick={() => select('pending_amount')}><span>A pagar em faturas</span><strong>{brl(contract.pending_amount)}</strong></button>
    </div>
    <div className="contract-order-panel__heading"><h4>Processos vinculados</h4><button className="secondary-button" onClick={() => onBrowse(indicator)}>Abrir gestão de faturas</button></div>
    <p className="muted">Pagamentos acompanham as faturas e não descontam novamente o consumo.</p>
    {error ? <p className="alert alert-error" role="alert">{error}</p> : null}
    {loading ? <p role="status">Carregando faturas…</p> : <div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Processo / fatura</th><th>Etapa</th><th>Vencimento</th><th>Valor</th></tr></thead><tbody>
      {result.data.map((row) => <tr key={row.id}><td data-label="Processo / fatura"><button className="contract-text-link" onClick={() => onOpen(row.id)}>{row.process_number || row.invoice_number || 'Abrir processo'}</button><small>{row.invoice_number || row.billing_number}</small></td><td data-label="Etapa">{row.stage_label || row.stage}</td><td data-label="Vencimento">{row.due_date ? new Date(row.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td><td data-label="Valor">{brl(row.amount)}</td></tr>)}
      {!result.data.length ? <tr><td colSpan={4} className="contract-empty">Nenhuma fatura neste filtro.</td></tr> : null}
    </tbody></table></div>}
    {result.pagination.pages > 1 ? <div className="actions-inline"><button className="ghost-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {result.pagination.pages}</span><button className="ghost-button" disabled={page >= result.pagination.pages} onClick={() => setPage(page + 1)}>Próxima</button></div> : null}
  </section>
}
