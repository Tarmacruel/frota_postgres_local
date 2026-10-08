import { useEffect, useRef } from 'react'
import Modal from '../Modal'

export default function AnalyticsEntityDrawer({ detail, canGoBack, onBack, onClose, children }) {
  const contentRef = useRef(null)
  useEffect(() => { if (detail) contentRef.current?.focus() }, [detail])
  return (
    <Modal open={Boolean(detail)} title={detail?.title || 'Detalhamento analítico'}
      description="Contexto da seleção" onClose={onClose} onEscape={canGoBack ? onBack : onClose}
      className="analytics-drawer" backdropClassName="analytics-drawer-backdrop" initialFocusRef={contentRef}>
      <div className="analytics-drawer__content" ref={contentRef} tabIndex={-1}>
        {canGoBack ? <button type="button" className="ghost-button" onClick={onBack}>← Voltar</button> : null}
        <p className="analytics-context-label">{detail?.entityType === 'driver' ? 'Condutor selecionado' : 'Veículo selecionado'}</p>
        {children || <><h4>Detalhamento ainda não disponível</h4>
        <p>Os registros que compõem esta análise ainda não estão disponíveis neste painel.</p>
        <p className="muted">Feche para continuar a consulta. Seus filtros e a seção selecionada serão mantidos.</p></>}
      </div>
    </Modal>
  )
}
