import { useEffect, useState } from 'react'
import { contractControlAPI } from '../../api/contractControl'
import { useMasterDataCatalog } from '../../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../../utils/exportData'
import { formatContractMoney as brl } from '../../utils/contractBalance'
import useContractFilters from '../../hooks/useContractFilters'

const movementLabels = { OPENING: 'Abertura', RESERVE: 'Reserva', RELEASE: 'Liberação', CONSUMPTION: 'Consumo realizado',
  CONSUMPTION_ADJUSTMENT: 'Retificação de consumo', CREDIT: 'Acréscimo', DEBIT: 'Redução', INVOICE_ADJUSTMENT: 'Diferença de fatura', DIVERGENCE_RESOLVED: 'Divergência regularizada' }

export default function ContractMovementBrowser({ contract, providers = [], revision, initialType = '' }) {
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })
  const { filters, page, setPage, update } = useContractFilters('ledger', { status: initialType, organization_id: '', provider_id: '', start: '', end: '' })
  const [result, setResult] = useState({ data: [], total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const start = filters.start ? new Date(filters.start+'T00:00:00').toISOString() : undefined
  const end = filters.end ? new Date(filters.end+'T23:59:59.999').toISOString() : undefined
  const contractId = contract.id
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    contractControlAPI.movements(contractId, { ...filters, organization_id: filters.organization_id || undefined, provider_id: filters.provider_id || undefined, status: filters.status || undefined, start, end, page, limit: 20 }).then(({ data }) => {
      if (active) setResult(data)
    }).catch((err) => { if (active) setError(getApiErrorMessage(err, 'Não foi possível consultar o extrato.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [contractId, filters, start, end, page, revision])
  const columns = [
    { header: 'Data', value: (r) => new Date(r.created_at).toLocaleString('pt-BR') },
    { header: 'Movimentação', value: (r) => movementLabels[r.movement_type] || r.movement_type },
    { header: 'Veículo', value: (r) => r.vehicle_plate || '-' }, { header: 'Secretaria', value: (r) => r.organization_name || '-' },
    { header: 'Prestador', value: (r) => r.provider_name || '-' }, { header: 'Variação do saldo', value: (r) => brl(r.balance_delta) },
    { header: 'Variação da reserva', value: (r) => brl(r.reserved_delta) }, { header: 'Responsável', value: (r) => r.actor_name || 'Sistema' },
    { header: 'Justificativa', value: (r) => r.justification || '-' },
  ]
  async function report(pdf = false) {
    setExporting(true); setError('')
    try {
      let current = 1; let pages = 1; const rows = []
      do {
        const { data } = await contractControlAPI.movements(contractId, { ...filters, organization_id: filters.organization_id || undefined, provider_id: filters.provider_id || undefined, status: filters.status || undefined, start, end, page: current, limit: 200 })
        rows.push(...data.data); pages = data.pages; current++
      } while (current <= pages)
      const options = { fileName: `extrato-contrato-${contract.number}`, sheetName: 'Extrato', title: `Extrato do contrato ${contract.number}`, columns, rows,
        filters: [{ label: 'Empresa', value: contract.supplier_name }, { label: 'Movimentação', value: movementLabels[filters.status] || 'Todas' },
          { label: 'Início', value: filters.start || 'Todo o histórico' }, { label: 'Fim', value: filters.end || 'Até hoje' }] }
      if (pdf) await previewRowsToPdf(options)
      else await exportRowsToXlsx(options)
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível gerar o extrato.')) }
    finally { setExporting(false) }
  }
  return <section className="contract-detail__section" aria-label="Extrato do contrato">
    <div className="contract-order-panel__heading"><div><h4>Extrato do contrato</h4><span className="muted">Histórico de reservas e lançamentos. Os saldos do cabeçalho representam a posição atual.</span></div>
      <div className="actions-inline"><button className="secondary-button" disabled={exporting} onClick={() => report(true)}>Pré-visualizar PDF</button><button className="ghost-button" disabled={exporting} onClick={() => report()}>Exportar XLSX</button></div></div>
    <div className="contract-toolbar"><label>Movimentação<select className="app-select" aria-label="Filtrar movimentação" value={filters.status} onChange={(e) => update('status', e.target.value)}><option value="">Todas</option>{Object.entries(movementLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Secretaria<select className="app-select" aria-label="Secretaria do extrato" value={filters.organization_id} onChange={(e) => update('organization_id', e.target.value)}><option value="">Todas do seu acesso</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label>Prestador<select className="app-select" value={filters.provider_id} onChange={(e) => update('provider_id', e.target.value)}><option value="">Todos</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.station_name || p.name}</option>)}</select></label>
      <label>De<input className="app-input" type="date" value={filters.start} onChange={(e) => update('start', e.target.value)} /></label>
      <label>Até<input className="app-input" type="date" value={filters.end} onChange={(e) => update('end', e.target.value)} /></label>
    </div>
    {error ? <p className="alert alert-error" role="alert">{error}</p> : null}
    {loading ? <p role="status">Carregando extrato…</p> : <><p className="muted">{result.total} lançamento(s) no filtro.</p>
      <div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Data / origem</th><th>Movimentação</th><th>Veículo / secretaria</th><th>Saldo</th><th>Reserva</th><th>Responsável</th></tr></thead><tbody>
        {result.data.map((r) => <tr key={r.id}><td data-label="Data / origem">{new Date(r.created_at).toLocaleString('pt-BR')}<small>{r.provider_name || r.source_type}</small></td><td data-label="Movimentação">{movementLabels[r.movement_type] || r.movement_type}<small>{r.justification}</small></td><td data-label="Veículo / secretaria">{r.vehicle_plate || '—'}<small>{r.organization_name || '—'}</small></td><td data-label="Saldo">{brl(r.balance_delta)}</td><td data-label="Reserva">{brl(r.reserved_delta)}</td><td data-label="Responsável">{r.actor_name || 'Sistema'}</td></tr>)}
        {!result.data.length ? <tr><td colSpan={6} className="contract-empty">Nenhuma movimentação neste filtro.</td></tr> : null}
      </tbody></table></div>
      {result.pages > 1 ? <div className="actions-inline"><button className="ghost-button" disabled={page <= 1} onClick={() => setPage(page-1)}>Anterior</button><span>{page} / {result.pages}</span><button className="ghost-button" disabled={page >= result.pages} onClick={() => setPage(page+1)}>Próxima</button></div> : null}</>}
  </section>
}
