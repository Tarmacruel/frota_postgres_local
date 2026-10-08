import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { vehicleLoansAPI } from '../api/vehicleLoans'
import { documentSignaturesAPI } from '../api/documentSignatures'
import { getApiErrorMessage } from '../utils/apiError'
import { formatLoanDate } from '../utils/vehicleLoans'

const MAX_PRINTED_TERMS = 10

function Term({ document, loanId, onChanged }) {
  const { user, canEdit } = useAuth()
  const [password, setPassword] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const rep = document.snapshot?.representatives?.find((item) => item.user_id === user.id)
  const signed = document.signatures.some((item) => item.signer_user_id === user.id)
  const allowed = canEdit('vehicle_loans') && rep && !signed && document.status === 'PENDING'
    && (user.role === 'ADMIN' || (user.role === 'PRODUCAO' && user.organization_id === rep.organization_id))

  async function download(original = false) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const { data } = original ? await documentSignaturesAPI.downloadArtifact(document.document_id, 'canonical')
        : await vehicleLoansAPI.downloadTerm(loanId, document.document_id)
      const url = URL.createObjectURL(data)
      const link = window.document.createElement('a')
      link.href = url; link.download = `termo-${original ? 'original-' : ''}${document.document_id}.pdf`
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (!original) setReviewed(true)
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível baixar o termo.')) }
    finally { busyRef.current = false; setBusy(false) }
  }
  async function sign(event) {
    event.preventDefault()
    if (busyRef.current || !allowed || !reviewed) return
    busyRef.current = true; setBusy(true); setError('')
    try {
      const { data } = await documentSignaturesAPI.sign(document.document_id, { current_password: password })
      onChanged(data)
    } catch (err) { setError(getApiErrorMessage(err, 'Não foi possível registrar a assinatura. Atualize a consulta antes de tentar novamente.')) }
    finally { setPassword(''); busyRef.current = false; setBusy(false) }
  }
  return <article className="loan-notice" aria-label={document.title}>
    <h4>{document.title}</h4>
    <p><strong>{document.is_complete ? 'Assinado pelos dois representantes' : 'Assinaturas pendentes'}</strong> · {document.signed_count}/2 assinaturas</p>
    <p>Emitido em {formatLoanDate(document.created_at)}. O conteúdo preserva os dados do aceite.</p>
    <ul>{document.snapshot?.representatives?.map((item) => {
      const signature = document.signatures.find((entry) => entry.signer_user_id === item.user_id)
      return <li key={item.user_id}>{item.role}: {item.name} · {item.organization_name} — {signature ? `assinou em ${formatLoanDate(signature.signed_at)}` : 'assinatura pendente'}</li>
    })}</ul>
    <div className="actions-inline">
      <button className="ghost-button" disabled={busy} onClick={() => download()}>Baixar termo e evidências</button>
      {document.canonical_artifact_available && <button className="ghost-button" disabled={busy} onClick={() => download(true)}>Baixar PDF original preservado</button>}
    </div>
    {allowed && <form className="loan-form" onSubmit={sign}>
      <p>Você assina como {rep.role.toLowerCase()}, representando {rep.organization_name}. Baixe e confira o termo antes de assinar.</p>
      <label className="loan-field">Sua senha atual<input className="app-input" type="password" autoComplete="current-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
      <button className="app-button" disabled={busy || !reviewed || password.length < 8}>{busy ? 'Processando…' : 'Assinar termo com senha'}</button>
    </form>}
    {error && <p className="loan-error" role="alert">{error}</p>}
  </article>
}

