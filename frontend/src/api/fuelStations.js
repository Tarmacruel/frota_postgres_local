import api from './client'

export const fuelStationsAPI = {
  list: (params) => api.get('/fuel-stations', { params }),
  create: (data) => api.post('/fuel-stations', data),
  update: (id, data) => api.put(`/fuel-stations/${id}`, data),
  remove: (id) => api.delete(`/fuel-stations/${id}`),
  listUsers: (id, params) => api.get(`/fuel-stations/${id}/users`, { params }),
  createUser: (id, data) => api.post(`/fuel-stations/${id}/users`, data),
  updateUser: (id, linkId, data) => api.put(`/fuel-stations/${id}/users/${linkId}`, data),
  removeUser: (id, linkId) => api.delete(`/fuel-stations/${id}/users/${linkId}`),
}
