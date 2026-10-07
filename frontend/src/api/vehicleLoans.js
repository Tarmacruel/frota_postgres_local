import api from './client'

export const vehicleLoansAPI = {
  list: (params) => api.get('/vehicle-loans', { params }),
  catalog: () => api.get('/vehicle-loans/catalog'),
  pendingSummary: () => api.get('/vehicle-loans/pending-summary'),
  regularizationCatalog: () => api.get('/vehicle-loans/regularization/catalog'),
  previewRegularization: (body) => api.post('/vehicle-loans/regularization/preview', body),
  regularize: (body) => api.post('/vehicle-loans/regularization', body),
  get: (id) => api.get(`/vehicle-loans/${id}`),
  context: (id) => api.get(`/vehicle-loans/${id}/context`),
  events: (id) => api.get(`/vehicle-loans/${id}/events`),
  documents: (id) => api.get(`/vehicle-loans/${id}/documents`),
  downloadTerm: (id, documentId) => api.get(`/vehicle-loans/${id}/documents/${documentId}/pdf`, { responseType: 'blob' }),
  printedTerms: (id) => api.get(`/vehicle-loans/${id}/printed-terms`),
  uploadPrintedTerm: (id, file) => {
    const body = new FormData()
    body.append('file', file)
    return api.post(`/vehicle-loans/${id}/printed-terms`, body)
  },
  downloadPrintedTerm: (id, termId) => api.get(`/vehicle-loans/${id}/printed-terms/${termId}/file`, { responseType: 'blob' }),
  create: (body) => api.post('/vehicle-loans', body),
  update: (id, body) => api.put(`/vehicle-loans/${id}`, body),
  act: (id, action, body) => api.post(`/vehicle-loans/${id}/${action}`, body),
}