export default function VehicleLoanDocuments({ loanId, regularized = false }) {
  const { canEdit } = useAuth()
  const [documents, setDocuments] = useState([])
  const [printedTerms, setPrintedTerms] = useState([])
  const [printedFile, setPrintedFile] = useState(null)
  const [printedBusy, setPrintedBusy] = useState(false)
  const [printedError, setPrintedError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let current = true
    setLoading(true); setError(''); setDocuments([])
    vehicleLoansAPI.documents(loanId).then(({ data }) => { if (current) setDocuments(data) })
      .catch((err) => { if (current) setError(getApiErrorMessage(err)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [loanId, revision])
  useEffect(() => {
    let current = true
    setPrintedTerms([])
    setPrintedFile(null)
    setPrintedError('')
    vehicleLoansAPI.printedTerms(loanId).then(({ data }) => { if (current) setPrintedTerms(data) })
      .catch((err) => { if (current) setPrintedError(getApiErrorMessage(err, 'Não foi possível consultar os termos impressos.')) })
    return () => { current = false }
  }, [loanId, revision])

  async function uploadPrinted(event) {
    event.preventDefault()
    if (!printedFile || printedBusy) return
    const form = event.currentTarget
    setPrintedBusy(true)
    setPrintedError('')
    try {
      const { data } = await vehicleLoansAPI.uploadPrintedTerm(loanId, printedFile)
      setPrintedTerms((items) => [...items, data])
      setPrintedFile(null)
      form.reset()
    } catch (err) {
      setPrintedError(getApiErrorMessage(err, 'Não foi possível anexar o termo impresso.'))
    } finally { setPrintedBusy(false) }
  }

  async function downloadPrinted(term) {
    setPrintedError('')
    try {
      const { data } = await vehicleLoansAPI.downloadPrintedTerm(loanId, term.id)
      const url = URL.createObjectURL(data)
      const link = window.document.createElement('a')
      link.href = url
      link.download = term.original_filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setPrintedError(getApiErrorMessage(err, 'Não foi possível baixar o termo impresso.')) }
  }
  return <section aria-label="Termos e assinaturas">
    <h3>Termos e assinaturas</h3>
    <p>A confirmação operacional não substitui as duas assinaturas. Assinatura por senha é uma evidência interna do sistema.</p>
    <button className="ghost-button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Atualizar assinaturas</button>
    {loading && <p role="status">Carregando termos…</p>}
    {error && <p role="alert" className="loan-error">{error}</p>}
    {regularized && <p>A regularização administrativa não gera termo nem assinaturas retroativos. Uma devolução confirmada pelo fluxo atual terá seu próprio termo.</p>}
    {!regularized && !loading && !error && !documents.length && <p>O termo de empréstimo será emitido no aceite da entrega; o de devolução, no aceite do retorno.</p>}
    {documents.map((document) => <Term key={document.document_id} document={document} loanId={loanId}
      onChanged={(updated) => setDocuments((items) => items.map((item) => item.document_id === updated.document_id ? updated : item))} />)}
    <div className="loan-notice">
      <h4>Termo de empréstimo impresso</h4>
      <p>Anexe uma digitalização em PDF, JPG ou PNG de até 10 MB (máximo de 10 anexos por empréstimo). Ela fica separada dos termos e assinaturas digitais.</p>
      {canEdit('vehicle_loans') && printedTerms.length < MAX_PRINTED_TERMS && <form className="loan-form" onSubmit={uploadPrinted}>
        <label className="loan-field">Arquivo do termo impresso
          <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => setPrintedFile(event.target.files?.[0] || null)} disabled={printedBusy} />
        </label>
        <button type="submit" className="app-button" disabled={!printedFile || printedBusy}>{printedBusy ? 'Enviando…' : 'Anexar termo impresso'}</button>
      </form>}
      {canEdit('vehicle_loans') && printedTerms.length >= MAX_PRINTED_TERMS && <p>Limite de 10 termos impressos atingido.</p>}
      {printedTerms.length === 0 && <p>Nenhum termo impresso anexado.</p>}
      {printedTerms.map((term) => <div className="actions-inline" key={term.id}>
        <span>{term.original_filename} · {formatLoanDate(term.created_at)}</span>
        <button type="button" className="ghost-button" onClick={() => downloadPrinted(term)}>Baixar anexo</button>
      </div>)}
      {printedError && <p role="alert" className="loan-error">{printedError}</p>}
    </div>
  </section>
}
