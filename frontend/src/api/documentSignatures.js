import api from './client'

export const DIGITAL_DOCUMENT_TYPES = {
  POSSESSION_LOAN_TERM: 'POSSESSION_LOAN_TERM',
  POSSESSION_RETURN_TERM: 'POSSESSION_RETURN_TERM',
  FUEL_SUPPLY_ORDER: 'FUEL_SUPPLY_ORDER',
}

export const documentSignaturesAPI = {
  createDocument: (data) => api.post('/document-signatures/documents', data),
  getDocument: (id) => api.get(`/document-signatures/documents/${id}`),
  sign: (id, data) => api.post(`/document-signatures/documents/${id}/sign`, data),
  requestJointSignature: (id, data) => api.post(`/document-signatures/documents/${id}/requests`, data),
  pending: () => api.get('/document-signatures/pending'),
  declineRequest: (id) => api.post(`/document-signatures/requests/${id}/decline`),
  cancelRequest: (id) => api.delete(`/document-signatures/requests/${id}`),
  signers: () => api.get('/users/signers'),
}
