import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}))

vi.mock('./client', () => ({
  default: mocks,
}))

import { featureGuidesAPI } from './featureGuides'

describe('featureGuidesAPI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('consulta e reconhece o guia de pedidos em lote nos endpoints protegidos', () => {
    featureGuidesAPI.getFuelSupplyOrdersBatch()
    featureGuidesAPI.acknowledgeFuelSupplyOrdersBatch()

    expect(mocks.get).toHaveBeenCalledWith('/auth/feature-guides/fuel-supply-orders-batch-v1')
    expect(mocks.post).toHaveBeenCalledWith('/auth/feature-guides/fuel-supply-orders-batch-v1/acknowledge')
  })

  it('consulta e reconhece o tour de etiquetas sem enviar outro usuário no payload', () => {
    featureGuidesAPI.getVehicleTags()
    featureGuidesAPI.acknowledgeVehicleTags()
    expect(mocks.get).toHaveBeenCalledWith('/auth/feature-guides/vehicle-tags-v1')
    expect(mocks.post).toHaveBeenCalledWith('/auth/feature-guides/vehicle-tags-v1/acknowledge')
  })
})
