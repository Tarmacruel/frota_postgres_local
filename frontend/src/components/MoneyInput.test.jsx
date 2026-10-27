import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import MoneyInput from './MoneyInput'
import { formatMoneyInput, parseMoneyInput } from '../utils/moneyInput'

function Form({ initial = '', ...props }) {
  const [value, setValue] = useState(initial)
  return <form><MoneyInput aria-label="Valor" value={value} onChange={(e) => setValue(e.target.value)} {...props} /><output data-testid="canonical">{value}</output><button>Salvar</button></form>
}

it.each([
  ['R$ 6.835.452,50', '6835452.50'], ['6835452,50', '6835452.50'], ['6835452.50', '6835452.50'],
  ['1.234', '1234'], ['1.234,5', '1234.5'], ['0,00', '0.00'], ['', ''],
])('interpreta a colagem %s sem multiplicar ou perder centavos', (text, value) => {
  expect(parseMoneyInput(text)).toEqual({ valid: true, value })
})

it('preserva seis casas em preços e rejeita formato inválido ou precisão excedente', () => {
  expect(parseMoneyInput('R$ 8,123456', { precision: 6 }).value).toBe('8.123456')
  expect(formatMoneyInput('8.123456', { precision: 6 })).toBe('R$ 8,123456')
  for (const text of ['1,234', '1,234.56', '1e6', 'abc12', '1.23.45', '1,2,3', '-1,00']) expect(parseMoneyInput(text).valid).toBe(false)
  expect(parseMoneyInput('-R$ 1.234,56', { allowNegative: true }).value).toBe('-1234.56')
  expect(formatMoneyInput('6717878.88')).toBe('R$ 6.717.878,88')
})

it('permite digitar reais e centavos com agrupamento e enviar decimal canônico', async () => {
  const user = userEvent.setup()
  render(<Form />)
  const input = screen.getByLabelText('Valor')
  await user.type(input, '6835452,50')
  expect(input).toHaveValue('6.835.452,50')
  expect(screen.getByTestId('canonical')).toHaveTextContent('6835452.50')
  await user.tab()
  expect(input).toHaveValue('R$ 6.835.452,50')
})

it('aceita o ponto do teclado decimal e preserva a posição ao editar no meio', async () => {
  const user = userEvent.setup()
  render(<Form />)
  const input = screen.getByLabelText('Valor')
  await user.type(input, '1234.56')
  expect(input).toHaveValue('1.234,56')
  expect(screen.getByTestId('canonical')).toHaveTextContent('1234.56')
  input.setSelectionRange(1, 1)
  await user.keyboard('9')
  expect(input).toHaveValue('19.234,56')
  expect(input.selectionStart).toBe(2)
})

it('aceita colagem BRL e limpeza sem recuperar um valor antigo silenciosamente', async () => {
  const user = userEvent.setup()
  render(<Form initial="690380702.50" />)
  const input = screen.getByLabelText('Valor')
  await user.click(input)
  await user.clear(input)
  await user.paste('R$ 6.835.452,50')
  expect(input).toHaveValue('6.835.452,50')
  expect(screen.getByTestId('canonical')).toHaveTextContent('6835452.50')
  fireEvent.change(input, { target: { value: '6.835.452,501' } })
  expect(input.checkValidity()).toBe(false)
  expect(screen.getByTestId('canonical')).toBeEmptyDOMElement()
  await user.clear(input)
  expect(input).toHaveValue('')
  expect(input.checkValidity()).toBe(true)
})

it('mantém zero, negativos permitidos, limite mínimo e valores externos', async () => {
  const view = render(<MoneyInput aria-label="Valor" value="0" onChange={() => {}} min="0" />)
  expect(screen.getByLabelText('Valor')).toHaveValue('R$ 0,00')
  view.rerender(<MoneyInput aria-label="Valor" value="1234.56" onChange={() => {}} min="0" />)
  expect(screen.getByLabelText('Valor')).toHaveValue('R$ 1.234,56')
  view.unmount()
  render(<Form allowNegative />)
  await userEvent.type(screen.getByLabelText('Valor'), '-1234,50')
  expect(screen.getByTestId('canonical')).toHaveTextContent('-1234.50')
})

it('mantém rascunho inválido ao sair e voltar e permite limpar um campo opcional', async () => {
  const user = userEvent.setup()
  render(<Form />)
  const input = screen.getByLabelText('Valor')
  await user.click(input)
  await user.paste('12,345')
  await user.tab()
  await user.click(input)
  expect(input).toHaveValue('12,345')
  expect(input.checkValidity()).toBe(false)
  await user.clear(input)
  await user.tab()
  expect(input).toHaveValue('')
  expect(input.checkValidity()).toBe(true)
})

it('emite decimal canônico completo mesmo quando a digitação termina na vírgula', async () => {
  const user = userEvent.setup()
  render(<Form />)
  const input = screen.getByLabelText('Valor')
  await user.type(input, '183,')
  expect(input).toHaveValue('183,')
  expect(screen.getByTestId('canonical').textContent).toBe('183')
  await user.tab()
  expect(input).toHaveValue('R$ 183,00')
})

it('remove e insere dígitos na parte inteira de um valor agrupado com centavos', async () => {
  const user = userEvent.setup()
  render(<Form initial="1234.56" />)
  const input = screen.getByLabelText('Valor')
  await user.click(input)
  input.setSelectionRange(5, 5)
  await user.keyboard('{Backspace}')
  expect(input).toHaveValue('123,56')
  expect(screen.getByTestId('canonical').textContent).toBe('123.56')
  input.setSelectionRange(1, 1)
  await user.keyboard('9876')
  expect(input).toHaveValue('1.987.623,56')
  expect(screen.getByTestId('canonical').textContent).toBe('1987623.56')
})
