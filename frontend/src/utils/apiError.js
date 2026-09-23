const validationHints = {
  cpf: 'CPF inválido. Confira os 11 números, incluindo os dois dígitos finais, com o documento do titular.',
  email: 'E-mail inválido. Informe um endereço no formato nome@dominio, sem espaços.',
  name: 'Nome completo inválido. Informe entre 2 e 150 caracteres.',
  password: 'Senha inválida. Informe entre 8 e 128 caracteres.',
  organization_id: 'Secretaria inválida. Selecione uma secretaria da lista.',
  role: 'Perfil inválido. Selecione um dos perfis disponíveis.',
}

function validationMessage(item) {
  if (typeof item === 'string') return item
  const message = item?.msg
  const generic = !message || /^valor inv[aá]lido\.?$/i.test(message.trim())
  if (!generic) return message
  const field = Array.isArray(item?.loc) ? item.loc.at(-1) : undefined
  return validationHints[field] || 'Um dos campos contém um valor inválido. Revise os dados preenchidos e tente novamente.'
}

export function getApiErrorMessage(error, fallback = 'Não foi possível concluir a operação.') {
  const detail = error?.response?.data?.detail
  const requestId = error?.response?.data?.request_id || error?.response?.headers?.['x-request-id']
  const withReference = (message) => requestId ? `${message} (referência: ${requestId})` : message

  if (typeof detail === 'string' && detail.trim()) {
    return withReference(detail)
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return withReference(detail
      .map(validationMessage)
      .filter(Boolean)
      .join(' '))
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string') return withReference(detail.message)
    return withReference(fallback)
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return withReference(error.message)
  }

  return withReference(fallback)
}
