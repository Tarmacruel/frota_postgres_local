import api from './client'

export const fuelSupplyOrdersAPI = {
  create: (data) => api.post('/fuel-supply-orders', data),
  listOpen: (params) => api.get('/fuel-supply-orders', { params: { ...params, status: 'OPEN' } }),
  list: (params) => api.get('/fuel-supply-orders', { params }),
  listAllForReport: async (params = {}) => {
    const { page: _page, limit: _limit, ...baseParams } = params
    const pageLimit = 100
    const records = []
    let currentPage = 1
    let totalPages = 1

    do {
      const { data } = await api.get('/fuel-supply-orders', {
        params: { ...baseParams, page: currentPage, limit: pageLimit },
      })
      records.push(...(data.data || []))
      totalPages = data.pagination?.pages || 1
      currentPage += 1
    } while (currentPage <= totalPages)

    return records
  },
  getById: (id) => api.get(`/fuel-supply-orders/${id}`),
  getPublic: (validationCode) => api.get(`/public/fuel-supply-orders/${validationCode}`),
  confirmSupply: (id, data) => api.post(`/fuel-supply-orders/${id}/confirm`, data),
  cancel: (id, data) => api.post(`/fuel-supply-orders/${id}/cancel`, data),
}
