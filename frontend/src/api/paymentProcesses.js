import api from './client'

export const paymentProcessesAPI = {
  list: (params) => api.get('/payment-processes', { params }),
  listAllForReport: async (params = {}) => {
    const { page: _page, limit: _limit, ...baseParams } = params
    const pageLimit = 200
    const records = []
    let currentPage = 1
    let totalPages = 1

    do {
      const { data } = await api.get('/payment-processes', {
        params: { ...baseParams, page: currentPage, limit: pageLimit },
      })
      records.push(...(data.data || []))
      totalPages = data.pagination?.pages || 1
      currentPage += 1
    } while (currentPage <= totalPages)

    return records
  },
  dashboard: () => api.get('/payment-processes/dashboard'),
  getById: (id) => api.get(`/payment-processes/${id}`),
  create: (data) => api.post('/payment-processes', data),
  update: (id, data) => api.put(`/payment-processes/${id}`, data),
  remove: (id, data) => api.delete(`/payment-processes/${id}`, { data }),
  updateStage: (id, data) => api.post(`/payment-processes/${id}/stage`, data),
  updateChecklist: (id, data) => api.put(`/payment-processes/${id}/checklist`, data),
  import: (file) => {
    const payload = new FormData()
    payload.append('file', file, file.name)
    return api.post('/payment-processes/import', payload)
  },
  templateUrl: () => '/api/payment-processes/template',
  exportUrl: (params = {}) => {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') search.set(key, value)
    })
    const query = search.toString()
    return `/api/payment-processes/export${query ? `?${query}` : ''}`
  },
}

export const paymentSuppliersAPI = {
  list: (params) => api.get('/payment-suppliers', { params }),
  getById: (id) => api.get(`/payment-suppliers/${id}`),
  create: (data) => api.post('/payment-suppliers', data),
  update: (id, data) => api.put(`/payment-suppliers/${id}`, data),
  remove: (id) => api.delete(`/payment-suppliers/${id}`),
}

export const paymentContractsAPI = {
  list: (params) => api.get('/payment-contracts', { params }),
  managementSummary: (params) => api.get('/payment-contracts/management-summary', { params }),
  getById: (id) => api.get(`/payment-contracts/${id}`),
  management: (id, params) => api.get(`/payment-contracts/${id}/management`, { params }),
  create: (data) => api.post('/payment-contracts', data),
  update: (id, data) => api.put(`/payment-contracts/${id}`, data),
  remove: (id) => api.delete(`/payment-contracts/${id}`),
  createAmendment: (id, data) => api.post(`/payment-contracts/${id}/amendments`, data),
}
