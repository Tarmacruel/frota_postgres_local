import { useState } from 'react'
import Modal from '../Modal'
import MoneyInput from '../MoneyInput'
import { contractControlAPI } from '../../api/contractControl'
import { getApiErrorMessage } from '../../utils/apiError'
import { FUEL_TYPE_OPTIONS, ADDITIVE_TYPE_OPTIONS } from '../../utils/fuelSupplyDetails'

const categories = { FUEL: 'Combustível', ADDITIVE: 'Aditivo / ARLA', SERVICE: 'Serviço', PART: 'Peça' }

export default function OriginalContractItemForm({ contract, providers = [], legacyPrices = [], adjudication, onClose, onSuccess }) {
  const isFuel = contract.kind === 'FUEL'
  const network = isFuel && contract.fuel_pricing_mode === 'NETWORK_VALUE'
  const activeProviders = providers.filter((p) => p.active)
  const [form, setForm] = useState({ code: '', original_number: '', description: '', category: isFuel ? 'FUEL' : 'SERVICE',
    unit: isFuel ? 'L' : 'UN', product_key: '', group_key: '', original_quantity: '', original_unit_price: '',
    remaining_quantity: '', historical_added_quantity: '', document_reference: '', justification: '', original_contract_confirmed: false })
  const [assignments, setAssignments] = useState(() => activeProviders.length === 1
    ? { [activeProviders[0].id]: { unit_price: '', fuel_price_id: '', manual: false } } : {})
  const [requestKey] = useState(() => crypto.randomUUID())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const update = (name, value) => setForm((current) => ({ ...current, [name]: value }))
  function matchingPrices(providerId, values = form) {
    const now = new Date()
    return values.category === 'FUEL' ? legacyPrices.filter((p) => p.provider_id === providerId
      && p.fuel_type === values.product_key && !p.deleted_at
      && (!p.valid_from || new Date(p.valid_from) <= now) && (!p.valid_until || new Date(p.valid_until) > now)) : []
  }
  function suggestedPrice(providerId, values = form) {
    const prices = matchingPrices(providerId, values)
    return prices.length === 1 ? { unit_price: prices[0].unit_price, fuel_price_id: prices[0].id, manual: true }
      : { unit_price: values.original_unit_price, fuel_price_id: '', manual: false }
  }
  function changeProduct(patch) {
    const next = { ...form, ...patch }
    setForm(next)
    setAssignments((current) => Object.fromEntries(Object.keys(current).map((id) => [id, suggestedPrice(id, next)])))
  }
  function changeOriginalPrice(value) {
    update('original_unit_price', value)
    setAssignments((current) => Object.fromEntries(Object.entries(current).map(([id, row]) =>
      [id, row.manual ? row : { ...row, unit_price: value }])))
  }
  function textInput(name, label, options = {}) {
    return <label className={options.wide ? 'contract-form__wide' : ''}>{label}<input className="app-input"
      aria-label={label} value={form[name]} onChange={(e) => update(name, e.target.value)} required={options.required !== false}
      type={options.type || 'text'} min={options.min} step={options.step} maxLength={options.maxLength || 80} /></label>
  }
  async function submit(event) {
    event.preventDefault()
    const prices = network ? [] : activeProviders.filter((p) => assignments[p.id]).map((p) => ({
      provider_id: p.id, unit_price: assignments[p.id].unit_price, fuel_price_id: assignments[p.id].fuel_price_id || null,
    }))
    if (!network && !prices.length) { setError('Selecione ao menos uma oficina/posto e confira o preço cobrado.'); return }
    setSaving(true); setError('')
    try {
      await contractControlAPI.complementOriginalItem(contract.id, { ...form,
        product_key: ['FUEL', 'ADDITIVE'].includes(form.category) ? form.product_key : null,
        group_key: form.group_key || null, request_key: requestKey, prices })
      onSuccess(); onClose()
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível incluir o item. Os dados foram mantidos para conferência.')) }
    finally { setSaving(false) }
  }
  return <Modal open title="Adicionar item original" onClose={onClose} canClose={!saving} className="contract-item-editor">
    <form className="contract-amendment-form" onSubmit={submit}>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <p className="muted">Complete o cadastro de um item que já consta no contrato original. O saldo financeiro e os pedidos anteriores permanecem iguais.</p>
      <section className="contract-editor-section"><h3>Item do contrato original</h3><div className="contract-editor-grid">
        {textInput('code', 'Código permanente do item')}
        {textInput('original_number', 'Número no contrato original')}
        {textInput('description', 'Descrição', { wide: true, maxLength: 500 })}
        <label>Categoria<select className="app-select" value={form.category} onChange={(e) => changeProduct({ category: e.target.value, product_key: '' })}>
          {Object.entries(categories).filter(([key]) => isFuel ? ['FUEL', 'ADDITIVE'].includes(key) : ['SERVICE', 'PART'].includes(key))
            .map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        {textInput('unit', 'Unidade de medida', { maxLength: 30 })}
        {isFuel ? <label>Produto correspondente<select className="app-select" required value={form.product_key} onChange={(e) => changeProduct({ product_key: e.target.value })}>
          <option value="">Selecione</option>{(form.category === 'FUEL' ? FUEL_TYPE_OPTIONS : ADDITIVE_TYPE_OPTIONS).filter((p) => p !== 'Outro')
            .map((p) => <option key={p} value={p.toUpperCase()}>{p}</option>)}
        </select></label> : null}
        {textInput('group_key', adjudication === 'GROUP' ? 'Lote/grupo original' : 'Lote/grupo (se aplicável)', { required: adjudication === 'GROUP' })}
        {textInput('original_quantity', 'Quantidade original', { type: 'number', min: '.001', step: '.001' })}
        <label>Preço unitário original (R$)<MoneyInput className="app-input" aria-label="Preço unitário original (R$)" precision={6}
          min=".000001" required value={form.original_unit_price} onChange={(e) => changeOriginalPrice(e.target.value)} /></label>
      </div></section>
      <section className="contract-editor-section"><h3>Posição atual das quantidades</h3>
        <p className="muted">Informe o que ainda não foi executado. As reservas e os consumos já registrados nos outros itens serão preservados.</p>
        <div className="contract-editor-grid">
          {textInput('remaining_quantity', 'Quantidade restante não executada', { type: 'number', min: '0', step: '.001' })}
          {textInput('historical_added_quantity', 'Acréscimos anteriores (quantidade)', { type: 'number', min: '0', step: '.001' })}
        </div>
      </section>
      <section className="contract-editor-section"><h3>{isFuel ? 'Postos e preços' : 'Oficinas e preços'}</h3>
        {network ? <p className="muted">Na rede por valor, este cadastro acompanha as quantidades; o abastecimento continua usando o valor real do comprovante.</p> : <>
          <p className="muted">Selecione quem fornece o item e confira o preço usado nos próximos pedidos. Os preços dos itens existentes permanecem iguais.</p>
          {!activeProviders.length ? <p className="contract-pending-note">Adicione primeiro {isFuel ? 'um posto' : 'uma oficina'} na Rede executante do contrato.</p> : null}
          {activeProviders.map((provider) => {
            const selected = assignments[provider.id]
            const name = provider.station_name || provider.name
            const versions = matchingPrices(provider.id)
            return <div className="contract-original-provider" key={provider.id}>
              <label className="contract-check"><input type="checkbox" checked={Boolean(selected)} aria-label={`Vincular ${name}`}
                onChange={(e) => setAssignments((current) => { const next = { ...current }; if (e.target.checked) next[provider.id] = suggestedPrice(provider.id); else delete next[provider.id]; return next })} />{name}</label>
              {selected ? <div className="contract-editor-grid">
                {versions.length ? <label>Preço vigente já cadastrado<select className="app-select" required aria-label={`Preço vigente em ${name}`} value={selected.fuel_price_id}
                  onChange={(e) => { const existing = versions.find((p) => p.id === e.target.value); setAssignments((current) => ({ ...current,
                    [provider.id]: { unit_price: existing?.unit_price || form.original_unit_price, fuel_price_id: existing?.id || '', manual: Boolean(existing) } })) }}>
                  <option value="">Selecione a versão vigente</option>{versions.map((p) => <option key={p.id} value={p.id}>{p.fuel_type} · {Number(p.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 6 })}</option>)}
                </select></label> : null}
                <label>Preço unitário cobrado (R$)<MoneyInput className="app-input" aria-label={`Preço cobrado em ${name}`} precision={6} required
                  min=".000001" value={selected.unit_price} readOnly={Boolean(selected.fuel_price_id)} onChange={(e) => setAssignments((current) => ({ ...current,
                    [provider.id]: { ...current[provider.id], unit_price: e.target.value, manual: true } }))} /></label>
              </div> : null}
            </div>
          })}
        </>}
      </section>
      <section className="contract-editor-section"><h3>Conferência do cadastro</h3><div className="contract-editor-grid">
        {textInput('document_reference', 'Documento ou cláusula do contrato original', { wide: true, maxLength: 255 })}
        <label className="contract-form__wide">Justificativa da inclusão<textarea className="app-textarea" aria-label="Justificativa da inclusão" required minLength={10} maxLength={4000}
          value={form.justification} onChange={(e) => update('justification', e.target.value)} /></label>
        <label className="contract-check contract-form__wide"><input type="checkbox" required checked={form.original_contract_confirmed}
          onChange={(e) => update('original_contract_confirmed', e.target.checked)} />Confirmo que este item já consta no contrato original e que as quantidades e os acréscimos anteriores foram conferidos.</label>
      </div></section>
      <div className="contract-editor-footer"><button type="button" className="ghost-button" disabled={saving} onClick={onClose}>Voltar</button>
        <button className="app-button" disabled={saving || (!network && !activeProviders.length)}>{saving ? 'Incluindo…' : 'Incluir item original'}</button></div>
    </form>
  </Modal>
}
