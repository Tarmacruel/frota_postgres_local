function flagEnabled(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase())
}

export function resolveEnvironment(env = import.meta.env) {
  const name = String(env?.VITE_APP_ENV || '').trim().toLowerCase()
  const isHomologation = flagEnabled(env?.VITE_HOMOLOGATION)
    || ['hml', 'homologacao', 'homologação', 'homologation', 'staging', 'test'].includes(name)

  return {
    name: isHomologation ? 'homologation' : (name || 'production'),
    isHomologation,
  }
}

export function environmentFlagEnabled(value) {
  return flagEnabled(value)
}

export const appEnvironment = resolveEnvironment()
