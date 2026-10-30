import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ get: vi.fn(), request: vi.fn(), requestHook: null, responseError: null }))
vi.mock('../utils/formCustomization', () => ({ captureCustomFields: () => null }))
vi.mock('axios', () => ({ default: { create: () => ({ get: mocks.get, request: mocks.request,
  interceptors: { request: { use: (callback) => { mocks.requestHook = callback } },
    response: { use: (_success, error) => { mocks.responseError = error } } } }) } }))
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks()
  mocks.get.mockResolvedValue({ data: { csrf_token: 'synthetic-token' } })
  mocks.request.mockResolvedValue({ data: { success: true } })
  await import('./client')
})
const rejection = (status, code) => ({ config: { method: 'post', url: '/system-settings', data: { test: 'preserved' } }, response: { status, data: { code } } })

it('renova a validação da sessão e repete uma única vez após recusa explícita anterior à execução', async () => {
  const error = rejection(403, 'CSRF_TOKEN_INVALID')
  await mocks.responseError(error)
  expect(mocks.get).toHaveBeenCalledWith('/auth/csrf')
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({ csrfRetried: true, data: { test: 'preserved' } }))
  const retried = mocks.request.mock.lastCall[0]
  expect(await mocks.requestHook(retried)).toMatchObject({ headers: { 'X-CSRF-Token': 'synthetic-token' } })
  await expect(mocks.responseError({ ...error, config: retried })).rejects.toBeTruthy()
  expect(mocks.request).toHaveBeenCalledTimes(1)
})

it.each([[403, 'CSRF_ORIGIN_INVALID'], [403, 'FORBIDDEN'], [401, 'UNAUTHORIZED'], [500, 'INTERNAL_ERROR']])('não repete erro %s/%s nem contorna permissões ou falhas de execução', async (status, code) => {
  await expect(mocks.responseError(rejection(status, code))).rejects.toBeTruthy()
  expect(mocks.get).not.toHaveBeenCalled()
  expect(mocks.request).not.toHaveBeenCalled()
})
