import { lazy, Suspense, useEffect, useState } from 'react'
import api from '../api/client'
import './AuditAccessDetails.css'

const AuditIpMap = lazy(() => import('./AuditIpMap'))

export const accessActions = {
  LOGIN_SUCCESS: 'Entrada autorizada',
  LOGIN_FAILURE: 'Tentativa recusada',
  LOGIN_BLOCKED: 'Tentativa bloqueada',
  LOGOUT: 'Saída solicitada',
}

const browsers = [
  ['Edge', /\b(?:Edg|EdgA|EdgiOS)\/([\d.]+)/],
  ['Opera', /\bOPR\/([\d.]+)/],
  ['Firefox', /\b(?:Firefox|FxiOS)\/([\d.]+)/],
  ['Chrome', /\b(?:Chrome|CriOS)\/([\d.]+)/],
  ['Safari', /\bVersion\/([\d.]+).*Safari\//],
]

export function describeBrowser(agent = '') {
  agent = agent || ''
  const browser = browsers.flatMap(([name, pattern]) => {
    const version = agent.match(pattern)?.[1]
    return version ? [`${name} ${version}`] : []
  })[0]
  const system = /Android/i.test(agent) ? 'Android'
    : /iPad|iPhone|iPod/i.test(agent) ? 'iOS/iPadOS'
    : /Windows/i.test(agent) ? 'Windows'
    : /Macintosh|Mac OS X/i.test(agent) ? 'macOS'
    : /Linux/i.test(agent) ? 'Linux' : ''
  const device = /iPad|Tablet/i.test(agent) ? 'Tablet'
    : /Mobile|iPhone/i.test(agent) ? 'Celular'
    : /Windows|Macintosh|X11/i.test(agent) ? 'Computador' : ''
  return [browser, system, device].filter(Boolean).join(' · ') || 'Navegador não identificado'
}

const locationStates = {
  non_public: 'Endereço local ou reservado. A origem depende dos registros da rede interna.',
  no_ip: 'O evento não tem um endereço IP válido.',
  database_unavailable: 'A base local de geolocalização está indisponível.',
  not_found: 'Endereço sem correspondência na base local.',
}

const formatRequestTime = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit',
  second: '2-digit', fractionalSecondDigits: 3,
})

export function AuditAccessDetails({ event, canLocate }) {
  const context = event.details?.request_context
  const [open, setOpen] = useState(false)
  const [location, setLocation] = useState(null)
  const ip = context?.ip_address
  const showLocation = canLocate && Boolean(ip && ip !== 'unknown')

  useEffect(() => {
    if (!open || !showLocation) return undefined
    const controller = new AbortController()
    api.get(`/audit/${event.id}/ip-location`, { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setLocation(data) })
      .catch(() => { if (!controller.signal.aborted) setLocation({ status: 'error' }) })
    return () => controller.abort()
  }, [event.id, open, showLocation])

  if (!context && !event.details?.http_status) return null
  const label = [location?.city, location?.region, location?.country].filter(Boolean).join(', ')
  const requestedAt = context?.timestamp ? new Date(context.timestamp) : null

  return <details className="audit-access" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>Detalhes do acesso</summary>
    <dl className="audit-access__facts">
      <div><dt>Endereço IP</dt><dd>{ip && ip !== 'unknown' ? ip : 'Não registrado'}</dd></div>
      <div><dt>Dispositivo informado</dt><dd>{describeBrowser(context?.user_agent)}</dd></div>
      {context?.path && <div><dt>Requisição</dt><dd>{context.method} {context.path}</dd></div>}
      {requestedAt && Number.isFinite(requestedAt.getTime()) && <div><dt>Horário da requisição (Bahia)</dt><dd>{formatRequestTime.format(requestedAt)}</dd></div>}
      {event.details?.http_status && <div><dt>Resposta HTTP</dt><dd>{event.details.http_status}</dd></div>}
      {context?.request_id && <div><dt>ID da requisição</dt><dd>{context.request_id}</dd></div>}
      {context?.cloudflare_ray && <div><dt>Ray ID informado</dt><dd>{context.cloudflare_ray}</dd></div>}
      {event.details?.audit_session_id && <div><dt>ID de auditoria da sessão</dt><dd>{event.details.audit_session_id}</dd></div>}
      {context?.user_agent && <div><dt>Identificação enviada pelo navegador</dt><dd>{context.user_agent}</dd></div>}
    </dl>
    {open && showLocation && <div className="audit-access__location">
      <strong>Localização aproximada do IP</strong>
      {location?.status === 'located' && <Suspense fallback={<small>Carregando mapa…</small>}>
        <AuditIpMap location={location} label={label} />
      </Suspense>}
      {location?.status === 'located' || location?.status === 'no_coordinates' ? <>
        <span>{label || 'Localidade sem nome na base'}</span>
        {location.status === 'no_coordinates' && <small>Coordenadas indisponíveis.</small>}
        {Number.isFinite(location.radius_km) && location.radius_km > 0 && <small>Raio estimado de {location.radius_km} km.</small>}
        <small>Estimativa da rede pela base atual. A estação e a pessoa não são identificadas pelo mapa.</small>
        <small><a href="https://db-ip.com" target="_blank" rel="noreferrer">Geolocalização por DB-IP</a>
          {location.database_date && <> · Base de {location.database_date.split('-').reverse().join('/')}</>}
          {location.status === 'located' && <> · Mapa Natural Earth</>}
        </small>
      </> : <small role="status">{locationStates[location?.status] || (location ? 'Não foi possível consultar a localização.' : 'Consultando a base local…')}</small>}
    </div>}
  </details>
}
