import api from './client'

export const analyticsV2API = {
  summary: (params, signal) => api.get('/analytics/v2/summary', { params, signal }),
  attention: (params, signal) => api.get('/analytics/v2/attention', { params, signal }),
  fleet: (params, signal) => api.get('/analytics/v2/fleet-status', { params, signal }),
}
