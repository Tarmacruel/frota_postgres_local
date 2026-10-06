import { appEnvironment } from '../config/environment'

export default function EnvironmentBanner({ enabled = appEnvironment.isHomologation }) {
  if (!enabled) return null

  return (
    <div className="environment-banner" role="status" aria-label="Ambiente de homologação">
      <strong>AMBIENTE DE HOMOLOGAÇÃO</strong>
      <span>Dados de teste controlados. Não utilize para operação oficial.</span>
    </div>
  )
}
