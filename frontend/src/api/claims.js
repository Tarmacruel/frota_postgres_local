import api from './client'

export const claimsAPI = {
  list: (params) => api.get('/claims', { params }),
  getById: (id) => api.get(`/claims/${id}`),
  create: (data) => api.post('/claims', data),
  update: (id, data) => api.put(`/claims/${id}`, data),
  listByVehicle: (vehicleId, params) => api.get(`/vehicles/${vehicleId}/claims`, { params }),
}
