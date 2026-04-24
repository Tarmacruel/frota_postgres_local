import api from './client'

export const fuelSupplyOrdersAPI = {
  create: (data) => api.post('/fuel-supply-orders', data),
  listOpen: (params) => api.get('/fuel-supply-orders', { params: { ...params, status: 'OPEN' } }),
  list: (params) => api.get('/fuel-supply-orders', { params }),
  getById: (id) => api.get(`/fuel-supply-orders/${id}`),
  getPublic: (validationCode) => api.get(`/public/fuel-supply-orders/${validationCode}`),
  confirmSupply: (id, data) => api.post(`/fuel-supply-orders/${id}/confirm`, data),
  cancel: (id, data) => api.post(`/fuel-supply-orders/${id}/cancel`, data),
}
