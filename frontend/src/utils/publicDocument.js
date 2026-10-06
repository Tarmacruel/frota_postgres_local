const PRIVATE_SIGNATURE_FIELDS = new Set([
  'signature_summary',
  'signatures',
  'certificate_validation',
  'signature_validation',
  'certified_artifact',
  'certified_artifact_url',
  'certificate_artifact_url',
])

export function stripSignatureEvidence(record) {
  if (!record || typeof record !== 'object') return record
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !PRIVATE_SIGNATURE_FIELDS.has(key)),
  )
}
