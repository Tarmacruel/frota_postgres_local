import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '../Modal'
import { contractControlAPI } from '../../api/contractControl'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatContractMoney as brl } from '../../utils/contractBalance'
import { FUEL_TYPE_OPTIONS, ADDITIVE_TYPE_OPTIONS } from '../../utils/fuelSupplyDetails'
import ContractItemLines from './ContractItemLines'
import MoneyInput from '../MoneyInput'
import OriginalContractItemForm from './OriginalContractItemForm'
import { itemLinesPayload } from '../../utils/contractItemLines'

const categories = { FUEL: 'Combustível', ADDITIVE: 'Aditivo / ARLA', SERVICE: 'Serviço', PART: 'Peça' }
const amount = (value) => value === null || value === undefined ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function ItemPriceReadiness({ items, isFuel, onPrice }) {
  const supplier = isFuel ? 'posto' : 'oficina'
  return <section className="contract-form__wide contract-item-readiness" aria-label="Preços pendentes">
    <strong>Falta informar {isFuel ? 'o posto' : 'a oficina'} e o preço de {items.length} {items.length === 1 ? 'item' : 'itens'}.</strong>
    <p>O preço original fica no cadastro do contrato. Para usar um item nos pedidos, associe-o {isFuel ? 'ao posto que o fornece' : 'à oficina que executa o serviço ou fornece a peça'} e confira o preço cobrado.</p>
    <ul>{items.map((item) => <li key={item.id}>
      <span><strong>{item.code}</strong> · {item.description}</span>
      <button type="button" className="secondary-button" aria-label={`Informar ${supplier} e preço de ${item.code}`} onClick={() => onPrice(item.id)}>Informar {supplier} e preço</button>
    </li>)}</ul>
  </section>
}

