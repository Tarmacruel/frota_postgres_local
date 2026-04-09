import api from './client'

export const searchAPI = {
  query: (params) => api.get('/search', { params }),
}
