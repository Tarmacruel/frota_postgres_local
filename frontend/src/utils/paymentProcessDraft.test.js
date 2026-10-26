import { describe, expect, it, vi } from 'vitest'
import { assertPaymentOperationsCurrent, availablePaymentOperations, centsAmount, initialPaymentForm, mergePaymentSuggestions, operationMonth, operationReferences, operationSuggestions, paymentCents, paymentPayload } from './paymentProcessDraft'

const fuel = { id: 'op-1', source_id: 'supply-1', source_type: 'FUEL_SUPPLY', amount: '183.00', occurred_at: '2026-10-23T12:00:00Z', vehicle_plate: 'TST0001', organization_name: 'Secretaria A', provider_name: 'Posto da rede' }

describe('preparação do processo a partir de operações identificadas', () => {
  it('soma centavos sem resíduos binários e considera zero informado', () => {
    expect(operationSuggestions([{ ...fuel, amount: '0.10' }, { ...fuel, id: '2', amount: '0.20' }]).amount).toBe('0.30')
    expect(paymentCents('0')).toBe(0n)
    expect(centsAmount(paymentCents('1000.00') - paymentCents('1100,01'))).toBe('-100.01')
  })
  it('usa o mês da realização em Brasília, inclusive na mudança UTC do mês', () => {
    expect(operationMonth('2026-11-01T01:00:00Z')).toBe('2026-10')
    expect(operationMonth('2026-11-01T03:00:00Z')).toBe('2026-11')
  })
  it('somente preenche a secretaria quando os IDs das origens são iguais e conhecidos', () => {
    const other = { ...fuel, id: '2', occurred_at: '2026-11-23T12:00:00Z' }
    expect(operationSuggestions([fuel], {})).toMatchObject({ amount: '183.00', organization_id: '', unit_name: '', competence_month: '2026-10' })
    expect(operationSuggestions([fuel], { 'op-1': { organization_id: 'org-a' } })).toMatchObject({ organization_id: 'org-a', unit_name: 'Secretaria A' })
    expect(operationSuggestions([fuel, other], { 'op-1': { organization_id: 'org-a' }, 2: { responsible_organization_id: 'org-b' } })).toMatchObject({ organization_id: '', competence_month: '', amount: '366.00' })
  })
  it('protege campos informados manualmente quando muda a seleção de serviços', () => {
    expect(mergePaymentSuggestions({ amount: '500', competence_month: '2026-11', unit_name: 'Manual' }, { amount: '183', competence_month: '2026-10', unit_name: 'Nova' }, { amount: true, unit_name: true })).toEqual({ amount: '500', competence_month: '2026-10', unit_name: 'Manual' })
  })
  it('importa a empresa contratada sem confundi-la com o posto executante', () => {
    const form = initialPaymentForm(null, { id: 'contract', supplier_id: 'contracted-company', kind: 'FUEL' })
    const payload = paymentPayload({ ...form, process_number: 'P-01', ...operationSuggestions([fuel]) }, { operations: [fuel], sources: { 'op-1': { fuel_type: 'ETANOL', liters: 30 } } })
    expect(payload).toMatchObject({ contract_id: 'contract', supplier_id: 'contracted-company', amount: '183.00', stage: 'ASSEMBLY', competence_month: '2026-10-01', issue_date: null, due_date: null, invoice_number: null, paid_at: null })
    expect(payload.references).toEqual([expect.objectContaining({ reference_type: 'FUEL_SUPPLY', external_id: 'supply-1', description: expect.stringContaining('ETANOL · 30 L') })])
  })
  it('preserva referências e etapa na edição; permite limpar dados e mantém datas', () => {
    const form = initialPaymentForm({ id: 'invoice', process_number: 'P', amount: '0', paid_at: '2026-10-22', commitment_date: '2026-10-01', competence_month: '2026-10-01' })
    const payload = paymentPayload({ ...form, unit_name: '' }, { editing: true })
    expect(payload).toMatchObject({ amount: '0', unit_name: null, paid_at: '2026-10-22', commitment_date: '2026-10-01', competence_month: '2026-10-01' })
    expect(payload).not.toHaveProperty('stage')
    expect(payload).not.toHaveProperty('references')
  })
  it('mantém o vínculo exato e a descrição de manutenção nas referências', () => {
    expect(operationReferences([{ ...fuel, source_type: 'MAINTENANCE', source_id: 'record-exact' }], { 'op-1': { service_description: 'Troca dos pneus' } })).toEqual([expect.objectContaining({ external_id: 'record-exact', reference_type: 'MAINTENANCE', description: expect.stringContaining('Troca dos pneus') })])
  })
  it('consulta todas as páginas de operações disponíveis, excluindo as já conciliadas', async () => {
    const api = { operations: vi.fn().mockResolvedValueOnce({ data: { data: [fuel], pages: 2 } }).mockResolvedValueOnce({ data: { data: [{ ...fuel, id: '2' }, { ...fuel, id: '3', invoice_process_id: 'other' }], pages: 2 } }) }
    expect((await availablePaymentOperations(api, 'contract')).map((r) => r.id)).toEqual(['op-1', '2'])
    expect(api.operations).toHaveBeenLastCalledWith('contract', { unbilled: true, page: 2, limit: 200 })
  })
  it('bloqueia criação quando um serviço foi retificado ou reservado por outra fatura', () => {
    expect(() => assertPaymentOperationsCurrent([fuel], [{ ...fuel, amount: '184.00' }])).toThrow(/alterado/)
    expect(() => assertPaymentOperationsCurrent([fuel], [])).toThrow(/conciliado/)
    expect(() => assertPaymentOperationsCurrent([fuel], [{ ...fuel, invoice_process_id: 'another' }])).toThrow()
    expect(() => assertPaymentOperationsCurrent([fuel], [fuel])).not.toThrow()
  })
})
