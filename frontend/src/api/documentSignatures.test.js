import { describe, expect, it } from 'vitest'

import {
  CERTIFICATE_SESSION_STATUSES,
  certificateSignatureRoutes,
  isCertificateSessionTerminal,
  signatureAgentRoutes,
} from './documentSignatures'

describe('documentSignaturesAPI certificate contracts', () => {
  it('usa os endpoints autenticados definidos para sessão, artefatos e validação', () => {
    expect(certificateSignatureRoutes.createSession('document-1')).toBe('/documents/document-1/certificate-sessions')
    expect(certificateSignatureRoutes.session('session-1')).toBe('/certificate-sessions/session-1')
    expect(certificateSignatureRoutes.artifact('document-1', 'certified')).toBe('/documents/document-1/artifacts/certified')
    expect(certificateSignatureRoutes.validation('document-1')).toBe('/documents/document-1/validation')
  })

  it('mantém os endpoints autenticados de pareamento e revogação do agente', () => {
    expect(signatureAgentRoutes.pairings).toBe('/signature-agent/pairings')
    expect(signatureAgentRoutes.pairing('pairing-1')).toBe('/signature-agent/pairings/pairing-1')
    expect(signatureAgentRoutes.devices).toBe('/signature-agent/devices')
    expect(signatureAgentRoutes.device('ab/cd')).toBe('/signature-agent/devices/ab%2Fcd')
  })

  it('distingue estados intermediários de estados terminais', () => {
    expect(isCertificateSessionTerminal(CERTIFICATE_SESSION_STATUSES.AWAITING_SIGNATURE)).toBe(false)
    expect(isCertificateSessionTerminal(CERTIFICATE_SESSION_STATUSES.FINALIZING)).toBe(false)
    expect(isCertificateSessionTerminal(CERTIFICATE_SESSION_STATUSES.COMPLETED)).toBe(true)
    expect(isCertificateSessionTerminal(CERTIFICATE_SESSION_STATUSES.FAILED)).toBe(true)
    expect(isCertificateSessionTerminal(CERTIFICATE_SESSION_STATUSES.CANCELLED)).toBe(true)
    expect(isCertificateSessionTerminal(CERTIFICATE_SESSION_STATUSES.EXPIRED)).toBe(true)
  })
})
