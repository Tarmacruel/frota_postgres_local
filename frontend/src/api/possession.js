import api from './client'

export const possessionAPI = {
  list: (params) => api.get('/possession', { params }),
  listPaginated: (params) => api.get('/possession/paginated', { params }),
  listActive: () => api.get('/possession/active'),
  create: (data) => api.post('/possession', data),
  update: (id, data) => api.put(`/possession/${id}`, data),
  end: (id, data) => api.put(`/possession/${id}/end`, data),
  getReturnContext: (id) => api.get(`/possession/${id}/return-context`),
  listReturnConfirmations: (id) => api.get(`/possession/${id}/return-confirmations`),
  correctReturnConfirmation: (id, data) => api.post(`/possession/${id}/return-confirmations/corrections`, data),
  getOfficialTerm: (id, disposition = 'inline') => api.get(`/possession/${id}/term`, {
    params: { disposition },
    responseType: 'blob',
  }),
  getReportMetadata: () => api.get('/possession/reports/metadata'),
  previewReportPdf: (data) => api.post('/possession/reports/preview-pdf', data, { responseType: 'blob' }),
  exportReportXlsx: (data) => api.post('/possession/reports/export-xlsx', data, { responseType: 'blob' }),
  getReportPreference: () => api.get('/users/me/report-preferences/possession'),
  updateReportPreference: (data) => api.put('/users/me/report-preferences/possession', data),
  listTrips: (possessionId, params, config = {}) => api.get(`/possession/${possessionId}/trips`, { ...config, params }),
  getTrip: (possessionId, tripId) => api.get(`/possession/${possessionId}/trips/${tripId}`),
  createTrip: (possessionId, data) => api.post(`/possession/${possessionId}/trips`, data),
  addTripDestinations: (possessionId, tripId, data) => api.post(`/possession/${possessionId}/trips/${tripId}/destinations`, data),
  endTrip: (possessionId, tripId, data) => api.put(`/possession/${possessionId}/trips/${tripId}/end`, data),
  cancelTrip: (possessionId, tripId, data) => api.put(`/possession/${possessionId}/trips/${tripId}/cancel`, data),
  getPublicTerm: (termType, validationCode) => api.get(`/public/possession-terms/${termType}/${validationCode}`),
}
