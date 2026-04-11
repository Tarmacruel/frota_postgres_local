import api from './client'

export const driversAPI = {
  list: (params) => api.get('/drivers', { params }),
  listActive: (params) => api.get('/drivers/active', { params }),
  getById: (id) => api.get(`/drivers/${id}`),
  create: (data) => api.post('/drivers', data),
  update: (id, data) => api.put(`/drivers/${id}`, data),
  remove: (id) => api.delete(`/drivers/${id}`),
}
