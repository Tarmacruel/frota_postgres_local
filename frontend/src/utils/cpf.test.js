import { expect, it } from 'vitest'
import { getCpfError } from './cpf'

it.each(['52998224725', '529.982.247-25', '12345678909'])('aceita CPF válido %s', (cpf) => {
  expect(getCpfError(cpf)).toBe('')
})

it.each(['52998224724', '11111111111', '00000000000'])('explica dígitos inválidos em %s', (cpf) => {
  expect(getCpfError(cpf)).toContain('dígitos verificadores não conferem')
})

it.each(['', '123', '529982247250'])('explica quantidade de números inválida em %s', (cpf) => {
  expect(getCpfError(cpf)).toContain('11 números')
})
