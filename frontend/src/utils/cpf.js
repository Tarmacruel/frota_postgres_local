export function getCpfError(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length !== 11) return 'CPF incompleto. Informe os 11 números do documento, incluindo os dois dígitos finais.'
  const numbers = [...digits].map(Number)
  const checkDigit = (length) => (numbers.slice(0, length).reduce((sum, digit, index) => sum + digit * (length + 1 - index), 0) * 10 % 11) % 10
  if (new Set(digits).size === 1 || numbers[9] !== checkDigit(9) || numbers[10] !== checkDigit(10)) {
    return 'CPF inválido: os dígitos verificadores não conferem. Confira todos os números com o documento do titular e corrija o CPF para continuar.'
  }
  return ''
}
