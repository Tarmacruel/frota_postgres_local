import '../../styles/contracts-balances.css'
import { formatContractMoney } from '../../utils/contractBalance'

export default function ContractFundingFields({ funding, externalFuelType = false }) {
  if (funding.enabled === false) return null
  const amount = funding.kind === 'FUEL' ? funding.quote?.reserve_amount : funding.estimatedCost
  const after = funding.kind === 'FUEL' ? funding.quote?.available_after
    : funding.contract ? Number(funding.contract.available_balance)-Number(amount || 0) : null
  return <fieldset className="contract-funding modal-field-span" aria-busy={funding.loading}>
    <legend>Reserva no contrato</legend>
    {funding.error ? <div className="alert alert-error" role="alert">{funding.error}<button type="button" className="ghost-button" onClick={funding.refresh}>Tentar novamente</button></div> : null}
    {funding.enabled === null ? <p role="status">Conferindo controle contratual…</p> : <>
      {funding.kind === 'FUEL' && !funding.stationId ? <p>Selecione o posto para consultar seus contratos.</p> : <>
        <label>Contrato<select className="app-select" aria-label="Contrato para reserva" value={funding.contract?.id || ''} onChange={(e) => funding.selectContract(e.target.value)} required>
          <option value="">Selecione o contrato</option>{funding.contracts.map((c) => <option key={c.id} value={c.id}>{c.number} · disponível {formatContractMoney(c.available_balance)}</option>)}
        </select></label>
        {!funding.contracts.length && !funding.loading && !funding.error ? <p role="status">Nenhum contrato liberado para este serviço. A gestão precisa conferir vigência, rede, preços e saldo inicial.</p> : null}
      </>}
      {funding.contract ? <>
        <label>Prestador executante<select className="app-select" aria-label="Prestador para reserva" value={funding.provider?.id || ''} onChange={(e) => funding.selectProvider(e.target.value)} required>
          <option value="">Selecione o prestador</option>{funding.providers.map((p) => <option key={p.id} value={p.id}>{p.station_name || p.name}</option>)}
        </select></label>
        {funding.kind === 'FUEL' && !externalFuelType ? <label>Combustível autorizado<select className="app-select" aria-label="Combustível autorizado" value={funding.fuelType} onChange={(e) => funding.selectFuel(e.target.value)} required>
          <option value="">Selecione o combustível</option>{funding.fuels.map((f) => <option key={f} value={f}>{f}</option>)}
        </select></label> : null}
        {funding.loading ? <p role="status">Calculando reserva…</p> : <dl className="contract-funding__summary">
          {funding.quote ? <div><dt>Preço cadastrado / litro</dt><dd>{Number(funding.quote.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 6 })}</dd></div> : null}
          <div><dt>Disponível agora</dt><dd>{formatContractMoney(funding.contract.available_balance)}</dd></div>
          <div><dt>Valor a reservar</dt><dd>{formatContractMoney(amount)}</dd></div>
          <div><dt>Disponível após o pedido</dt><dd>{formatContractMoney(after)}</dd></div>
        </dl>}
        {after !== null && after !== undefined && Number(after) < 0 ? <p className="alert alert-error" role="alert">Saldo insuficiente. Ajuste o pedido ou regularize o contrato.</p> : null}
      </> : null}
      <p className="muted">A reserva reduz o disponível. Na conclusão, o sistema registra o valor real e libera a sobra.</p>
    </>}
  </fieldset>
}
