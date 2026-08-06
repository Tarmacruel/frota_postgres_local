import api from './client'

export const featureGuidesAPI = {
  getFuelSupplyOrdersBatch: () => api.get('/auth/feature-guides/fuel-supply-orders-batch-v1'),
  acknowledgeFuelSupplyOrdersBatch: () => api.post('/auth/feature-guides/fuel-supply-orders-batch-v1/acknowledge'),
}
