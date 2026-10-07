import { expect, it } from 'vitest'
import { formatPrimeCardNumber } from './primeCard'

it('formats groups, preserves leading zeros and limits input to 16 digits', () => {
  expect(formatPrimeCardNumber('0000123456789012')).toBe('0000 1234 5678 9012')
  expect(formatPrimeCardNumber('0000 1234 5678 9012 9999')).toBe('0000 1234 5678 9012')
  expect(formatPrimeCardNumber('abc12345')).toBe('1234 5')
  expect(formatPrimeCardNumber(null)).toBe('')
})
