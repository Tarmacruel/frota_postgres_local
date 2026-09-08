import { describe, expect, it } from 'vitest'
import { environmentFlagEnabled, resolveEnvironment } from './environment'

describe('environment configuration', () => {
  it('ativa homologação por nome ou flag explícita', () => {
    expect(resolveEnvironment({ VITE_APP_ENV: 'homologation' }).isHomologation).toBe(true)
    expect(resolveEnvironment({ VITE_APP_ENV: 'production', VITE_HOMOLOGATION: 'true' }).isHomologation).toBe(true)
    expect(resolveEnvironment({ VITE_APP_ENV: 'production', VITE_HOMOLOGATION: 'false' }).isHomologation).toBe(false)
  })

  it('interpreta flags sem habilitar valores ambíguos', () => {
    expect(environmentFlagEnabled('1')).toBe(true)
    expect(environmentFlagEnabled('ON')).toBe(true)
    expect(environmentFlagEnabled('false')).toBe(false)
    expect(environmentFlagEnabled(undefined)).toBe(false)
  })
})
