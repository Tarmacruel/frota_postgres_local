import api from './client'

export const vehicleTagsAPI = {
  mine: () => api.get('/vehicle-tags'),
  create: (data) => api.post('/vehicle-tags', data),
  update: (id, data) => api.patch(`/vehicle-tags/${id}`, data),
  deleteDefinition: (id) => api.delete(`/vehicle-tags/${id}`),
  options: () => api.get('/vehicles/tag-options'),
  list: (id) => api.get(`/vehicles/${id}/tags`),
  apply: (id, data) => api.post(`/vehicles/${id}/tags`, data),
  remove: (id, assignment, reason) => api.post(`/vehicles/${id}/tags/${assignment}/remove`, { reason: reason || null }),
}
