import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PossessionReturnPhotos from './PossessionReturnPhotos'

function Harness() {
  const [files, setFiles] = useState([])
  return <PossessionReturnPhotos files={files} onChange={setFiles} />
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => `blob:test-${Math.random()}`)
  URL.revokeObjectURL = vi.fn()
})

describe('Fotos da devolução', () => {
  it('seleciona, amplia e remove uma foto sem exigir localização', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.upload(screen.getByLabelText('Selecionar fotos da devolução'), new File(['png'], 'avaria.png', { type: 'image/png' }))
    expect(screen.getByText('1 de 10 fotos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ampliar avaria.png' }))
    expect(screen.getByRole('dialog', { name: 'Foto da devolução' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Remover avaria.png' }))
    expect(screen.getByText('0 de 10 fotos')).toBeInTheDocument()
    expect(URL.revokeObjectURL).toHaveBeenCalled()
  })

  it('recusa formato e tamanho inválidos e conserva a foto válida', async () => {
    render(<Harness />)
    const big = new File(['big'], 'grande.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 8 * 1024 * 1024 + 1 })
    fireEvent.change(screen.getByLabelText('Selecionar fotos da devolução'), { target: { files: [
      new File(['x'], 'valida.png', { type: 'image/png' }), new File(['x'], 'texto.txt', { type: 'text/plain' }), big,
    ] } })
    expect(screen.getByRole('alert')).toHaveTextContent('texto.txt: use JPG, PNG ou WEBP.')
    expect(screen.getByRole('alert')).toHaveTextContent('grande.png')
    expect(screen.getByText('1 de 10 fotos')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remover valida.png' })).toBeInTheDocument())
  })

  it('limita a quantidade e bloqueia alterações durante o envio', () => {
    const files = Array.from({ length: 11 }, (_, index) => new File(['x'], `${index}.png`, { type: 'image/png' }))
    const { unmount } = render(<Harness />)
    fireEvent.change(screen.getByLabelText('Selecionar fotos da devolução'), { target: { files } })
    expect(screen.getByText('10 de 10 fotos')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('no máximo 10 fotos')
    unmount()
    render(<PossessionReturnPhotos files={[]} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('button', { name: 'Selecionar fotos' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Usar câmera' })).toBeDisabled()
  })
})