export default function ContractItemsPanel({ contract, providers = [], legacyPrices = [], manage, revision, onChange }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [movement, setMovement] = useState(null)
  const load = useCallback(async () => {
    try { const result = await contractControlAPI.items(contract.id); setData(result.data); setError('') }
    catch (err) { setError(getApiErrorMessage(err, 'Não foi possível consultar os itens.')) }
  }, [contract.id])
  useEffect(() => { load() }, [load, revision])
  const changed = () => { load(); onChange?.() }
  async function ledger(item) {
    setError('')
    try { const response = await contractControlAPI.itemMovements(contract.id, { item_id: item.id }); setMovement({ item, ...response.data }) }
    catch (err) { setError(getApiErrorMessage(err, 'Não foi possível consultar as quantidades.')) }
  }
  if (contract.fuel_pricing_mode === 'NETWORK_VALUE' && !data?.opened) return null
  return <section className="contract-detail__section contract-items-panel">
    <div className="contract-order-panel__heading"><div><h4>Itens e quantidades</h4><p className="muted">{data?.opened ? 'Quantidades conferidas · reservas e consumo acompanhados por item.' : 'Abertura pendente. Novos pedidos exigem quantidades e preços conferidos.'}</p></div>{manage ? <div className="actions-inline">{!data?.opened ? <><button className="secondary-button" onClick={() => setDialog({ type: 'item' })}>Cadastrar item</button><button className="secondary-button" disabled={!data?.items?.length} onClick={() => setDialog({ type: 'price' })}>Vincular preço</button><button className="app-button" disabled={!data?.items?.length} onClick={() => setDialog({ type: 'opening' })}>Conferir quantidades</button></> : data.original_complements_supported ? <button className="secondary-button" onClick={() => setDialog({ type: 'original-complement' })}>Adicionar item original</button> : null}</div> : null}</div>
    {manage && data?.opened && data.original_complements_supported ? <p className="muted">Itens do contrato original que faltaram no cadastro podem ser incluídos aqui, preservando o saldo financeiro.</p> : null}
    {error ? <div className="alert alert-error" role="alert">{error}<button className="ghost-button" onClick={load}>Tentar novamente</button></div> : null}
    {!data ? <p role="status">Carregando itens…</p> : <div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Item do contrato</th><th>Original</th><th>Preço de referência</th><th>Restante</th><th>Reservado</th><th>Disponível</th><th>Ações</th></tr></thead><tbody>{data.items.map((r) => <tr key={r.id}>
      <td data-label="Item"><strong>{r.original_number} · {r.description}</strong><small>{r.code} · {categories[r.category]} · {r.unit}</small></td><td data-label="Original">{amount(r.original_quantity)}</td><td data-label="Referência">{Number(r.reference_unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 6 })}</td><td data-label="Restante">{amount(r.remaining)}</td><td data-label="Reservado">{amount(r.reserved)}</td><td data-label="Disponível"><strong>{amount(r.available)}</strong></td><td data-label="Ações"><div className="actions-inline">{manage && !data.opened ? <button className="ghost-button" onClick={() => setDialog({ type: 'item', item: r })}>Editar</button> : null}{data.opened ? <button className="ghost-button" onClick={() => ledger(r)}>Extrato de itens</button> : null}</div></td>
    </tr>)}{!data.items.length ? <tr><td colSpan={7}>Nenhum item cadastrado. Informe os itens originais do contrato.</td></tr> : null}</tbody></table></div>}
    {data?.prices?.length ? <details className="contract-item-price-list"><summary>Preços vinculados aos itens</summary>{data.prices.map((p) => <p key={p.id}><strong>{data.items.find((i) => i.id === p.item_id)?.description}</strong> · {providers.find((r) => r.id === p.provider_id)?.station_name || providers.find((r) => r.id === p.provider_id)?.name} · {brl(p.unit_price)} · {p.current ? 'Vigente' : 'Histórico / agendado'}</p>)}</details> : null}
    {dialog && data ? dialog.type === 'original-complement'
      ? <OriginalContractItemForm contract={contract} providers={providers} legacyPrices={legacyPrices} adjudication={data.adjudication} onClose={() => setDialog(null)} onSuccess={changed} />
      : <ItemSetupDialog dialog={dialog} contract={contract} items={data.items} providers={providers} legacyPrices={legacyPrices} onClose={() => setDialog(null)} onSuccess={changed} /> : null}
    {movement ? <Modal open title={`Quantidades · ${movement.item.description}`} onClose={() => setMovement(null)} className="contract-item-editor"><p>Posição atual: {amount(movement.item.available)} {movement.item.unit} disponíveis.</p><div className="table-wrap"><table className="data-table contract-table"><thead><tr><th>Data</th><th>Movimentação</th><th>Quantidade</th><th>Reserva</th></tr></thead><tbody>{movement.data.map((m) => <tr key={m.id}><td>{new Date(m.occurred_at).toLocaleString('pt-BR')}</td><td>{({ OPENING:'Abertura',ORIGINAL_ITEM_COMPLEMENT:'Complemento de item original',AMENDMENT:'Alteração contratual',RESERVE:'Reserva',RELEASE:'Liberação',CONSUMPTION:'Consumo',RECTIFICATION:'Retificação' })[m.movement_type] || m.movement_type}{m.movement_type==='ORIGINAL_ITEM_COMPLEMENT'?<><small>Documento: {m.details?.document_reference}</small><small>{m.details?.justification}</small></>:null}</td><td>{amount(m.quantity_delta)}</td><td>{amount(m.reserved_delta)}</td></tr>)}</tbody></table></div><div className="actions-inline"><button className="ghost-button" disabled={movement.page <= 1} onClick={async () => { const {data: result} = await contractControlAPI.itemMovements(contract.id,{item_id:movement.item.id,page:movement.page-1}); setMovement({...movement,...result}) }}>Anterior</button><span>Página {movement.page}</span><button className="ghost-button" disabled={movement.data.length < 50} onClick={async () => { const {data: result} = await contractControlAPI.itemMovements(contract.id,{item_id:movement.item.id,page:movement.page+1}); setMovement({...movement,...result}) }}>Próxima</button></div></Modal> : null}
  </section>
}

