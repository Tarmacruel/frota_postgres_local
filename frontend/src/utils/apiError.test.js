import { describe, expect, it } from 'vitest'

import { getApiErrorMessage } from './apiError'

describe('getApiErrorMessage', () => {
  it('preserva a mensagem estruturada da API e a referência da requisição', () => {
    const error = {
      response: {
        data: {
          detail: {
            code: 'ACTIVE_POSSESSION_EXISTS',
            message: 'Já existe uma posse ativa para este veículo.',
          },
          request_id: 'req-123',
        },
      },
    }

    expect(getApiErrorMessage(error)).toBe(
      'Já existe uma posse ativa para este veículo. (referência: req-123)',
    )
  })

  it('combina os detalhes de validação devolvidos pelo FastAPI', () => {
    const error = {
      response: {
        data: {
          detail: [{ msg: 'Campo obrigatório.' }, { msg: 'Valor inválido.' }],
        },
      },
    }

    expect(getApiErrorMessage(error)).toBe('Campo obrigatório. Valor inválido.')
  })

  it('usa o fallback sem expor a estrutura interna do erro', () => {
    const error = { response: { data: { detail: { code: 'UNKNOWN' } } } }

    expect(getApiErrorMessage(error, 'Operação indisponível.')).toBe('Operação indisponível.')
  })

  it('aceita o request id enviado no cabeçalho', () => {
    const error = {
      message: 'Falha de rede.',
      response: { data: {}, headers: { 'x-request-id': 'req-header' } },
    }

    expect(getApiErrorMessage(error)).toBe('Falha de rede. (referência: req-header)')
  })
})
