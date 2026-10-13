export const ALERT_STATES = { NEW: 'Novo', IN_REVIEW: 'Em análise', RESOLVED: 'Resolvido', IGNORED: 'Ignorado' }
export const ALERT_SEVERITIES = { HIGH: 'Alta', MEDIUM: 'Média', LOW: 'Baixa' }
export const ALERT_RULES = { capacity: 'Capacidade de tanque', odometer: 'Hodômetro regressivo', close: 'Abastecimentos próximos', consumption: 'Razão de intervalo km/L', price: 'Preço por litro' }
export function alertInstant(value) {
  return value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Data não disponível'
}
export function alertOrigin(evidence, context) {
  return evidence ? { label: evidence.label, formula: evidence.rule, limitations: [
    `Observado: ${evidence.observed}. Referência: ${evidence.reference}. Amostra: ${evidence.sample_size}.`,
    evidence.limitation, `Versão: ${evidence.rule_version}.`,
    context ? `Recorte da avaliação: ${context.date_from} a ${context.date_to} · ${context.timezone}.` : '',
  ].filter(Boolean) } : undefined
}
