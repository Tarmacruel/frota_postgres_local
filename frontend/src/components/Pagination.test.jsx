import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Pagination from './Pagination'

it('mostra janela móvel, extremos e navegação acessível', () => {
  const onPageChange = vi.fn()
  const { rerender } = render(<Pagination currentPage={1} totalPages={31} onPageChange={onPageChange} />)
  expect(screen.getAllByRole('button', { name: /Página \d+/ })).toHaveLength(6)
  expect(screen.getByRole('button', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('button', { name: 'Página 6' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Próxima/ }))
  expect(onPageChange).toHaveBeenCalledWith(2)
  rerender(<Pagination currentPage={16} totalPages={31} onPageChange={onPageChange} />)
  expect(screen.getByRole('button', { name: 'Página 16' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('button', { name: 'Página 14' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Página 18' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Página 13' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Página 31' }))
  expect(onPageChange).toHaveBeenCalledWith(31)
})
