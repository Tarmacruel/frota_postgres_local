import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppIcon } from '../components/AppIcon'
import Modal from '../components/Modal'
import { MODULE_AVAILABILITY } from '../constants/moduleAvailability'

const maintenance = MODULE_AVAILABILITY.possession

export default function PossessionMaintenancePage() {
  const [isNoticeOpen, setIsNoticeOpen] = useState(true)
  const dashboardLinkRef = useRef(null)

  return (
    <section className="surface-panel possession-maintenance-page" aria-labelledby="possession-maintenance-title">
      <div className="possession-maintenance-content">
        <div className="possession-maintenance-icon" aria-hidden="true">
          <AppIcon name="maintenance" />
        </div>

        <div className="possession-maintenance-copy">
          <span className="module-status-label">Atualização em andamento</span>
          <h2 id="possession-maintenance-title" className="section-title">O módulo de posses retorna em breve</h2>
          <p className="section-copy">
            Estamos implantando melhorias nos registros de posse, rotas, destinos e retornos.
            Durante este período, somente esta área ficará temporariamente indisponível.
          </p>
          <p className="possession-maintenance-deadline" role="status" aria-live="polite">
            <span>Previsão de retorno</span>
            <strong>{maintenance.expectedReturn}</strong>
          </p>
          <p className="possession-maintenance-assurance">
            As demais funcionalidades do sistema continuam disponíveis normalmente.
          </p>
        </div>

        <div className="possession-maintenance-actions">
          <Link className="app-button" to="/">Voltar ao painel</Link>
          <button className="secondary-button" type="button" onClick={() => setIsNoticeOpen(true)}>
            Ver aviso novamente
          </button>
        </div>
      </div>

      <Modal
        open={isNoticeOpen}
        title="Módulo de posses em atualização"
        description="Aviso temporário de indisponibilidade do módulo de posses."
        onClose={() => setIsNoticeOpen(false)}
        initialFocusRef={dashboardLinkRef}
      >
        <div className="possession-maintenance-modal-copy">
          <span className="module-status-label">Melhorias em implantação</span>
          <p>
            Estamos atualizando a área de posses para incluir uma experiência mais segura e clara
            no acompanhamento de rotas, destinos e retornos.
          </p>
          <p className="possession-maintenance-deadline" role="status" aria-live="polite">
            <span>Previsão de retorno</span>
            <strong>{maintenance.expectedReturn}</strong>
          </p>
          <p>
            Enquanto concluímos esta etapa, você pode continuar usando normalmente todas as outras
            funcionalidades do sistema.
          </p>
        </div>
        <div className="modal-actions possession-maintenance-modal-actions">
          <button className="ghost-button" type="button" onClick={() => setIsNoticeOpen(false)}>
            Fechar aviso
          </button>
          <Link ref={dashboardLinkRef} className="app-button" to="/">Continuar no painel</Link>
        </div>
      </Modal>
    </section>
  )
}
