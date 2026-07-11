export function getApiErrorMessage(error, fallback = 'Não foi possível concluir a operação.') {
  const detail = error?.response?.data?.detail
  const requestId = error?.response?.data?.request_id || error?.response?.headers?.['x-request-id']
  const withReference = (message) => requestId ? `${message} (referência: ${requestId})` : message

  if (typeof detail === 'string' && detail.trim()) {
    return withReference(detail)
  }

  if (Array.isArray(detail) && detail.length > 0) {
    return withReference(detail
      .map((item) => {
        if (typeof item === 'string') return item
        if (item?.msg) return item.msg
        return null
      })
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
