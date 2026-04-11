import api from './client'

export const possessionAPI = {
  list: (params) => api.get('/possession', { params }),
  listPaginated: (params) => api.get('/possession/paginated', { params }),
  listActive: () => api.get('/possession/active'),
  create: (data) => api.post('/possession', data),
  update: (id, data) => api.put(`/possession/${id}`, data),
  end: (id, data) => api.put(`/possession/${id}/end`, data),
}
