import api from './client'

export const dataImportsAPI = {
  list: () => api.get('/data-imports'),
  upload: (file) => {
    const payload = new FormData()
    payload.append('file', file, file.name)
    return api.post('/data-imports/upload', payload)
  },
  get: (id) => api.get(`/data-imports/${id}`),
  rows: (id, params) => api.get(`/data-imports/${id}/rows`, { params }),
  updateRow: (batchId, rowId, data) => api.put(`/data-imports/${batchId}/rows/${rowId}`, data),
  apply: (id) => api.post(`/data-imports/${id}/apply`),
  exportUrl: (id) => `/api/data-imports/${id}/export`,
  templateUrl: (entityType) => `/api/data-imports/templates/${entityType}`,
}
