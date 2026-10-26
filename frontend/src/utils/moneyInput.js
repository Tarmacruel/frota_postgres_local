// API values are canonical decimals; user input follows Brazilian separators.
export function parseMoneyInput(value, { precision = 2, allowNegative = false } = {}) {
  let text = String(value ?? '').trim().replace(/^(-?)R\$\s*/i, '$1').replace(/[\s\u00a0\u202f]/g, '')
  if (!text) return { value: '', valid: true }
  const negative = text.startsWith('-')
  if (negative) text = text.slice(1)
  if (negative && !allowNegative) return { value: '', valid: false }
  if (!text) return { value: '', valid: false, draft: '-' }
  let integer, fraction
  if (text.includes(',')) {
    const pieces = text.split(',')
    if (pieces.length !== 2 || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(pieces[0]) || !/^\d*$/.test(pieces[1])) return { value: '', valid: false }
    integer = pieces[0].replace(/\./g, '')
    fraction = pieces[1]
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    integer = text.replace(/\./g, '')
  } else {
    if (!/^\d+(?:\.\d*)?$/.test(text)) return { value: '', valid: false }
    ;[integer, fraction] = text.split('.')
  }
  if (fraction?.length > precision) return { value: '', valid: false }
  integer = integer.replace(/^0+(?=\d)/, '')
  if (integer.length > 14) return { value: '', valid: false }
  const normalized = `${negative ? '-' : ''}${integer}${fraction !== undefined ? '.' + fraction : ''}`
  return { value: normalized, valid: true }
}

export function formatMoneyInput(value, { precision = 2, editing = false } = {}) {
  if (value === '' || value === null || value === undefined) return ''
  const text = String(value)
  if (!/^-?\d+(?:\.\d*)?$/.test(text)) return text
  const [integer, fraction] = text.split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const digits = editing ? fraction : (fraction || '').padEnd(2, '0')
  // Never round hidden digits. Price inputs may retain up to six decimals.
  if (digits?.length > precision) return text
  return `${editing ? '' : 'R$ '}${grouped}${digits !== undefined ? ',' + digits : ''}`
}
