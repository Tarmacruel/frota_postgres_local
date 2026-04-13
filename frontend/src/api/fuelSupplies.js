import api from './client'

export const fuelSuppliesAPI = {
  list: (params) => api.get('/fuel-supplies', { params }),
  getById: (id) => api.get(`/fuel-supplies/${id}`),
  create: (data) => api.post('/fuel-supplies', data),
  reportConsumption: (params) => api.get('/fuel-supplies/reports/consumption', { params }),
  reportAnomalies: (params) => api.get('/fuel-supplies/reports/anomalies', { params }),
}
