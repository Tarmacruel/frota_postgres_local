import api from './client'

export const contractControlAPI = {
  config: () => api.get('/contract-control/config'),
  catalog: () => api.get('/contract-control/catalog'),
  contracts: (params) => api.get('/contract-control/contracts', { params }),
  detail: (id) => api.get(`/contract-control/contracts/${id}`),
  eligible: (params) => api.get('/contract-control/eligible', { params }),
  opening: (id, data) => api.post(`/contract-control/contracts/${id}/opening`, data),
  provider: (id, data) => api.post(`/contract-control/contracts/${id}/providers`, data),
  setProvider: (id, provider, active) => api.patch(`/contract-control/contracts/${id}/providers/${provider}`, null, { params: { active } }),
  price: (id, data) => api.post(`/contract-control/contracts/${id}/prices`, data),
  updatePrice: (id, price, data) => api.patch(`/contract-control/contracts/${id}/prices/${price}`, data),
  deletePrice: (id, price) => api.delete(`/contract-control/contracts/${id}/prices/${price}`),
  quote: (id, data) => api.post(`/contract-control/contracts/${id}/quote`, data),
  adjust: (id, data) => api.post(`/contract-control/contracts/${id}/adjustments`, data),
  correctBalance: (id, data) => api.post(`/contract-control/contracts/${id}/balance-correction`, data),
  resolve: (id, data) => api.post(`/contract-control/contracts/${id}/resolve-divergence`, data),
  movements: (id, params) => api.get(`/contract-control/contracts/${id}/movements`, { params }),
  operations: (id, params) => api.get(`/contract-control/contracts/${id}/operations`, { params }),
  reservations: (id, params) => api.get(`/contract-control/contracts/${id}/reservations`, { params }),
  reconciliation: (id) => api.get(`/contract-control/processes/${id}/reconciliation`),
  reconcile: (id, data) => api.post(`/contract-control/processes/${id}/reconciliation`, data),
  fundOrder: (id, data) => api.post(`/fuel-supply-orders/${id}/funding`, data),
}

export const maintenanceOrdersAPI = {
  list: (params) => api.get('/maintenance-orders', { params }),
  create: (data) => api.post('/maintenance-orders', data),
  start: (id, data = {}) => api.post(`/maintenance-orders/${id}/start`, data),
  complete: (id, data) => api.post(`/maintenance-orders/${id}/complete`, data),
  cancel: (id, data) => api.post(`/maintenance-orders/${id}/cancel`, data),
}
