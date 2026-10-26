import { formatContractMoney as brl } from '../../utils/contractBalance'

import { itemLineTotal, itemLinesTotal } from '../../utils/contractItemLines'

export default function ContractItemLines({ lines, onChange, items = [], prices = [], actual = false, allowUnknown = false, label = 'Itens do pedido' }) {
  const change = (index, patch) => onChange(lines.map((r, i) => i === index ? { ...r, ...patch } : r))
  function select(index, value) {
    const item = items.find((r) => r.id === value)
    const price = prices.find((r) => r.item_id === value && r.current !== false)
    const unit = price?.unit_price ?? ''
    change(index, { item_id: value, description: item?.description || '', category: item?.category || 'SERVICE', unit: item?.unit || '',
      quantity: lines[index].quantity || '1', unit_price: unit, expected_price_id: price?.id,
      ...(actual ? { amount: unit === '' ? '' : (Number(lines[index].quantity || 1)*Number(unit)).toFixed(2) } : {}) })
  }
  return <section className="contract-item-lines contract-form__wide" aria-label={label}>
    <div className="contract-order-panel__heading"><h4>{label}</h4><button type="button" className="ghost-button" onClick={() => onChange([...lines, { key: crypto.randomUUID(), item_id: '', quantity: '', unit_price: '', ...(actual ? { amount: '' } : {}) }])}>Adicionar item</button></div>
    {lines.map((line, index) => <div className="contract-item-lines__row" key={line.key || `${line.item_id}:${index}`}>
      <label>Item<select className="app-select" aria-label={`Item ${index+1}`} value={line.item_id || ''} onChange={(e) => select(index, e.target.value)} required={!allowUnknown}>
        <option value="">{allowUnknown ? 'Item sem vínculo contratual' : 'Selecione o item'}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ''}{item.description}</option>)}
        {line.item_id && !items.some((r) => r.id === line.item_id) ? <option value={line.item_id}>{line.description || 'Item reservado'}</option> : null}
      </select></label>
      <label>Quantidade {line.unit ? `(${line.unit})` : ''}<input className="app-input" aria-label={`Quantidade do item ${index+1}`} type="number" min=".001" step=".001" value={line.quantity} onChange={(e) => change(index, { quantity: e.target.value })} required /></label>
      <label>{actual ? 'Valor realizado (R$)' : 'Preço unitário (R$)'}<input className="app-input" aria-label={`${actual ? 'Valor' : 'Preço'} do item ${index+1}`} type="number" min="0" step={actual ? '.01' : '.000001'} value={actual ? line.amount ?? '' : line.unit_price} readOnly={!actual && prices.length > 0} onChange={(e) => change(index, actual ? { amount: e.target.value } : { unit_price: e.target.value })} required /></label>
      <span className="contract-item-lines__total">{brl(itemLineTotal(line))}</span><button type="button" className="ghost-button" aria-label={`Remover item ${index+1}`} onClick={() => onChange(lines.filter((_, i) => i !== index))}>Remover</button>
      {allowUnknown && !line.item_id ? <><label className="contract-item-lines__description">Descrição<input className="app-input" value={line.description || ''} onChange={(e) => change(index, { description: e.target.value })} required maxLength={500} /></label><label>Categoria<select className="app-select" value={line.category || 'SERVICE'} onChange={(e) => change(index, { category: e.target.value })}><option value="SERVICE">Serviço</option><option value="PART">Peça</option></select></label><small className="contract-form__wide">O gasto real será registrado com divergência até a identificação do item no contrato.</small></> : null}
    </div>)}
    {!lines.length ? <p className="muted">Adicione os itens e informe suas quantidades.</p> : <p className="contract-item-lines__sum">Total dos itens <strong>{brl(itemLinesTotal(lines))}</strong></p>}
  </section>
}
