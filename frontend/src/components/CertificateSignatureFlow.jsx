import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CERTIFICATE_SESSION_STATUSES,
  documentSignaturesAPI,
  isCertificateSessionTerminal,
} from '../api/documentSignatures'
import { signatureAgentClient } from '../api/signatureAgent'
import { getApiErrorMessage } from '../utils/apiError'
import { downloadBlobResponse } from '../utils/downloadResponse'

const STATUS_LABELS = {
  CREATED: 'Sessão criada',
  CERTIFICATE_VALIDATED: 'Certificado validado',
  AWAITING_SIGNATURE: 'Aguardando confirmação no agente',
  FINALIZING: 'Finalizando PDF certificado',
  COMPLETED: 'Assinatura concluída',
  FAILED: 'Falha na assinatura',
  CANCELLED: 'Sessão cancelada',
  EXPIRED: 'Sessão expirada',
}

function normalizeSession(payload) {
  if (!payload) return null
  const envelope = payload.session || payload.certificate_session || payload
  const status = String(envelope.status || payload.status || CERTIFICATE_SESSION_STATUSES.CREATED).toUpperCase()
  return {
    ...envelope,
    status,
    agent_request: envelope.agent_request || payload.agent_request,
    agent_token: envelope.agent_token || payload.agent_token,
    one_time_token: envelope.one_time_token || payload.one_time_token,
  }
}

function sessionIdOf(session) {
  return session?.id || session?.session_id || ''
}

function failureMessage(session) {
  return session?.failure_message
    || session?.error_message
    || session?.failure_reason
    || 'A assinatura não foi concluída. Revise o certificado e tente novamente.'
}

function deviceIdOf(device) {
  return device?.device_id || device?.device_fingerprint || device?.public_key_fingerprint || ''
}

function deviceItems(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.items || payload?.devices || payload?.results || []
}

function apiErrorCode(error) {
  const detail = error?.response?.data?.detail
  return typeof detail === 'object' ? detail?.code : detail
}

