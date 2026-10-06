import { describe, expect, it } from 'vitest'
import { reasonKey } from './reasonSuggestions'
import REASON_PRESETS from '../../../backend/app/core/justification_presets.json'
const getReasonPresets = (context) => REASON_PRESETS[context] || []

describe('catálogo fixo e contextos separados', () => {
  it('mantém modelos específicos para retificação, cancelamento e ações de empréstimo', () => {
    expect(Object.keys(REASON_PRESETS)).toHaveLength(22)
    expect(getReasonPresets('fuel_supply').find((item) => item.id === 'receipt').text).toContain('Substituição do comprovante')
    expect(getReasonPresets('loan_accept')).not.toEqual(getReasonPresets('loan_reject'))
    expect(getReasonPresets('unknown')).toEqual([])
    expect(Object.values(REASON_PRESETS).flat().every((item) => !item.text.includes('após conferência'))).toBe(true)
  })
  it('normaliza somente espaços e caixa, mantendo acentos e pontuação', () => {
    expect(reasonKey('  CORREÇÃO   do cadastro ')).toBe(reasonKey('Correção do cadastro'))
    expect(reasonKey('Correção.')).not.toBe(reasonKey('Correcao'))
  })
})
