import api from './client'

export const analyticsAPI = {
  overview: (params) => api.get('/analytics/overview', { params }),
  efficiency: (params) => api.get('/analytics/efficiency', { params }),
  tco: (params) => api.get('/analytics/costs/tco', { params }),
  costTrend: (params) => api.get('/analytics/costs/trend', { params }),
  driverRisk: (params) => api.get('/analytics/risk/drivers', { params }),
  insights: (params) => api.get('/analytics/insights', { params }),
  exportReport: (params) => api.get('/analytics/export', { params, responseType: 'blob' }),
}
