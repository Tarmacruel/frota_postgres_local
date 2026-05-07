import api from './client'
import { VEHICLE_LIST_LIMIT } from '../constants/pagination'

export const vehiclesAPI = {
  list: (params = {}) => api.get('/vehicles', { params: { limit: VEHICLE_LIST_LIMIT, ...params } }),
  listPaginated: (params) => api.get('/vehicles/paginated', { params }),
  currentDriver: (id) => api.get(`/vehicles/${id}/current-driver`),
  create: (data) => api.post('/vehicles', data),
  update: (id, data) => api.put(`/vehicles/${id}`, data),
  remove: (id) => api.delete(`/vehicles/${id}`),
  history: (id) => api.get(`/vehicles/${id}/historico`),
}
