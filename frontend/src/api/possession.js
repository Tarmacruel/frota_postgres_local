import api from './client'

export const possessionAPI = {
  list: (params) => api.get('/possession', { params }),
  listActive: () => api.get('/possession/active'),
  create: (data) => api.post('/possession', data),
  end: (id, data) => api.put(`/possession/${id}/end`, data),
}
