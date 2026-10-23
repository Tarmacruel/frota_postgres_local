import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contractControlAPI } from '../../api/contractControl'
import { useMasterDataCatalog } from '../../hooks/useMasterDataCatalog'
import { getApiErrorMessage } from '../../utils/apiError'
import { exportRowsToXlsx, previewRowsToPdf } from '../../utils/exportData'
import { formatContractMoney as brl } from '../../utils/contractBalance'
import useContractFilters from '../../hooks/useContractFilters'

export default function ContractCommitmentsBrowser({ contract, mode, providers = [], revision }) {
  const { organizations } = useMasterDataCatalog({ organizationsOnly: true })
  const { filters, page, setPage, update, params } = useContractFilters(mode, { vehicle_search: '', organization_id: '', provider_id: '', start: '', end: '', unbilled: '' })
  const [list, setList] = useState({ data: [], total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const reserved = mode === 'reservations'
  const contractId = contract.id
  const query = { ...filters, organization_id: filters.organization_id || undefined, provider_id: filters.provider_id || undefined,
    unbilled: !reserved && filters.unbilled === '1' ? true : undefined,
    start: filters.start ? new Date(filters.start+'T00:00:00').toISOString() : undefined,
    end: filters.end ? new Date(filters.end+'T23:59:59.999').toISOString() : undefined }
  const queryKey = JSON.stringify(query)
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    contractControlAPI[reserved ? 'reservations' : 'operations'](contractId, { ...JSON.parse(queryKey), page, limit: 20 }).then(({ data }) => { if (active) setList(data) })
      .catch((err) => { if (active) setError(getApiErrorMessage(err, 'Não foi possível consultar os registros.')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [contractId, reserved, queryKey, page, revision])
  function invoicePath(processId) {
    const next = new URLSearchParams(params)
    next.set('view', 'payments'); next.set('contract_id', contractId); next.set('financial_view', 'processes')
    next.delete('indicator')
    if (processId) next.set('focus_process', processId)
    else next.delete('focus_process')
    return `/processos-pagamento?${next}`
  }
  async function report(pdf) {
    setExporting(true); setError('')
    try {
      let current = 1; let pages = 1; const rows = []
      do {
        const { data } = await contractControlAPI[reserved ? 'reservations' : 'operations'](contractId, { ...query, page: current, limit: 200 })
        rows.push(...data.data); pages = data.pages; current++
      } while (current <= pages)
      const options = { fileName: `${reserved ? 'reservas' : 'execucoes'}-${contract.number}`, sheetName: reserved ? 'Reservas' : 'Execuções',
        title: `${reserved ? 'Reservas abertas' : 'Serviços realizados'} · contrato ${contract.number}`, rows,
        columns: [{ header: 'Data', value: (r) => new Date(r.occurred_at).toLocaleString('pt-BR') },
          { header: 'Veículo', value: (r) => r.vehicle_plate || '-' }, { header: 'Prestador', value: (r) => r.provider_name || '-' },
          { header: 'Secretaria', value: (r) => r.organization_name || '-' }, { header: 'Valor', value: (r) => brl(r.amount) },
          { header: 'Origem', value: (r) => `${r.source_type} ${r.source_id}` }],
        filters: [{ label: 'Placa', value: filters.vehicle_search || 'Todas' }, { label: 'Conciliação', value: !reserved && filters.unbilled === '1' ? 'Somente sem conciliação' : 'Todas' }, { label: 'De', value: filters.start || 'Início do controle' }, { label: 'Até', value: filters.end || 'Hoje' }] }
      if (pdf) await previewRowsToPdf(options)
      else await exportRowsToXlsx(options)
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível gerar o relatório.')) }
    finally { setExporting(false) }
  }
  return <section className="contract-detail__section" aria-label={reserved ? 'Reservas abertas do contrato' : 'Serviços realizados do contrato'}>
    <div className="contract-order-panel__heading"><h4>{reserved ? 'Reservas abertas' : 'Serviços realizados'}</h4><div className="actions-inline"><button className="secondary-button" disabled={exporting} onClick={() => report(true)}>Pré-visualizar PDF</button><button className="ghost-button" disabled={exporting} onClick={() => report(false)}>Exportar XLSX</button></div></div>
    <div className="contract-toolbar"><label>Placa<input className="app-input" aria-label="Placa na composição" value={filters.vehicle_search} onChange={(e) => update('vehicle_search', e.target.value)} /></label>
      <label>Secretaria<select className="app-select" value={filters.organization_id} onChange={(e) => update('organization_id', e.target.value)}><option value="">Todas do seu acesso</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
      <label>Prestador<select className="app-select" value={filters.provider_id} onChange={(e) => update('provider_id', e.target.value)}><option value="">Todos</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.station_name || p.name}</option>)}</select></label>
      <label>De<input className="app-input" type="date" value={filters.start} onChange={(e) => update('start', e.target.value)} /></label><label>Até<input className="app-input" type="date" value={filters.end} onChange={(e) => update('end', e.target.value)} /></label></div>
    {!reserved ? <label className="contract-unbilled-filter"><input type="checkbox" checked={filters.unbilled === '1'} onChange={(event) => update('unbilled', event.target.checked ? '1' : '')} />Sem conciliação</label> : null}
    <p className="muted">{list.total} registro(s) no filtro. O saldo do contrato é compartilhado; os detalhes respeitam seu acesso às secretarias.</p>
    {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
    {loading ? <p role="status">Carregando composição…</p> : <div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Data / origem</th><th>Veículo / secretaria</th><th>Prestador</th><th>{reserved ? 'Reserva' : 'Consumo real'}</th><th>{reserved ? 'Previsão' : 'Fatura'}</th></tr></thead><tbody>
      {list.data.map((r) => <tr key={r.id}><td data-label="Data / origem">{new Date(r.occurred_at).toLocaleString('pt-BR')}<small>{r.source_type.includes('FUEL') ? 'Abastecimento' : 'Manutenção'} · {r.source_id.slice(0, 8)}</small></td><td data-label="Veículo / secretaria">{r.vehicle_plate || '—'}<small>{r.organization_name || 'Sem secretaria'}</small></td><td data-label="Prestador">{r.provider_name || '—'}</td><td data-label={reserved ? 'Reserva' : 'Consumo real'}>{brl(r.amount)}</td><td data-label={reserved ? 'Previsão' : 'Fatura'}>{reserved ? r.liters ? `${r.liters} L · ${r.fuel_type}` : 'Orçamento de manutenção' : r.invoice_process_id ? <Link to={invoicePath(r.invoice_process_id)}>Abrir processo</Link> : <><small>Aguardando conciliação</small><Link to={invoicePath()}>Selecionar fatura</Link></>}</td></tr>)}
      {!list.data.length ? <tr><td colSpan={5} className="contract-empty">Nenhum registro neste filtro.</td></tr> : null}</tbody></table></div>}
    {list.pages > 1 ? <div className="actions-inline"><button className="ghost-button" disabled={page <= 1} onClick={() => setPage(page-1)}>Anterior</button><span>Página {page} de {list.pages}</span><button className="ghost-button" disabled={page >= list.pages} onClick={() => setPage(page+1)}>Próxima</button></div> : null}
  </section>
}
