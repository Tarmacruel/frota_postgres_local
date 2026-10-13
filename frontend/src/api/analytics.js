import api from './client'

export const analyticsAPI = {
  overview: (params, signal) => api.get('/analytics/overview', { params, signal }),
  efficiency: (params, signal) => api.get('/analytics/efficiency', { params, signal }),
  tco: (params, signal) => api.get('/analytics/costs/tco', { params, signal }),
  costTrend: (params, signal) => api.get('/analytics/costs/trend', { params, signal }),
  driverRisk: (params, signal) => api.get('/analytics/risk/drivers', { params, signal }),
  insights: (params, signal) => api.get('/analytics/insights', { params, signal }),
  exportReport: (params) => api.get('/analytics/export', { params, responseType: 'blob' }),
}
