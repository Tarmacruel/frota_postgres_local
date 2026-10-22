import api from './client'

export const featureGuidesAPI = {
  getVehicleTags: () => api.get('/auth/feature-guides/vehicle-tags-v1'),
  acknowledgeVehicleTags: () => api.post('/auth/feature-guides/vehicle-tags-v1/acknowledge'),
  getFuelSupplyOrdersBatch: () => api.get('/auth/feature-guides/fuel-supply-orders-batch-v1'),
  acknowledgeFuelSupplyOrdersBatch: () => api.post('/auth/feature-guides/fuel-supply-orders-batch-v1/acknowledge'),
}
