import api from './client'

function buildAttachmentFormData(data, files = [], removedAttachmentIds = []) {
  const formData = new FormData()
  formData.append('data', JSON.stringify(data))
  formData.append('removed_attachment_ids', JSON.stringify(removedAttachmentIds))
  files.forEach((file) => formData.append('attachments', file))
  return formData
}

export const claimsAPI = {
  list: (params) => api.get('/claims', { params }),
  getById: (id) => api.get(`/claims/${id}`),
  create: (data) => api.post('/claims', data),
  update: (id, data) => api.put(`/claims/${id}`, data),
  createWithAttachments: (data, files, onUploadProgress) => api.post(
    '/claims/with-attachments',
    buildAttachmentFormData(data, files),
    { onUploadProgress },
  ),
  updateWithAttachments: (id, data, files, removedAttachmentIds, onUploadProgress) => api.put(
    `/claims/${id}/with-attachments`,
    buildAttachmentFormData(data, files, removedAttachmentIds),
    { onUploadProgress },
  ),
  getAttachment: (claimId, attachmentId, { download = false } = {}) => api.get(
    `/claims/${claimId}/attachments/${attachmentId}`,
    { params: { download }, responseType: 'blob' },
  ),
  addAttachments: (claimId, files, onUploadProgress) => {
    const formData = new FormData()
    files.forEach((file) => formData.append('attachments', file))
    return api.post(`/claims/${claimId}/attachments`, formData, { onUploadProgress })
  },
  deleteAttachment: (claimId, attachmentId) => api.delete(`/claims/${claimId}/attachments/${attachmentId}`),
  listByVehicle: (vehicleId, params) => api.get(`/vehicles/${vehicleId}/claims`, { params }),
}
