import { FormFields } from '../GuidedForm'
import '../../styles/contracts-balances.css'
import { formatContractMoney } from '../../utils/contractBalance'

export default function ContractFundingFields({ funding, externalFuelType = false }) {
  if (funding.enabled === false) return null
  const amount = funding.kind === 'FUEL' ? funding.quote?.reserve_amount : funding.estimatedCost
  const after = funding.kind === 'FUEL' ? funding.quote?.available_after
    : funding.contract ? Number(funding.contract.available_balance)-Number(amount || 0) : null
  return <FormFields><fieldset className="contract-funding modal-field-span" aria-busy={funding.loading}>
    <legend>{funding.networkValue ? 'Consumo no contrato por valor' : 'Reserva no contrato'}</legend>
    {funding.error ? <div className="alert alert-error" role="alert">{funding.error}<button type="button" className="ghost-button" onClick={funding.refresh}>Tentar novamente</button></div> : null}
    {funding.enabled === null ? <p role="status">Conferindo controle contratual…</p> : <>
      {funding.kind === 'FUEL' && !funding.stationId ? <p>Selecione o posto para identificar seu contrato.</p> : <>
        {funding.kind === 'FUEL' ? <>
          {funding.contracts.length > 1 ? <label>Contrato<select className="app-select" aria-label="Contrato para reserva" value={funding.contract?.id || ''} disabled={funding.lockedContract} onChange={(e) => funding.selectContract(e.target.value)} required><option value="">Selecione o contrato</option>{funding.contracts.map((c) => <option key={c.id} value={c.id}>{c.number} · disponível {formatContractMoney(c.available_balance)}</option>)}</select></label> : null}
          {funding.contract && funding.provider ? <dl className="contract-funding__summary modal-field-span" aria-label="Contrato selecionado para o posto">
            <div><dt>Contrato do posto</dt><dd>{funding.contract.number}</dd></div>
            <div><dt>Posto executante</dt><dd>{funding.provider.station_name || funding.provider.name}</dd></div>
          </dl> : funding.loading ? <p role="status">Conferindo o contrato do posto…</p> : null}
        </> : <label>Contrato<select className="app-select" aria-label="Contrato para reserva" value={funding.contract?.id || ''} disabled={funding.lockedContract} onChange={(e) => funding.selectContract(e.target.value)} required>
          <option value="">Selecione o contrato</option>{funding.contracts.map((c) => <option key={c.id} value={c.id}>{c.number} · disponível {formatContractMoney(c.available_balance)}</option>)}
        </select></label>}
        {!funding.contracts.length && !funding.loading && !funding.error ? <p role="status">{funding.kind === 'FUEL'
          ? 'Este posto não possui contrato liberado. A gestão precisa conferir os vínculos, a vigência, os preços, o saldo e as quantidades.'
          : 'Nenhum contrato liberado para este serviço. A gestão precisa conferir vigência, rede, saldo e quantidades.'}</p> : null}
      </>}
      {funding.contract ? <>
        {funding.kind !== 'FUEL' ? <label>Prestador executante<select className="app-select" aria-label="Prestador para reserva" value={funding.provider?.id || ''} onChange={(e) => funding.selectProvider(e.target.value)} required>
          <option value="">Selecione o prestador</option>{funding.providers.map((p) => <option key={p.id} value={p.id}>{p.station_name || p.name}</option>)}
        </select></label> : null}
        {funding.kind === 'FUEL' && !externalFuelType ? <label>Combustível solicitado<select className="app-select" aria-label="Combustível solicitado" value={funding.fuelType} onChange={(e) => funding.selectFuel(e.target.value)} required>
          <option value="">Selecione o combustível</option>{funding.fuels.map((f) => <option key={f} value={f}>{f}</option>)}
        </select></label> : null}
        {funding.quantityEnabled && funding.mainItems?.length > 1 ? <label>Item contratual<select className="app-select" value={funding.mainItem?.id || ''} onChange={(e) => funding.selectItem(e.target.value)} required><option value="">Selecione o item/lote</option>{funding.mainItems.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.description}</option>)}</select></label> : null}
        {funding.quantityEnabled && funding.kind === 'FUEL' && !funding.externalAdditive && funding.additiveItems?.length ? <>
          <label>Aditivo previsto<select className="app-select" aria-label="Aditivo previsto" value={funding.additive?.id || ''} onChange={(e) => funding.selectAdditive(e.target.value)}><option value="">Sem aditivo</option>{funding.additiveItems.map((r) => <option key={r.id} value={r.id}>{r.description} · {r.available} {r.unit} disponíveis</option>)}</select></label>
          {funding.additive ? <label>Quantidade do aditivo por veículo<input className="app-input" aria-label="Quantidade do aditivo por veículo" type="number" min=".001" step=".001" required value={funding.additiveQuantity} onChange={(e) => funding.setAdditiveQuantity(e.target.value)} /></label> : null}
        </> : null}
        {funding.quantityEnabled && funding.quote?.item_lines?.length ? <div className="contract-form__wide"><strong>Quantidades a reservar</strong>{funding.quote.item_lines.map((r) => <p key={r.item_id}>{r.description}: {r.quantity} {r.unit} · disponível após: {Number(r.available)-Number(r.quantity)} {r.unit}</p>)}</div> : null}
        {funding.loading ? <p role="status">{funding.networkValue ? 'Conferindo contrato…' : 'Calculando reserva…'}</p> : <dl className="contract-funding__summary">
          {funding.quote && !funding.networkValue ? <div><dt>Preço cadastrado / litro</dt><dd>{Number(funding.quote.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 6 })}</dd></div> : null}
          <div><dt>Disponível agora</dt><dd>{formatContractMoney(funding.quote?.available_balance ?? funding.contract.available_balance)}</dd></div>
          {!funding.networkValue ? <><div><dt>Valor a reservar</dt><dd>{formatContractMoney(amount)}</dd></div>
          <div><dt>Disponível após o pedido</dt><dd>{formatContractMoney(after)}</dd></div></> : null}
        </dl>}
        {after !== null && after !== undefined && Number(after) < 0 ? <p className="alert alert-error" role="alert">Saldo insuficiente. Ajuste o pedido ou regularize o contrato.</p> : null}
      </> : null}
      <p className="muted">{funding.networkValue ? 'Rede credenciada por valor: este pedido não reserva saldo nem utiliza preço por litro cadastrado. O total real do comprovante será descontado ao confirmar o abastecimento.' : 'A reserva reduz o disponível. Na conclusão, o sistema registra o valor real e libera a sobra.'}</p>
    </>}
  </fieldset></FormFields>
}
