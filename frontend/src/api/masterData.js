import api from './client'

export const masterDataAPI = {
  getCatalog: () => api.get('/master-data/catalog'),
  listOrganizations: () => api.get('/master-data/organizations'),
  createOrganization: (data) => api.post('/master-data/organizations', data),
  updateOrganization: (id, data) => api.put(`/master-data/organizations/${id}`, data),
  removeOrganization: (id) => api.delete(`/master-data/organizations/${id}`),
  listDepartments: (params) => api.get('/master-data/departments', { params }),
  createDepartment: (data) => api.post('/master-data/departments', data),
  updateDepartment: (id, data) => api.put(`/master-data/departments/${id}`, data),
  removeDepartment: (id) => api.delete(`/master-data/departments/${id}`),
  listAllocations: (params) => api.get('/master-data/allocations', { params }),
  createAllocation: (data) => api.post('/master-data/allocations', data),
  updateAllocation: (id, data) => api.put(`/master-data/allocations/${id}`, data),
  removeAllocation: (id) => api.delete(`/master-data/allocations/${id}`),
}
