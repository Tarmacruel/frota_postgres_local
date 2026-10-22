import { describe, expect, it } from 'vitest'
import { formatCnhDate, getCnhAlert, getCnhDaysLeft, getCnhIssues } from './driverLicense'

const today = new Date(2026, 9, 21, 23, 59)
const complete = { cnh_numero: '00123456789', cnh_validade: '2026-10-21' }
describe('pendências da CNH por dia de calendário', () => {
  it('reúne número e validade ausentes, incluindo espaços em branco', () => {
    expect(getCnhIssues({ cnh_numero: '  ' }, today).map((item) => item.code)).toEqual(['missing_number', 'missing_expiry'])
    expect(getCnhIssues(null, today)).toEqual([])
  })
  it('considera hoje válido e ontem vencido sem deslocamento de fuso', () => {
    expect(getCnhDaysLeft(complete.cnh_validade, today)).toBe(0)
    expect(getCnhIssues(complete, today)).toEqual([])
    expect(getCnhIssues({ ...complete, cnh_validade: '2026-10-20' }, today)[0].code).toBe('expired')
    expect(formatCnhDate('2026-10-21')).toBe('21/10/2026')
  })
  it('mostra simultaneamente número ausente e vencimento', () => {
    expect(getCnhIssues({ cnh_validade: '2020-01-01' }, today).map((item) => item.code)).toEqual(['missing_number', 'expired'])
  })
  it('trata data inválida como validade não informada e aceita ano bissexto', () => {
    expect(getCnhDaysLeft('2026-02-30', today)).toBeNull()
    expect(getCnhDaysLeft('2028-02-29', new Date(2028, 1, 28))).toBe(1)
  })
  it('preserva alerta de vencimento próximo para cadastro completo', () => {
    expect(getCnhAlert(complete, today)[0].label).toBe('Vence hoje')
    expect(getCnhAlert({ ...complete, cnh_validade: '2026-11-20' }, today)[0].label).toBe('Vence em 30 dias')
    expect(getCnhAlert({ ...complete, cnh_validade: '2027-10-21' }, today)).toEqual([])
  })
})
