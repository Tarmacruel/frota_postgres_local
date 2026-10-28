import GuidedForm, { FormSection as GuidedSection } from '../GuidedForm'
import { useState } from 'react'
import { contractControlAPI } from '../../api/contractControl'
import { paymentContractsAPI, paymentSuppliersAPI } from '../../api/paymentProcesses'
import { getApiErrorMessage } from '../../utils/apiError'
import { toDateTimeLocalValue } from '../../utils/datetime'
import { FUEL_TYPE_OPTIONS } from '../../utils/fuelSupplyDetails'
import Modal from '../Modal'
import MoneyInput from '../MoneyInput'
import { formatContractMoney as brl } from '../../utils/contractBalance'

const titles = { contract: 'Cadastrar contrato', edit: 'Editar contrato', opening: 'Confirmar saldo inicial',
  provider: 'Vincular prestador ao contrato', price: 'Cadastrar preço de combustível', priceEdit: 'Editar preço de combustível', priceDelete: 'Excluir preço de combustível', adjust: 'Ajustar saldo contratual',
  amend: 'Registrar aditivo', correction: 'Corrigir saldo disponível', resolve: 'Regularizar divergência', supplier: 'Cadastrar prestador', supplierEdit: 'Editar prestador' }

export default function ContractSetupDialog({ dialog, suppliers, stations, providers, onClose, onSuccess }) {
  const c = dialog.contract || {}
  const [form, setForm] = useState(() => ({
    number: c.number || '', supplier_id: c.supplier_id || '', kind: c.kind || 'FUEL', status: c.status || 'ACTIVE',
    fuel_pricing_mode: c.fuel_pricing_mode || 'FIXED_PRICE',
    valid_from: c.valid_from || '', valid_until: c.valid_until || '', value_initial: c.value_initial ?? '', value_updated: c.value_updated ?? '',
    notes: dialog.supplier?.notes || c.notes || '', contract_type: c.contract_type || '', object_description: c.object_description || '', balance: c.suggested_opening_balance ?? '', opening_date: toDateTimeLocalValue(new Date().toISOString()).slice(0, 10),
    justification: '', fuel_station_id: '', provider_id: '', fuel_type: 'Diesel S10', unit_price: dialog.price?.unit_price ?? '', price_from: '',
    amount: '', target_balance: c.available_balance ?? '', document_reference: '', amendment_number: '', value_delta: '', signed_at: '', amendment_until: '',
    name: dialog.supplier?.name || '', cnpj: dialog.supplier?.cnpj || '', active: dialog.supplier?.active ?? true,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const type = dialog.type
  const update = (name, value) => setForm((s) => ({ ...s, [name]: value }))
  const input = (name, label, options = {}) => {
    const Input = ['value_initial', 'value_updated', 'balance', 'unit_price', 'amount', 'value_delta', 'target_balance'].includes(name) ? MoneyInput : 'input'
    return <label key={name} className={options.wide ? 'contract-form__wide' : ''}>{label}
    <Input className="app-input" name={name} aria-label={label} value={form[name]} onChange={(e) => update(name, e.target.value)}
      {...(Input === MoneyInput ? { precision: name === 'unit_price' ? 6 : 2, allowNegative: ['amount', 'value_delta'].includes(name) } : {})}
      required={options.required !== false} type={options.type || 'text'} step={options.step} min={options.min} maxLength={options.maxLength || 255} readOnly={options.readOnly} /></label>
  }
  const select = (name, label, options) => <label key={name}>{label}<select className="app-select" aria-label={label} required disabled={type === 'edit' && c.control_opened && ['supplier_id','kind'].includes(name)} value={form[name]} onChange={(e) => update(name, e.target.value)}>
    <option value="">Selecione</option>{options.map(([value, title, disabled]) => <option key={value} value={value} disabled={disabled}>{title}</option>)}</select></label>
  const reason = <label className="contract-form__wide">Justificativa<textarea className="app-textarea" aria-label="Justificativa" minLength={10} maxLength={4000} required value={form.justification} onChange={(e) => update('justification', e.target.value)} /></label>
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('')
    try {
      let result
      if (type === 'contract' || type === 'edit') {
        const payload = { number: form.number, supplier_id: form.supplier_id, kind: form.kind, status: form.status,
          fuel_pricing_mode: form.kind === 'FUEL' ? form.fuel_pricing_mode : 'FIXED_PRICE',
          valid_from: form.valid_from || null, valid_until: form.valid_until || null,
          value_initial: form.value_initial === '' ? null : form.value_initial,
          value_updated: form.value_updated === '' ? null : form.value_updated, notes: form.notes || null,
          contract_type: form.contract_type || null, object_description: form.object_description || null }
        result = type === 'edit' ? await paymentContractsAPI.update(c.id, payload) : await paymentContractsAPI.create(payload)
      }
      if (type === 'opening') result = await contractControlAPI.opening(c.id, { balance: form.balance, opening_date: form.opening_date, justification: form.justification })
      if (type === 'provider') result = await contractControlAPI.provider(c.id, { supplier_id: form.supplier_id, fuel_station_id: c.kind === 'FUEL' ? form.fuel_station_id : null })
      if (type === 'price') result = await contractControlAPI.price(c.id, { provider_id: form.provider_id, fuel_type: form.fuel_type,
        unit_price: form.unit_price, valid_from: form.price_from ? new Date(form.price_from).toISOString() : null })
      if (type === 'priceEdit') result = await contractControlAPI.updatePrice(c.id, dialog.price.id, {
        unit_price: form.unit_price, valid_from: form.price_from ? new Date(form.price_from).toISOString() : null })
      if (type === 'priceDelete') result = await contractControlAPI.deletePrice(c.id, dialog.price.id)
      if (type === 'adjust') result = await contractControlAPI.adjust(c.id, { amount: form.amount, request_key: dialog.requestKey,
        justification: form.justification, document_reference: form.document_reference })
      if (type === 'correction') result = await contractControlAPI.correctBalance(c.id, {
        target_available_balance: form.target_balance, expected_available_balance: c.available_balance,
        request_key: dialog.requestKey, justification: form.justification })
      if (type === 'resolve') result = await contractControlAPI.resolve(c.id, { justification: form.justification })
      if (type === 'amend') result = await paymentContractsAPI.createAmendment(c.id, { number: form.amendment_number,
        amendment_type: 'Aditivo', value_delta: form.value_delta === '' ? null : form.value_delta,
        signed_at: form.signed_at || null, valid_until: form.amendment_until || null, notes: form.justification })
      if (type === 'supplier' || type === 'supplierEdit') {
        const payload = { name: form.name, cnpj: form.cnpj || null, active: form.active, notes: form.notes || null }
        result = type === 'supplierEdit' ? await paymentSuppliersAPI.update(dialog.supplier.id, payload) : await paymentSuppliersAPI.create(payload)
      }
      onSuccess(result?.data, type); onClose()
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível salvar. Confira os dados informados.')) }
    finally { setSaving(false) }
  }
  return <Modal open title={titles[type]} onClose={onClose} canClose={!saving}>
    <GuidedForm busy={saving} className="contract-form" onSubmit={submit}>
      {error ? <div className="alert alert-error contract-form__wide" role="alert">{error}</div> : null}
      {['contract', 'edit'].includes(type) ? <>
<GuidedSection title="Identificação" description="Confira a empresa, o objeto e a modalidade do contrato.">
        {input('number', 'Número do contrato')}
        {select('supplier_id', 'Empresa contratada', suppliers.map((s) => [s.id, s.name]))}
        {select('kind', 'Objeto do contrato', [['FUEL', 'Abastecimento'], ['MAINTENANCE', 'Manutenção veicular']])}
        {form.kind === 'FUEL' ? <>{select('fuel_pricing_mode', 'Controle do abastecimento', [['FIXED_PRICE', 'Preço contratado por litro'], ['NETWORK_VALUE', 'Rede credenciada por valor']])}
          {form.fuel_pricing_mode === 'NETWORK_VALUE' ? <p className="muted contract-form__wide">Os postos utilizam preços próprios. Não há cadastro de preço por litro nem reserva prévia. Somente o total real confirmado será descontado do contrato. Pedidos anteriores mantêm sua modalidade original.</p> : null}</> : null}
        {select('status', 'Situação', [['ACTIVE', 'Ativo'], ['SUSPENDED', 'Suspenso'], ['FINISHED', 'Encerrado'], ['CANCELLED', 'Cancelado']])}
</GuidedSection><GuidedSection title="Vigência e valores" description="Confira as datas e os valores do documento contratual.">
        {input('valid_from', 'Início da vigência', { type: 'date', readOnly: c.control_opened })}
        {input('valid_until', 'Fim da vigência', { type: 'date', readOnly: c.control_opened })}
        {input('value_initial', 'Valor inicial (R$)', { type: 'number', step: '.01', min: '0', required: false, readOnly: c.control_opened })}
        {input('value_updated', 'Valor atualizado (R$)', { type: 'number', step: '.01', min: '0', required: false, readOnly: c.control_opened })}
        {input('contract_type', 'Modalidade do contrato', { required: false })}
</GuidedSection><GuidedSection title="Objeto e observações" description="Complete a descrição e revise as informações antes de salvar.">
        <label className="contract-form__wide">Descrição do objeto<textarea className="app-textarea" value={form.object_description} onChange={(e) => update('object_description', e.target.value)} /></label>
        {c.control_opened ? <p className="muted contract-form__wide">O controle já foi iniciado. Para erro de digitação no disponível, use Corrigir saldo em Configuração. Limite e vigência devem ser alterados por aditivo; empresa e objeto ficam preservados.</p> : null}
        <label className="contract-form__wide">Observações<textarea className="app-textarea" value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label>
      </GuidedSection></> : null}
      {type === 'opening' ? <><p className="contract-form__wide">Contrato <strong>{c.number}</strong>. Confira o saldo livre na data informada. Despesas anteriores permanecem no histórico e não serão descontadas novamente.</p>
        {input('balance', 'Saldo inicial conferido (R$)', { type: 'number', min: '0', step: '.01' })}
        {input('opening_date', 'Data de início do controle', { type: 'date' })}{reason}</> : null}
      {type === 'provider' ? <>{select('supplier_id', 'Prestador executante', suppliers.filter((s) => s.active).map((s) => [s.id, `${s.name}${s.cnpj ? ' · '+s.cnpj : ''}`]))}
        {c.kind === 'FUEL' ? <>{select('fuel_station_id', 'Posto executante', stations.filter((s) => s.active).map((s) => [s.id,
          s.name, providers.some((p) => p.fuel_station_id === s.id)]))}
          <p className="muted contract-form__wide">O mesmo posto pode ser vinculado a vários contratos. Cada contrato mantém seus próprios preços e saldo. Postos já cadastrados neste contrato devem ser reativados no vínculo existente.</p></> : null}
        <p className="muted contract-form__wide">O prestador executante pode ser diferente da empresa contratada. Cadastre a empresa em Prestadores caso ainda não exista.</p></> : null}
      {type === 'price' ? <>{select('provider_id', 'Posto executante', providers.filter((p) => p.active && p.fuel_station_id).map((p) => [p.id, p.station_name || p.name]))}
        {select('fuel_type', 'Combustível', FUEL_TYPE_OPTIONS.filter((t) => t !== 'Outro').map((t) => [t, t]))}
        {input('unit_price', 'Preço por litro (R$)', { type: 'number', min: '.000001', step: '.000001' })}
        {input('price_from', 'Vigente a partir de (opcional)', { type: 'datetime-local', required: false })}
        <p className="muted contract-form__wide">Em branco, o novo preço começa agora. Pedidos já emitidos mantêm o preço e a reserva originais.</p></> : null}
      {['priceEdit', 'priceDelete'].includes(type) ? <p className="contract-form__wide"><strong>{dialog.price.station_name || dialog.price.provider_name}</strong><br />{dialog.price.fuel_type} · preço atual {Number(dialog.price.unit_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4, maximumFractionDigits: 6 })}</p> : null}
      {type === 'priceEdit' ? <>
        {input('unit_price', 'Preço por litro (R$)', { type: 'number', min: '.000001', step: '.000001' })}
        {input('price_from', 'Nova vigência a partir de (opcional)', { type: 'datetime-local', required: false })}
        <p className="muted contract-form__wide">A edição cria uma nova versão. Em branco, começa agora ou mantém o início de um preço agendado. Pedidos já emitidos mantêm o preço e a reserva originais.</p>
      </> : null}
      {type === 'priceDelete' ? <p className="contract-form__wide">Confirma a exclusão deste preço? Ele deixará de ser oferecido em novos pedidos. As reservas e os abastecimentos anteriores serão preservados, e o registro continuará disponível no histórico.</p> : null}
      {type === 'adjust' ? <>{input('amount', 'Valor do ajuste (R$)', { type: 'number', step: '.01' })}{input('document_reference', 'Documento ou referência')}
        <p className="muted contract-form__wide">Valor positivo acrescenta saldo; negativo reduz. O lançamento ficará no extrato.</p>{reason}</> : null}
      {type === 'correction' ? <>
        <p className="contract-form__wide">Contrato <strong>{c.number}</strong>. Informe o saldo que deve ficar disponível. A diferença será registrada no extrato com sua justificativa.</p>
        {input('target_balance', 'Saldo disponível correto (R$)', { min: '0' })}
        <dl className="contract-funding__summary contract-form__wide" aria-label="Prévia da correção do saldo">
          <div><dt>Disponível atual</dt><dd>{brl(c.available_balance)}</dd></div>
          <div><dt>Disponível após a correção</dt><dd>{form.target_balance === '' ? '—' : brl(form.target_balance)}</dd></div>
          <div><dt>Diferença a registrar</dt><dd>{form.target_balance === '' ? '—' : brl(Number(form.target_balance)-Number(c.available_balance))}</dd></div>
          <div><dt>Reservas preservadas</dt><dd>{brl(c.reserved_amount)}</dd></div>
        </dl>
        <p className="muted contract-form__wide">A correção preserva reservas, consumo, aditivos e lançamentos anteriores. Não altera o valor global do contrato.</p>
        {reason}
      </> : null}
      {type === 'amend' ? <>{input('amendment_number', 'Número do aditivo')}{input('signed_at', 'Assinatura do aditivo', { type: 'date', required: false })}
        {input('value_delta', 'Acréscimo ou redução (R$)', { type: 'number', step: '.01', required: false })}
        {input('amendment_until', 'Novo fim de vigência', { type: 'date', required: false })}{reason}</> : null}
      {type === 'resolve' ? <><p className="contract-form__wide">Confirme a conferência da divergência. O saldo disponível precisa estar recomposto para liberar novos pedidos.</p>{reason}</> : null}
      {['supplier', 'supplierEdit'].includes(type) ? <>{input('name', 'Nome ou razão social')}{input('cnpj', 'CNPJ', { required: false })}
        <label>Ativo<select className="app-select" value={String(form.active)} onChange={(e) => update('active', e.target.value === 'true')}><option value="true">Sim</option><option value="false">Não</option></select></label>
        <label className="contract-form__wide">Observações<textarea className="app-textarea" value={form.notes} onChange={(e) => update('notes', e.target.value)} /></label></> : null}
      <div className="actions-inline"><button className="ghost-button" type="button" disabled={saving} onClick={onClose}>Voltar</button><button className={type === 'priceDelete' ? 'mini-button danger' : 'app-button'} disabled={saving}>{saving ? 'Salvando…' : type === 'opening' ? 'Confirmar abertura do saldo' : type === 'priceDelete' ? 'Confirmar exclusão' : type === 'correction' ? 'Confirmar correção' : 'Salvar'}</button></div>
    </GuidedForm>
  </Modal>
}
