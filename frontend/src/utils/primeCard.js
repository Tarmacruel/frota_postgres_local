export function formatPrimeCardNumber(value) {
  return String(value ?? '').replace(/[^0-9]/g, '').slice(0, 16).replace(/(.{4})(?=.)/g, '$1 ')
}
