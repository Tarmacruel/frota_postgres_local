export function getHttpStatus(error) {
  return Number(error?.response?.status || 0)
}

export function getApiErrorCode(error) {
  const detail = error?.response?.data?.detail
  return detail && typeof detail === 'object' && !Array.isArray(detail) ? detail.code || '' : ''
}

export function getApiErrorDetail(error) {
  const detail = error?.response?.data?.detail
  return detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : null
}

export function getValidationFieldErrors(error) {
  const detail = error?.response?.data?.detail
  if (!Array.isArray(detail)) return {}

  return detail.reduce((errors, item) => {
    const field = Array.isArray(item?.loc) ? item.loc.at(-1) : null
    if (field && item?.msg && !errors[field]) errors[field] = item.msg
    return errors
  }, {})
}
