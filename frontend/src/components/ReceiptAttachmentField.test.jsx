import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ReceiptAttachmentField from './ReceiptAttachmentField'

const originalCreate = URL.createObjectURL
const originalRevoke = URL.revokeObjectURL

beforeEach(() => {
  URL.createObjectURL = vi.fn((file) => `blob:preview-${file.name}`)
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  URL.createObjectURL = originalCreate
  URL.revokeObjectURL = originalRevoke
})

function Field({ onChange = () => {}, ...props }) {
  const [file, setFile] = useState(null)
  return <ReceiptAttachmentField id="receipt" required file={file} onChange={(next) => { setFile(next); onChange(next) }} {...props} />
}
const photo = () => new File(['foto fictícia'], 'foto.jpg', { type: 'image/jpeg' })

it('previews, enlarges and removes a photo, then permits selecting the same file again', async () => {
  const user = userEvent.setup()
  render(<Field />)
  const file = photo()
  await user.upload(screen.getByLabelText('Comprovante'), file)
  expect(screen.getByAltText('Prévia da foto do comprovante')).toHaveAttribute('src', 'blob:preview-foto.jpg')
  await user.click(screen.getByRole('button', { name: 'Ampliar foto do comprovante' }))
  expect(screen.getByRole('dialog', { name: 'Foto do comprovante' })).toBeVisible()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Remover comprovante' }))
  expect(screen.queryByAltText('Prévia da foto do comprovante')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Anexar comprovante' })).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Anexar comprovante' })).toHaveAttribute('data-form-value', '')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-foto.jpg')
  await user.upload(screen.getByLabelText('Comprovante'), file)
  expect(screen.getByText('foto.jpg')).toBeVisible()
})

it('uses the camera input for a single photo and keeps it if the picker is canceled', () => {
  const onChange = vi.fn()
  render(<Field onChange={onChange} />)
  const camera = screen.getByLabelText('Fotografar comprovante')
  expect(camera).toHaveAttribute('capture', 'environment')
  expect(camera).not.toHaveAttribute('multiple')
  const file = photo()
  fireEvent.change(camera, { target: { files: [file] } })
  expect(onChange).toHaveBeenLastCalledWith(file)
  expect(screen.getByRole('button', { name: 'Trocar comprovante' })).toHaveAttribute('data-form-value', 'selected')
  fireEvent.change(screen.getByLabelText('Comprovante'), { target: { files: [] } })
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(screen.getByText('foto.jpg')).toBeInTheDocument()
})

it('replaces a photo with a PDF and releases its local preview', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<Field onChange={onChange} />)
  await user.upload(screen.getByLabelText('Comprovante'), photo())
  const pdf = new File(['documento fictício'], 'nota.pdf', { type: 'application/pdf' })
  await user.upload(screen.getByLabelText('Comprovante'), pdf)
  expect(onChange).toHaveBeenLastCalledWith(pdf)
  expect(screen.getByText('nota.pdf')).toBeVisible()
  expect(screen.queryByAltText('Prévia da foto do comprovante')).not.toBeInTheDocument()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-foto.jpg')
})

it.each([
  ['invalido.txt', 'text/plain', 10, 'PDF, JPG, PNG ou WEBP'],
  ['grande.png', 'image/png', 8 * 1024 * 1024 + 1, 'no máximo 8 MB'],
  ['vazio.png', 'image/png', 0, 'está vazio'],
])('rejects %s before confirmation', (name, type, size, message) => {
  const onChange = vi.fn()
  render(<Field onChange={onChange} />)
  const file = new File(['teste'], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  fireEvent.change(screen.getByLabelText('Comprovante'), { target: { files: [file] } })
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(onChange).toHaveBeenLastCalledWith(null)
  expect(screen.getByRole('button', { name: 'Anexar comprovante' })).toHaveAttribute('data-form-value', '')
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})

it('releases the image URL on unmount and disables changes during saving', async () => {
  const user = userEvent.setup()
  const { rerender, unmount } = render(<Field />)
  await user.upload(screen.getByLabelText('Comprovante'), photo())
  rerender(<Field disabled />)
  expect(screen.getByRole('button', { name: 'Trocar comprovante' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Remover comprovante' })).toBeDisabled()
  expect(screen.getByLabelText('Fotografar comprovante')).toBeDisabled()
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-foto.jpg')
})
