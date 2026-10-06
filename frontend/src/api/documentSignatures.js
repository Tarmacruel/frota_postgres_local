import api from './client'

export const DIGITAL_DOCUMENT_TYPES = {
  POSSESSION_RESPONSIBILITY_TERM: 'POSSESSION_RESPONSIBILITY_TERM',
  POSSESSION_LOAN_TERM: 'POSSESSION_LOAN_TERM',
  POSSESSION_RETURN_TERM: 'POSSESSION_RETURN_TERM',
  FUEL_SUPPLY_ORDER: 'FUEL_SUPPLY_ORDER',
}

export const SIGNATURE_METHODS = {
  INTERNAL_PASSWORD: 'INTERNAL_PASSWORD',
  ICP_BRASIL_PADES: 'ICP_BRASIL_PADES',
}

export const CERTIFICATE_SESSION_STATUSES = {
  CREATED: 'CREATED',
  CERTIFICATE_VALIDATED: 'CERTIFICATE_VALIDATED',
  AWAITING_SIGNATURE: 'AWAITING_SIGNATURE',
  FINALIZING: 'FINALIZING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
}

export const CERTIFICATE_SESSION_TERMINAL_STATUSES = new Set([
  CERTIFICATE_SESSION_STATUSES.COMPLETED,
  CERTIFICATE_SESSION_STATUSES.FAILED,
  CERTIFICATE_SESSION_STATUSES.CANCELLED,
  CERTIFICATE_SESSION_STATUSES.EXPIRED,
])

export function isCertificateSessionTerminal(status) {
  return CERTIFICATE_SESSION_TERMINAL_STATUSES.has(status)
}

export const certificateSignatureRoutes = {
  createSession: (documentId) => `/documents/${documentId}/certificate-sessions`,
  session: (sessionId) => `/certificate-sessions/${sessionId}`,
  artifact: (documentId, kind) => `/documents/${documentId}/artifacts/${kind}`,
  validation: (documentId) => `/documents/${documentId}/validation`,
}

export const signatureAgentRoutes = {
  pairings: '/signature-agent/pairings',
  pairing: (pairingId) => `/signature-agent/pairings/${pairingId}`,
  devices: '/signature-agent/devices',
  device: (deviceId) => `/signature-agent/devices/${encodeURIComponent(deviceId)}`,
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
  createCertificateSession: (id, data = {}) => api.post(certificateSignatureRoutes.createSession(id), data),
  getCertificateSession: (id) => api.get(certificateSignatureRoutes.session(id)),
  cancelCertificateSession: (id) => api.delete(certificateSignatureRoutes.session(id)),
  downloadArtifact: (id, kind) => api.get(certificateSignatureRoutes.artifact(id, kind), { responseType: 'blob' }),
  getValidation: (id) => api.get(certificateSignatureRoutes.validation(id)),
  createAgentPairing: () => api.post(signatureAgentRoutes.pairings),
  getAgentPairing: (id) => api.get(signatureAgentRoutes.pairing(id)),
  listAgentDevices: () => api.get(signatureAgentRoutes.devices),
  revokeAgentDevice: (deviceId) => api.delete(signatureAgentRoutes.device(deviceId)),
  getAgentManifest: () => api.get('/signature-agent/manifest'),
  downloadAgent: () => api.get('/signature-agent/download', { responseType: 'blob' }),
}
