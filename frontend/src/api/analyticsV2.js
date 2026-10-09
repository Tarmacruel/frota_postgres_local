import api from './client'

export const analyticsV2API = {
  summary: (params, signal) => api.get('/analytics/v2/summary', { params, signal }),
  costs: (params, signal) => api.get('/analytics/v2/costs', { params, signal }),
  fuel: (params, signal) => api.get('/analytics/v2/fuel', { params, signal }),
  maintenance: (params, signal) => api.get('/analytics/v2/maintenance', { params, signal }),
  maintenanceEvents: (params, signal) => api.get('/analytics/v2/maintenance/events', { params, signal }),
  fuelEvents: (params, signal) => api.get('/analytics/v2/fuel/events', { params, signal }),
  costEvents: (params, signal) => api.get('/analytics/v2/costs/events', { params, signal }),
  mileageEvents: (params, signal) => api.get('/analytics/v2/costs/mileage-events', { params, signal }),
  attention: (params, signal) => api.get('/analytics/v2/attention', { params, signal }),
  fleet: (params, signal) => api.get('/analytics/v2/fleet-status', { params, signal }),
  entity: (type, id, params, signal) => api.get(`/analytics/v2/entities/${type}/${id}`, { params, signal }),
}
