
export function normalizeReason(text) {
  return typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : ''
}

export function reasonKey(text) {
  return normalizeReason(text).toLocaleLowerCase('pt-BR')
}
