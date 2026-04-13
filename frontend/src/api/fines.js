import api from './client'

export const finesAPI = {
  list: (params) => api.get('/fines', { params }),
  create: (data) => api.post('/fines', data),
  update: (id, data) => api.put(`/fines/${id}`, data),
}
