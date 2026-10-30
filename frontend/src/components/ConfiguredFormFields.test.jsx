import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { configureFields } from '../utils/formConfiguration'
import { readableInk } from '../utils/systemBranding'

it('renomeia e oculta opcionais sem retirar campos obrigatórios nem perder a primeira tecla', () => {
  function Form() {
    const [text, setText] = useState('')
    return <form>{configureFields(<><label>Marca<input id="brand" required value={text} onChange={(event) => setText(event.target.value)} /></label><label>Chassi<input id="chassi" /></label></>,
      { brand: { label: 'Fabricante', visible: false, required: true }, chassi: { label: 'Chassi', visible: false } })}</form>
  }
  render(<Form />)
  expect(screen.queryByLabelText('Chassi')).not.toBeInTheDocument()
  const input = screen.getByLabelText('Fabricante')
  fireEvent.change(input, { target: { value: 'F' } })
  expect(input).toHaveValue('F')
  fireEvent.change(input, { target: { value: 'Fo' } })
  expect(input).toHaveValue('Fo')
})

it('escolhe texto claro ou escuro conforme a cor do fundo', () => {
  expect(readableInk('#ffffff')).toBe('#000000')
  expect(readableInk('#000000')).toBe('#ffffff')
  expect(readableInk('#2452e8')).toBe('#ffffff')
})