function ItemSetupDialog({ dialog, contract, items, providers, legacyPrices, onClose, onSuccess }) {
  const item = dialog.item || {}
  const initialPriceItem = items.find((r) => r.id === dialog.item_id) || (items.length === 1 ? items[0] : null)
  const [form, setForm] = useState({ code:item.code || '', original_number:item.original_number || '', description:item.description || '', category:item.category || (contract.kind === 'FUEL' ? 'FUEL':'SERVICE'), unit:item.unit || (contract.kind === 'FUEL' ? 'L' : 'UN'), product_key:item.product_key || '', group_key:item.group_key || '', original_quantity:item.original_quantity ?? '', original_unit_price:item.original_unit_price ?? '', item_id:initialPriceItem?.id || '', provider_id:providers.filter((p)=>p.active).length===1 ? providers.find((p)=>p.active).id : '', unit_price:initialPriceItem?.reference_unit_price ?? initialPriceItem?.original_unit_price ?? '', fuel_price_id:'', adjudication:'', document_reference:'', justification:'', history_confirmed:false })
  const [opening, setOpening] = useState(null)
  const [checkingOpening, setCheckingOpening] = useState(dialog.type === 'opening')
  const [openingFailed, setOpeningFailed] = useState(false)
  const [priceItem, setPriceItem] = useState(null)
  const openingRequest = useRef(0)
  const [quantities, setQuantities] = useState({})
  const [allocations, setAllocations] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [requestKey] = useState(() => crypto.randomUUID())
  const type=dialog.type
  const update=(name,value)=>setForm((s)=>({...s,[name]:value}))
  const reloadOpening = useCallback(async () => {
    const request = ++openingRequest.current
    setCheckingOpening(true); setOpeningFailed(false); setError('')
    try {
      const { data } = await contractControlAPI.quantityOpening(contract.id)
      if (request !== openingRequest.current) return false
      setOpening(data)
      return true
    } catch (err) {
      if (request === openingRequest.current) {
        setOpeningFailed(true)
        setError(getApiErrorMessage(err, 'Não foi possível conferir os preços e as reservas. Tente novamente.'))
      }
      return false
    } finally { if (request === openingRequest.current) setCheckingOpening(false) }
  }, [contract.id])
  useEffect(() => {
    const requests = openingRequest
    if (type === 'opening') reloadOpening()
    return () => { requests.current++ }
  }, [type, reloadOpening])
  const input=(name,label,options={})=>{ const Input=['original_unit_price','unit_price'].includes(name)?MoneyInput:'input'; return <label key={name} className={options.wide?'contract-form__wide':''}>{label}<Input {...(Input===MoneyInput?{precision:6}: {})} className="app-input" aria-label={label} required={options.required!==false} type={options.type||'text'} min={options.min} step={options.step} value={form[name]} onChange={(e)=>update(name,e.target.value)} maxLength={500}/></label> }
  const chosen=items.find((r)=>r.id===form.item_id)
  const fuelPrices=legacyPrices.filter((r)=>r.provider_id===form.provider_id && r.fuel_type===chosen?.product_key && !r.deleted_at && (!r.valid_from || new Date(r.valid_from)<=new Date()) && (!r.valid_until || new Date(r.valid_until)>new Date()))
  const openingItems = (opening?.items || items).filter((r) => r.active !== false)
  const missingPrices = openingItems.filter((r) => !opening?.prices?.some((p) => p.item_id === r.id && p.current))
  const openingReady = opening && !checkingOpening && !openingFailed && !opening.opened && openingItems.length > 0 && !missingPrices.length
  const isFuel = contract.kind === 'FUEL'
  async function submit(event) {
    event.preventDefault()
    if (type === 'opening' && !openingReady) return
    setSaving(true); setError('')
    try {
      if(type==='item') {
        const payload=Object.fromEntries(['code','original_number','description','category','unit','product_key','group_key','original_quantity','original_unit_price'].map((k)=>[k,form[k]||null]))
        // The initial reference starts at the original price; existing amendment references are never reset here.
        payload.reference_unit_price = item.reference_unit_price ?? form.original_unit_price
        if(item.id) await contractControlAPI.updateItem(contract.id,item.id,payload); else await contractControlAPI.createItem(contract.id,payload)
      }
      if(type==='price') await contractControlAPI.itemPrice(contract.id,{item_id:form.item_id,provider_id:form.provider_id,unit_price:form.unit_price,fuel_price_id:form.fuel_price_id||null})
      if(type==='opening') await contractControlAPI.openQuantities(contract.id,{adjudication:form.adjudication,document_reference:form.document_reference,justification:form.justification,history_confirmed:form.history_confirmed,request_key:requestKey,
        items:openingItems.map((r)=>({item_id:r.id,remaining_quantity:quantities[r.id]?.remaining ?? '',historical_added_quantity:quantities[r.id]?.added ?? ''})),
        reservations:(opening?.reservations||[]).map((r)=>({reservation_id:r.id,lines:itemLinesPayload(allocations[r.id]||[])}))})
      onSuccess(); onClose()
    } catch(err) {
      const message = getApiErrorMessage(err,'Não foi possível salvar. Confira os dados.')
      if (type === 'opening' && message.includes('Vincule ao menos um preço vigente')) {
        if (await reloadOpening()) setError('Um preço mudou ou deixou de valer. Confira os itens pendentes abaixo e informe quem fornece cada item e o preço cobrado.')
      } else setError(message)
    } finally {setSaving(false)}
  }
  return <><Modal open title={type==='item'?'Item do contrato':type==='price'?'Vincular preço ao item':'Conferir abertura das quantidades'} onClose={onClose} canClose={!saving} className="contract-item-editor"><form className="contract-form" onSubmit={submit}>
    {error?<div className="alert alert-error contract-form__wide" role="alert">{error}</div>:null}
    {type==='item'?<>{input('code','Código permanente do item')}{input('original_number','Número no contrato original')}{input('description','Descrição',{wide:true})}<label>Categoria<select className="app-select" value={form.category} onChange={(e)=>update('category',e.target.value)}>{Object.entries(categories).filter(([k])=>contract.kind==='FUEL'?['FUEL','ADDITIVE'].includes(k):['SERVICE','PART'].includes(k)).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>{input('unit','Unidade de medida')}{['FUEL','ADDITIVE'].includes(form.category)?<label>Produto correspondente<select className="app-select" required value={form.product_key} onChange={(e)=>update('product_key',e.target.value)}><option value="">Selecione</option>{(form.category==='FUEL'?FUEL_TYPE_OPTIONS:ADDITIVE_TYPE_OPTIONS).filter((r)=>r!=='Outro').map((r)=><option key={r} value={r.toUpperCase()}>{r}</option>)}</select></label>:null}{input('group_key','Lote/grupo (se aplicável)',{required:false})}{input('original_quantity','Quantidade original',{type:'number',min:'.001',step:'.001'})}{input('original_unit_price','Preço unitário original (R$)',{type:'number',min:'.000001',step:'.000001'})}<p className="muted contract-form__wide">Informe os dados do contrato original. Reajustes e revisões são registrados em Registrar aditivo. As quantidades restantes serão conferidas na abertura.</p></>:null}
    {type==='price'?<>
      <p className="muted contract-form__wide">Selecione quem fornece o item e confira o preço cobrado nos pedidos. O valor sugerido pode ser corrigido antes de salvar.</p>
      {!providers.some((r) => r.active) ? <p className="contract-pending-note contract-form__wide">Primeiro, adicione {isFuel ? 'um posto' : 'uma oficina ou prestador'} na seção Rede executante deste contrato. Depois, volte para informar o preço do item.</p> : null}
      <label>Item<select className="app-select" required value={form.item_id} onChange={(e)=>{const selected=items.find((r)=>r.id===e.target.value);setForm({...form,item_id:e.target.value,fuel_price_id:'',unit_price:selected?.reference_unit_price??selected?.original_unit_price??''})}}><option value="">Selecione</option>{items.filter((r)=>r.active!==false).map((r)=><option key={r.id} value={r.id}>{r.code} · {r.description}</option>)}</select></label>
      <label>{isFuel ? 'Posto / fornecedor' : 'Oficina / prestador'}<select className="app-select" required value={form.provider_id} onChange={(e)=>setForm({...form,provider_id:e.target.value,fuel_price_id:'',unit_price:chosen?.reference_unit_price??chosen?.original_unit_price??''})}><option value="">Selecione</option>{providers.filter((r)=>r.active).map((r)=><option key={r.id} value={r.id}>{r.station_name||r.name}</option>)}</select></label>
      {fuelPrices.length?<label className="contract-form__wide">Preço já cadastrado<select className="app-select" value={form.fuel_price_id} onChange={(e)=>{const p=fuelPrices.find((r)=>r.id===e.target.value);setForm({...form,fuel_price_id:e.target.value,unit_price:p?.unit_price??chosen?.reference_unit_price??chosen?.original_unit_price??''})}}><option value="">Cadastrar nova versão</option>{fuelPrices.map((r)=><option key={r.id} value={r.id}>{r.fuel_type} · {r.unit_price}</option>)}</select></label>:null}
      {input('unit_price','Preço unitário cobrado (R$)',{type:'number',min:'.000001',step:'.000001'})}
    </>:null}
    {type === 'opening' ? <>
      {checkingOpening ? <p className="contract-form__wide" role="status">Conferindo preços e reservas…</p> : null}
      {!checkingOpening && !openingFailed && opening && !opening.opened && missingPrices.length ? <ItemPriceReadiness items={missingPrices} isFuel={isFuel} onPrice={setPriceItem} /> : null}
      {opening && !checkingOpening && !openingItems.length ? <p className="contract-pending-note contract-form__wide">Cadastre ao menos um item ativo antes de conferir as quantidades.</p> : null}
      {openingReady ? <p className="contract-ready-note contract-form__wide">Todos os itens já têm {isFuel ? 'posto' : 'oficina ou prestador'} e preço informados.</p> : null}
      {opening?.opened ? <p className="contract-pending-note contract-form__wide">As quantidades já foram conferidas. Feche esta janela para consultar a posição atual.</p> : null}
      <div className="contract-form__wide"><button type="button" className="ghost-button" onClick={() => reloadOpening()} disabled={checkingOpening || saving}>Atualizar verificação de preços</button></div>
    </> : null}
    {type==='opening'?<><p className="muted contract-form__wide">Informe as quantidades ainda não executadas, incluindo pedidos reservados. O sistema abaterá as reservas abaixo para mostrar o disponível.</p><label>Adjudicação / base do limite<select className="app-select" required value={form.adjudication} onChange={(e)=>update('adjudication',e.target.value)}><option value="">Conferir no edital/contrato</option><option value="ITEM">Por item</option><option value="GROUP">Por lote/grupo</option><option value="GLOBAL">Global</option></select></label>{input('document_reference','Documento de conferência')}<div className="table-wrap contract-form__wide"><table className="data-table contract-table"><thead><tr><th>Item</th><th>Restante não executado</th><th>Acréscimos anteriores (quantidade)</th></tr></thead><tbody>{openingItems.map((r)=><tr key={r.id}><td data-label="Item">{r.code} · {r.description}<small>{r.unit} · original {amount(r.original_quantity)}</small></td><td data-label="Restante não executado"><input className="app-input" aria-label={`Restante ${r.code}`} type="number" min="0" step=".001" required value={quantities[r.id]?.remaining ?? ''} onChange={(e)=>setQuantities({...quantities,[r.id]:{...quantities[r.id],remaining:e.target.value}})}/></td><td data-label="Acréscimos anteriores"><input className="app-input" aria-label={`Acréscimos anteriores ${r.code}`} type="number" min="0" step=".001" required value={quantities[r.id]?.added ?? ''} onChange={(e)=>setQuantities({...quantities,[r.id]:{...quantities[r.id],added:e.target.value}})}/></td></tr>)}</tbody></table></div>{!opening?<p role="status">Consultando reservas abertas…</p>:opening.reservations.length?<section className="contract-form__wide"><h4>Distribuir reservas existentes</h4>{opening.reservations.map((r)=><details key={r.id}><summary>{r.source_type==='FUEL_ORDER'?'Abastecimento':'Manutenção'} · {String(r.source_id).slice(0,8)} · {brl(r.amount)} {r.liters?` · ${r.liters} L ${r.fuel_type}`:''}</summary><ContractItemLines label="Itens da reserva herdada" items={openingItems} lines={allocations[r.id]||[]} onChange={(lines)=>setAllocations({...allocations,[r.id]:lines})}/></details>)}</section>:<p className="muted contract-form__wide">Nenhuma reserva aberta para distribuir.</p>}<label className="contract-form__wide">Justificativa<textarea className="app-textarea" required minLength={10} value={form.justification} onChange={(e)=>update('justification',e.target.value)}/></label><label className="contract-form__wide contract-check"><input type="checkbox" required checked={form.history_confirmed} onChange={(e)=>update('history_confirmed',e.target.checked)}/>Conferi os itens, a base de adjudicação, os acréscimos anteriores e as reservas abertas.</label></>:null}
    <div className="contract-editor-footer contract-form__wide"><button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Voltar</button><button className="app-button" disabled={saving||(type==='opening'&&!openingReady)||(type==='price'&&!providers.some((r)=>r.active))}>{saving?'Salvando…':type==='opening'?'Confirmar abertura':'Salvar'}</button></div>
  </form></Modal>
  {type === 'opening' && priceItem ? <ItemSetupDialog
    dialog={{ type: 'price', item_id: priceItem }} contract={contract} items={openingItems}
    providers={providers} legacyPrices={legacyPrices} onClose={() => setPriceItem(null)}
    onSuccess={() => { reloadOpening(); onSuccess() }}
  /> : null}</>
}
