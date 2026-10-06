import { useId, useRef, useState } from 'react'
import { driversAPI } from '../api/drivers'
import { useAuth } from '../context/AuthContext'
import { getApiErrorMessage } from '../utils/apiError'
import Modal from './Modal'

export default function DriverRegistrationModal({ driver, onSaved, onClose }) {
  const { canEdit } = useAuth()
  const canEditDriver = canEdit('drivers')
  const inputId = useId()
  const inputRef = useRef(null)
  const [matricula, setMatricula] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    event.stopPropagation()
    if (submitting || !canEditDriver) return
    if (!matricula.trim()) {
      setError('Informe a matrícula do condutor para prosseguir.')
      inputRef.current?.focus()
      return
    }
    try {
      setSubmitting(true)
      setError('')
      const { data } = await driversAPI.update(driver.id, { matricula: matricula.trim() })
      if (!data?.matricula?.trim()) throw new Error('Matrícula não salva')
      onSaved(data)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível salvar a matrícula. Tente novamente.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      title="Editar condutor"
      description="Este condutor está sem matrícula. Informe a matrícula para poder prosseguir."
      onClose={onClose}
      canClose={!submitting}
      initialFocusRef={inputRef}
    >
      <form className="stack" onSubmit={handleSubmit}>
        <div className="alert alert-info">Informe a matrícula deste condutor para continuar.</div>
        <div className="form-field">
          <strong>{driver.nome_completo}</strong>
          <span className="helper-text">Documento: {driver.documento}</span>
        </div>
        {canEditDriver ? (
          <div className="form-field">
            <label htmlFor={inputId}>Matrícula (obrigatória)</label>
            <input ref={inputRef} id={inputId} className="app-input" required maxLength={30} value={matricula} disabled={submitting} onChange={(event) => setMatricula(event.target.value)} />
          </div>
        ) : <div className="alert alert-error" role="alert">Você não tem permissão para editar condutores. Solicite o preenchimento da matrícula a um usuário autorizado antes de prosseguir.</div>}
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <div className="actions-inline modal-actions">
          {canEditDriver ? <button className="app-button" type="submit" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar e continuar'}</button> : null}
          <button className="ghost-button" type="button" disabled={submitting} onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </Modal>
  )
}
