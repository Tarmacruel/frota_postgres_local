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

export default api
