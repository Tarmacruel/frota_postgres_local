export function getApiErrorMessage(error, fallback = 'Nao foi possivel concluir a operacao.') {
  const detail = error?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.msg) return item.msg
        return null
      })
      .filter(Boolean)
      .join(' ')
  }

  if (detail && typeof detail === 'object') {
    if (typeof detail.message === 'string') return detail.message
    return fallback
  }

  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message
  }

  return fallback
}
