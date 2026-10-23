export const emptyPaymentForm = {
  process_number: '', kind: 'FUEL', supplier_id: '', contract_id: '', organization_id: '', unit_name: '',
  invoice_number: '', billing_number: '', issue_date: '', competence_month: '', due_date: '', amount: '',
  commitment_number: '', commitment_date: '', liquidation_number: '', liquidation_date: '',
  payment_order_number: '', payment_order_date: '', paid_at: '', stage_owner: '', location: '', notes: '',
}

// API amounts have two decimal places. Keep proposal totals exact in cents;
// the server remains responsible for financial calculations and validation.
export function paymentCents(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return 0n
  const [whole, fraction = ''] = text.replace('-', '').split('.')
  return (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))) * (text.startsWith('-') ? -1n : 1n)
}

export function centsAmount(cents) {
  const positive = cents < 0n ? -cents : cents
  return `${cents < 0n ? '-' : ''}${positive / 100n}.${String(positive % 100n).padStart(2, '0')}`
}

export function operationMonth(date) {
  if (!date || Number.isNaN(new Date(date).getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date(date))
  return `${parts.find((p) => p.type === 'year').value}-${parts.find((p) => p.type === 'month').value}`
}

export function operationSuggestions(operations, sources = {}) {
  const total = operations.reduce((sum, operation) => sum + paymentCents(operation.amount), 0n)
  const months = new Set(operations.map((operation) => operationMonth(operation.occurred_at)))
  const orgIds = operations.map((operation) => {
    const source = sources[operation.id]
    return source?.responsible_organization_id || source?.organization_id || ''
  })
  const sameOrg = orgIds.length > 0 && orgIds.every((id) => id && id === orgIds[0])
  return {
    amount: operations.length ? centsAmount(total) : '',
    competence_month: months.size === 1 ? [...months][0] : '',
    organization_id: sameOrg ? orgIds[0] : '',
    unit_name: sameOrg ? operations[0].organization_name || '' : '',
  }
}

export function mergePaymentSuggestions(form, suggestions, touched = {}) {
  return { ...form, ...Object.fromEntries(Object.entries(suggestions).filter(([key]) => !touched[key])) }
}

export function initialPaymentForm(record, contract, organizationId = '') {
  if (record) return Object.fromEntries(Object.keys(emptyPaymentForm).map((key) => [key,
    key === 'competence_month' ? String(record[key] || '').slice(0, 7)
      : ['issue_date', 'due_date', 'paid_at', 'commitment_date', 'liquidation_date', 'payment_order_date'].includes(key)
        ? String(record[key] || '').slice(0, 10) : record[key] ?? emptyPaymentForm[key],
  ]))
  return { ...emptyPaymentForm, contract_id: contract?.id || '', supplier_id: contract?.supplier_id || '', kind: contract?.kind || 'FUEL', organization_id: organizationId }
}

export function operationReferences(operations, sources) {
  return operations.map((operation) => {
    const source = sources[operation.id]
    const maintenance = operation.source_type === 'MAINTENANCE'
    return {
      reference_type: maintenance ? 'MAINTENANCE' : 'FUEL_SUPPLY',
      external_id: operation.source_id,
      label: `${maintenance ? 'Manutenção' : 'Abastecimento'} · ${operation.vehicle_plate || operation.source_id.slice(0, 8)}`.slice(0, 180),
      description: [operation.organization_name, operation.provider_name, operation.occurred_at,
        source?.service_description, source?.fuel_type, source?.liters != null ? `${source.liters} L` : '',
        `Valor registrado: R$ ${centsAmount(paymentCents(operation.amount))}`].filter(Boolean).join(' · ').slice(0, 4000),
    }
  })
}

export function paymentPayload(form, { editing = false, operations = [], sources = {} } = {}) {
  const fields = { ...form, amount: form.amount === '' ? null : String(form.amount).replace(',', '.'),
    competence_month: form.competence_month ? `${form.competence_month}-01` : null,
    organization_id: form.organization_id || null, supplier_id: form.supplier_id || null, contract_id: form.contract_id || null,
  }
  // Explicit nulls allow clearing optional data on edit. Do not replace existing
  // references or stage when editing an already registered process.
  for (const key of Object.keys(fields)) if (fields[key] === '') fields[key] = null
  if (!editing) {
    fields.stage = 'ASSEMBLY'
    if (operations.length) fields.references = operationReferences(operations, sources)
  }
  return fields
}

export async function availablePaymentOperations(api, contractId) {
  const rows = []
  let page = 1
  let pages
  do {
    const { data } = await api.operations(contractId, { unbilled: true, page, limit: 200 })
    rows.push(...(data.data || []).filter((row) => !row.invoice_process_id))
    pages = data.pages || 1
    page++
  } while (page <= pages)
  return rows
}

export function assertPaymentOperationsCurrent(selected, available) {
  const current = new Map(available.map((row) => [row.id, row]))
  if (selected.some((row) => !current.has(row.id) || current.get(row.id).invoice_process_id
    || current.get(row.id).source_id !== row.source_id || paymentCents(current.get(row.id).amount) !== paymentCents(row.amount))) {
    throw new Error('Um serviço foi alterado ou conciliado em outro processo. Volte à origem e atualize a seleção. Seus dados da fatura foram mantidos.')
  }
}
