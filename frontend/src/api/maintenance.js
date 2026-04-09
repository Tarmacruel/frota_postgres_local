import api from './client'

export const maintenanceAPI = {
  list: (params) => api.get('/maintenance', { params }),
  getById: (id) => api.get(`/maintenance/${id}`),
  create: (data) => api.post('/maintenance', data),
  update: (id, data) => api.put(`/maintenance/${id}`, data),
  remove: (id) => api.delete(`/maintenance/${id}`),
}
