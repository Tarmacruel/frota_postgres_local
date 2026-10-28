import { expect, it } from 'vitest'
import { loanFeedback } from './loanFeedback'

it('não confunde falta de consulta de pendências com pendências reais', () => {
  const issue = loanFeedback('Atualize as pendências antes de continuar.')
  expect(issue.target).toBe('refresh')
  expect(issue.title).not.toContain('operações abertas')
})
it('mantém a mensagem do servidor e a referência ao orientar a versão atual', () => {
  const issue = loanFeedback({ response: { status: 409, data: { detail: { code: 'LOAN_VERSION_CONFLICT', message: 'A proposta foi alterada.' }, request_id: 'abc-123' } } })
  expect(issue.message).toBe('A proposta foi alterada. (referência: abc-123)')
  expect(issue.target).toBe('refresh')
})
it('expõe a referência mínima sem alterar ou presumir o odômetro', () => {
  const issue = loanFeedback({ response: { status: 409, data: { detail: { code: 'LOAN_ODOMETER_REVIEW', message: 'Confira o odômetro.', minimum_odometer_km: '123.4' } } } })
  expect(issue.guidance).toContain('123.4 km')
  expect(issue.target).toBe('delivery')
})
it('distingue erro de consulta de resultado incerto de gravação', () => {
  const error = { response: { status: 503, data: { detail: 'Serviço temporariamente indisponível.' } } }
  expect(loanFeedback(error, undefined, true).guidance).toContain('atualizar a consulta')
  expect(loanFeedback(error).guidance).toContain('antes de repetir uma gravação')
})
it('traduz o campo e o requisito da validação mantendo o detalhe técnico e a referência', () => {
  const issue = loanFeedback({ response: { status: 422, data: { detail: [{ loc: ['body', 'justification'], type: 'string_too_short', msg: 'String should have at least 15 characters', ctx: { min_length: 15 } }], request_id: 'field-ref' } } })
  expect(issue.message).toBe('Justificativa: informe pelo menos 15 caracteres. (referência: field-ref)')
  expect(issue.technicalMessage).toContain('String should have')
  expect(issue.target).toBe('review')
})
it('mensagem desconhecida não inventa uma causa ou remove o detalhe informado', () => {
  const issue = loanFeedback('Validação específica do registro.')
  expect(issue.message).toBe('Validação específica do registro.')
  expect(issue.title).toBe('Não foi possível concluir')
})