async function sha256Hex(blob) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Este navegador não permite verificar o hash do agente.')
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export default function CertificateSignatureFlow({
  documentId,
  contentHash,
  initialSession,
  onDocumentChanged,
  onFeedback,
  pollIntervalMs = 1500,
}) {
  const [session, setSession] = useState(() => normalizeSession(initialSession))
  const [agentState, setAgentState] = useState('checking')
  const [agentInfo, setAgentInfo] = useState(null)
  const [pairingState, setPairingState] = useState('checking')
  const [pairingCode, setPairingCode] = useState('')
  const [pairedDevice, setPairedDevice] = useState(null)
  const [pairingError, setPairingError] = useState('')
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const completedSessionRef = useRef('')
  const previousDocumentIdRef = useRef(documentId)
  const onDocumentChangedRef = useRef(onDocumentChanged)
  const onFeedbackRef = useRef(onFeedback)

  useEffect(() => {
    onDocumentChangedRef.current = onDocumentChanged
    onFeedbackRef.current = onFeedback
  }, [onDocumentChanged, onFeedback])

  useEffect(() => {
    const nextSession = normalizeSession(initialSession)
    const documentChanged = previousDocumentIdRef.current !== documentId
    previousDocumentIdRef.current = documentId
    if (documentChanged || sessionIdOf(nextSession)) {
      completedSessionRef.current = ''
      setSession(nextSession)
    }
  }, [documentId, initialSession])

  const refreshPairing = useCallback(async (localAgent) => {
    const localDeviceId = deviceIdOf(localAgent)
    if (!localDeviceId) {
      setPairedDevice(null)
      setPairingState('unknown')
      setPairingError('O agente não informou a identificação deste dispositivo.')
      return null
    }

    setPairingState('checking')
    setPairingError('')
    try {
      const { data } = await documentSignaturesAPI.listAgentDevices()
      const device = deviceItems(data).find((item) => (
        deviceIdOf(item).toLowerCase() === localDeviceId.toLowerCase()
        && String(item.status || 'ACTIVE').toUpperCase() === 'ACTIVE'
      ))
      setPairedDevice(device || null)
      setPairingState(device ? 'paired' : 'unpaired')
      if (!device) setRevokeConfirm(false)
      return device || null
    } catch (err) {
      setPairedDevice(null)
      setPairingState('unknown')
      setPairingError(getApiErrorMessage(err, 'Não foi possível confirmar o pareamento deste agente.'))
      return null
    }
  }, [])

  const checkAgent = useCallback(async () => {
    setAgentState('checking')
    setError('')
    setPairingError('')
    try {
      const data = await signatureAgentClient.health()
      setAgentInfo(data || {})
      setAgentState('available')
      await refreshPairing(data || {})
      return data || {}
    } catch (err) {
      setAgentInfo(null)
      setAgentState('unavailable')
      setPairedDevice(null)
      setPairingState('unknown')
      setError(err.message)
      return null
    }
  }, [refreshPairing])

  useEffect(() => {
    checkAgent()
  }, [checkAgent])

  const completeSession = useCallback(async (completedSession) => {
    const completedId = sessionIdOf(completedSession)
    if (!completedId || completedSessionRef.current === completedId) return
    completedSessionRef.current = completedId
    try {
      const { data } = await documentSignaturesAPI.getDocument(documentId)
      onDocumentChangedRef.current?.(data)
    } catch {
      // O polling da tela de origem fará a reconciliação se a atualização imediata falhar.
    }
    onFeedbackRef.current?.('Assinatura ICP-Brasil concluída e PDF certificado armazenado.')
  }, [documentId])

  const sessionId = sessionIdOf(session)
  const sessionStatus = session?.status || ''

  useEffect(() => {
    if (!sessionId || isCertificateSessionTerminal(sessionStatus)) return undefined

    let stopped = false
    let timer = null

    async function poll() {
      try {
        const { data } = await documentSignaturesAPI.getCertificateSession(sessionId)
        if (stopped) return
        const nextSession = normalizeSession(data)
        setSession(nextSession)
        setError('')
        if (nextSession?.status === CERTIFICATE_SESSION_STATUSES.COMPLETED) {
          await completeSession(nextSession)
          return
        }
        if (!isCertificateSessionTerminal(nextSession?.status)) {
          timer = window.setTimeout(poll, pollIntervalMs)
        }
      } catch (err) {
        if (stopped) return
        setError(getApiErrorMessage(err, 'Não foi possível atualizar o andamento da assinatura. Nova tentativa será feita automaticamente.'))
        timer = window.setTimeout(poll, pollIntervalMs)
      }
    }

    timer = window.setTimeout(poll, pollIntervalMs)
    return () => {
      stopped = true
      if (timer) window.clearTimeout(timer)
    }
  }, [completeSession, pollIntervalMs, sessionId, sessionStatus])

  async function openSessionInAgent(nextSession) {
    try {
      await signatureAgentClient.openSession(nextSession)
      setError('')
      onFeedbackRef.current?.('Sessão enviada ao agente. Confirme o certificado na janela aberta neste computador.')
      return true
    } catch (err) {
      setError(`${err.message} A sessão continua válida; abra o agente e use “Retomar no agente”.`)
      return false
    }
  }

  async function handleStart() {
    setBusy(true)
    setError('')
    try {
      const availableAgent = agentState === 'available' ? agentInfo : await checkAgent()
      if (!availableAgent) return
      if (pairingState !== 'paired') {
        setPairingError('Pareie este agente com sua conta antes de iniciar a assinatura.')
        return
      }
      const deviceId = deviceIdOf(availableAgent) || deviceIdOf(pairedDevice)
      if (!deviceId) {
        setPairingState('unknown')
        setPairingError('Não foi possível identificar o dispositivo pareado.')
        return
      }
      const { data } = await documentSignaturesAPI.createCertificateSession(documentId, { device_id: deviceId })
      const nextSession = normalizeSession(data)
      setSession(nextSession)
      completedSessionRef.current = ''
      await openSessionInAgent(nextSession)
    } catch (err) {
      const code = String(apiErrorCode(err) || '')
      if (code.includes('SIGNATURE_AGENT_PAIRING_REQUIRED')) {
        setPairedDevice(null)
        setPairingState('unpaired')
        setPairingError('O backend não reconheceu este agente. Faça o pareamento novamente.')
      } else if (code.includes('SIGNATURE_AGENT_DEVICE_SELECTION_REQUIRED')) {
        setPairingError('Há mais de um agente ativo. Revogue os dispositivos antigos ou tente novamente com este agente.')
      }
      setError(getApiErrorMessage(err, 'Não foi possível iniciar a assinatura com certificado.'))
    } finally {
      setBusy(false)
    }
  }

  async function handlePairAgent() {
    setBusy(true)
    setPairingError('')
    setError('')
    setPairingCode('')
    setPairingState('pairing')
    try {
      const availableAgent = agentState === 'available' ? agentInfo : await checkAgent()
      const localDeviceId = deviceIdOf(availableAgent)
      if (!availableAgent || !localDeviceId) {
        setPairingState('unknown')
        return
      }

      const { data: pairing } = await documentSignaturesAPI.createAgentPairing()
      setPairingCode(String(pairing?.pairing_code || pairing?.agent_request?.pairing_code || ''))
      const localResult = await signatureAgentClient.pair(pairing)
      const pairingId = pairing?.id || pairing?.pairing_id
      let backendPairing = null
      if (pairingId) {
        try {
          const response = await documentSignaturesAPI.getAgentPairing(pairingId)
          backendPairing = response.data
        } catch {
          // O POST local só retorna depois da conclusão autenticada no backend.
        }
      }

      const confirmedDeviceId = backendPairing?.device_id || localResult?.device_id || localDeviceId
      const refreshed = await refreshPairing({ ...availableAgent, device_id: confirmedDeviceId })
      const backendStatus = String(backendPairing?.status || localResult?.status || '').toUpperCase()
      if (!refreshed || !['COMPLETED', 'PAIRED'].includes(backendStatus)) {
        throw new Error('O backend não confirmou o dispositivo pareado como ativo.')
      }
      setRevokeConfirm(false)
      onFeedbackRef.current?.('Agente pareado com sua conta. A assinatura por certificado está liberada neste dispositivo.')
    } catch (err) {
      setPairingState('unpaired')
      setPairingError(getApiErrorMessage(err, err.message || 'Não foi possível parear o agente de assinatura.'))
    } finally {
      setPairingCode('')
      setBusy(false)
    }
  }

  async function handleRevokeAgent() {
    const deviceId = deviceIdOf(pairedDevice) || deviceIdOf(agentInfo)
    if (!deviceId) return
    setBusy(true)
    setPairingError('')
    try {
      await documentSignaturesAPI.revokeAgentDevice(deviceId)
      setPairedDevice(null)
      setPairingState('unpaired')
      setRevokeConfirm(false)
      onFeedbackRef.current?.('Pareamento revogado. Este agente não poderá iniciar novas assinaturas até ser pareado novamente.')
    } catch (err) {
      setPairingError(getApiErrorMessage(err, 'Não foi possível revogar o pareamento deste agente.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleResume() {
    if (!sessionId) return
    setBusy(true)
    setError('')
    try {
      const availableAgent = agentState === 'available' ? agentInfo : await checkAgent()
      if (!availableAgent) return
      await openSessionInAgent(session)
    } finally {
      setBusy(false)
    }
  }

  async function handleCancel() {
    if (!sessionId) return
    setBusy(true)
    setError('')
    try {
      const { data } = await documentSignaturesAPI.cancelCertificateSession(sessionId)
      setSession(normalizeSession(data || { ...session, status: CERTIFICATE_SESSION_STATUSES.CANCELLED }))
      onFeedbackRef.current?.('Sessão de certificado cancelada.')
    } catch (err) {
      setError(getApiErrorMessage(err, 'Não foi possível cancelar a sessão de certificado.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleDownloadAgent() {
    setBusy(true)
    setError('')
    try {
      const [{ data: manifest }, response] = await Promise.all([
        documentSignaturesAPI.getAgentManifest(),
        documentSignaturesAPI.downloadAgent(),
      ])
      const blob = response?.data instanceof Blob ? response.data : new Blob([response?.data || ''])
      const actualHash = await sha256Hex(blob)
      const manifestHash = String(manifest?.sha256 || '').toLowerCase()
      const headerHash = String(
        response?.headers?.['x-artifact-sha256']
        || response?.headers?.get?.('x-artifact-sha256')
        || '',
      ).toLowerCase()
      if (!/^[0-9a-f]{64}$/.test(manifestHash)
        || actualHash !== manifestHash
        || (headerHash && headerHash !== manifestHash)) {
        throw new Error('A integridade do instalador do agente não foi confirmada.')
      }
      downloadBlobResponse(response, 'FrotaSigner-HML.exe')
      const signatureState = manifest?.authenticode || 'não informado'
      onFeedbackRef.current?.(`Agente baixado com SHA-256 verificado. Authenticode: ${signatureState}.`)
    } catch (err) {
      setError(getApiErrorMessage(err, err.message || 'Não foi possível baixar o agente de assinatura.'))
    } finally {
      setBusy(false)
    }
  }

  const activeSession = Boolean(sessionId && !isCertificateSessionTerminal(sessionStatus))
  const canRestart = !activeSession && sessionStatus !== CERTIFICATE_SESSION_STATUSES.COMPLETED
  const statusLabel = STATUS_LABELS[sessionStatus] || sessionStatus
  const agentLabel = useMemo(() => {
    if (agentState === 'checking') return 'Verificando agente local...'
    if (agentState === 'available') {
      const version = agentInfo?.version ? ` v${agentInfo.version}` : ''
      return `Agente disponível${version}`
    }
    return 'Agente não detectado em 127.0.0.1:54174'
  }, [agentInfo?.version, agentState])
  const pairedDeviceId = deviceIdOf(pairedDevice) || deviceIdOf(agentInfo)

  return (
    <div className="certificate-signature-flow" aria-live="polite">
      <div className={`signature-agent-status is-${agentState}`}>
        <span aria-hidden="true" className="signature-agent-dot" />
        <span>{agentLabel}</span>
        <button type="button" className="mini-button" disabled={busy || agentState === 'checking'} onClick={checkAgent}>
          Verificar novamente
        </button>
      </div>

      {agentState === 'unavailable' ? (
        <div className="signature-agent-help">
          <span>Instale ou abra o agente portátil para acessar o certificado A1/A3 sem enviar a chave privada ao sistema.</span>
          <button type="button" className="secondary-button" disabled={busy} onClick={handleDownloadAgent}>
            Baixar agente de homologação
          </button>
        </div>
      ) : null}

      {agentState === 'available' ? (
        <div className={`signature-pairing-card is-${pairingState}`}>
          {pairingState === 'checking' ? <span>Confirmando pareamento com sua conta...</span> : null}
          {pairingState === 'pairing' ? (
            <span>
              Confirme se a janela do FrotaSigner mostra este código temporário:
              {' '}<strong className="signature-pairing-code">{pairingCode || 'aguardando...'}</strong>
            </span>
          ) : null}
          {pairingState === 'paired' ? (
            <>
              <div>
                <strong>Agente pareado para este usuário</strong>
                <span className="muted">Dispositivo {String(pairedDeviceId).slice(0, 12)}</span>
              </div>
              {!activeSession && !revokeConfirm ? (
                <button type="button" className="ghost-button danger" disabled={busy} onClick={() => setRevokeConfirm(true)}>
                  Revogar pareamento
                </button>
              ) : null}
              {!activeSession && revokeConfirm ? (
                <div className="signature-revoke-confirm">
                  <span>Este agente deixará de iniciar assinaturas para sua conta.</span>
                  <button type="button" className="ghost-button" disabled={busy} onClick={() => setRevokeConfirm(false)}>Manter</button>
                  <button type="button" className="ghost-button danger" disabled={busy} onClick={handleRevokeAgent}>Confirmar revogação</button>
                </div>
              ) : null}
            </>
          ) : null}
          {['unpaired', 'unknown'].includes(pairingState) ? (
            <>
              <span>Antes da primeira assinatura, vincule este agente à sua conta. O código temporário não será salvo no navegador.</span>
              <button type="button" className="secondary-button" disabled={busy} onClick={handlePairAgent}>
                {busy ? 'Pareando...' : 'Parear este agente'}
              </button>
            </>
          ) : null}
          {pairingError ? <div className="alert alert-error evidence-alert">{pairingError}</div> : null}
        </div>
      ) : null}

      {sessionId ? (
        <div className="certificate-session-card">
          <div>
            <span className="muted">Sessão ICP-Brasil</span>
            <strong>{statusLabel}</strong>
          </div>
          <code>{String(sessionId).slice(0, 12)}</code>
          {session?.expires_at ? <span className="muted">Expira em {new Date(session.expires_at).toLocaleString('pt-BR')}</span> : null}
        </div>
      ) : (
        <p className="muted certificate-signature-copy">
          O PDF e seu SHA-256 serão conferidos no agente antes do consentimento. PIN, senha e chave privada permanecem neste computador.
        </p>
      )}

      {contentHash ? (
        <div className="signature-hash-line">
          <span>SHA-256 a conferir</span>
          <code>{String(contentHash).slice(0, 20)}</code>
        </div>
      ) : null}

      {sessionStatus === CERTIFICATE_SESSION_STATUSES.FAILED ? (
        <div className="alert alert-error evidence-alert">{failureMessage(session)}</div>
      ) : null}
      {sessionStatus === CERTIFICATE_SESSION_STATUSES.EXPIRED ? (
        <div className="alert alert-info evidence-alert">A sessão expirou. Inicie outra para gerar um novo token de uso único.</div>
      ) : null}
      {error ? <div className="alert alert-error evidence-alert">{error}</div> : null}

      <div className="actions-inline certificate-signature-actions">
        {canRestart ? (
          <button type="button" className="app-button" disabled={busy || agentState !== 'available' || pairingState !== 'paired'} onClick={handleStart}>
            {pairingState !== 'paired' ? 'Pareie o agente para continuar' : busy ? 'Preparando...' : 'Iniciar assinatura ICP-Brasil'}
          </button>
        ) : null}
        {activeSession ? (
          <>
            <button type="button" className="secondary-button" disabled={busy || agentState !== 'available'} onClick={handleResume}>
              Retomar no agente
            </button>
            <button type="button" className="ghost-button danger" disabled={busy} onClick={handleCancel}>
              Cancelar sessão
            </button>
          </>
        ) : null}
      </div>
    </div>
  )
}
