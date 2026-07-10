import axios from 'axios'

function resolveApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()

  if (!configured) return '/api'

  if (typeof window === 'undefined') return configured

  const isRemoteHost = !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
  const pointsToLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/i.test(configured)

  if (isRemoteHost && pointsToLocalhost) {
    return '/api'
  }

  return configured
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
})

let csrfToken = ''
let csrfPromise = null

function isUnsafeMethod(method = 'get') {
  return ['post', 'put', 'patch', 'delete'].includes(method.toLowerCase())
}

function isCsrfExempt(url = '') {
  return String(url).includes('/auth/login')
}

async function getCsrfToken() {
  if (csrfToken) return csrfToken
  if (!csrfPromise) {
    csrfPromise = api.get('/auth/csrf')
      .then((response) => {
        csrfToken = response.data?.csrf_token || ''
        return csrfToken
      })
      .finally(() => {
        csrfPromise = null
      })
  }
  return csrfPromise
}

api.interceptors.request.use(async (config) => {
  if (isUnsafeMethod(config.method) && !isCsrfExempt(config.url)) {
    const token = await getCsrfToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers['X-CSRF-Token'] = token
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 403 && String(error?.response?.data?.detail || '').includes('CSRF')) {
      csrfToken = ''
    }
    throw error
  },
)

export default api
