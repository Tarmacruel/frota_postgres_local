export const FUEL_TYPE_OPTIONS = [
  'Gasolina comum',
  'Gasolina aditivada',
  'Etanol',
  'Diesel S10',
  'Diesel S500',
  'GNV',
  'Outro',
]

export const ADDITIVE_TYPE_OPTIONS = [
  'ARLA 32',
  'Aditivo combustível',
  'Outro',
]

export function resolveOptionValue(selectedValue, otherValue) {
  if (selectedValue === 'Outro') return otherValue.trim()
  return selectedValue
}

export function formatAdditiveDetails(record, formatNumber) {
  if (!record?.additive_type) return '-'
  if (!record.additive_quantity_liters) return record.additive_type
  return `${record.additive_type} (${formatNumber(record.additive_quantity_liters)} L)`
}
