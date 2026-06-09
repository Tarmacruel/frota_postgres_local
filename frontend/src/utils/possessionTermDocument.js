import { officialBrand } from '../constants/officialBrand'
import { formatDateTimeLabel, loadOptimizedLogo } from './exportData'

const TERM_CONFIG = {
  loan: {
    title: 'TERMO DE EMPRÉSTIMO DE VEÍCULO',
    filePrefix: 'termo-emprestimo',
    validationField: 'loan_term_validation_code',
    validationPathField: 'loan_term_public_validation_path',
  },
  return: {
    title: 'TERMO DE DEVOLUÇÃO DE VEÍCULO',
    filePrefix: 'termo-devolucao',
    validationField: 'return_term_validation_code',
    validationPathField: 'return_term_public_validation_path',
  },
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('pt-BR')
}

function formatTime(value) {
  if (!value) return '-'
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || value === '') return '-'
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function getDriverDocument(record) {
  return record.driver_document || record.driver_document_masked || '-'
}

function formatEmissionDateTime(value) {
  return formatDateTimeLabel(value).replace(' as ', ' às ')
}

function truncateText(value, maxLength = 220) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength - 1).trim()}…`
}

export function resolvePossessionTermValidationUrl(path) {
  if (!path) return ''
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}

function getTermConfig(termType) {
  return TERM_CONFIG[termType] || TERM_CONFIG.loan
}

function getValidationCode(record, termType) {
  const config = getTermConfig(termType)
  return record[config.validationField] || record.validation_code || '-'
}

function getValidationPath(record, termType) {
  const config = getTermConfig(termType)
  return record[config.validationPathField] || record.public_validation_path || ''
}

function buildFileName(record, termType) {
  const config = getTermConfig(termType)
  const plate = String(record.vehicle_plate || 'veiculo').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const code = String(getValidationCode(record, termType)).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${config.filePrefix}-${plate}-${code}`.replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}

async function buildDocument(record, termType = 'loan') {
  const [{ default: jsPDF }, { default: QRCode }] = await Promise.all([
    import('jspdf'),
    import('qrcode'),
  ])

  const config = getTermConfig(termType)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  })

  const logoDataUrl = await loadOptimizedLogo().catch(() => null)
  const validationUrl = resolvePossessionTermValidationUrl(getValidationPath(record, termType))
  const validationCode = getValidationCode(record, termType)
  const signatureSummary = record.signature_summary?.[termType] || record.signature_summary || null
  const qrCodeDataUrl = validationUrl
    ? await QRCode.toDataURL(validationUrl, {
      margin: 1,
      width: 180,
      color: {
        dark: officialBrand.colors.ink,
        light: '#ffffff',
      },
    }).catch(() => null)
    : null

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 42
  const contentWidth = pageWidth - (marginX * 2)
  const footerY = pageHeight - 24
  const validationBlockHeight = 76
  const validationBlockY = pageHeight - 126
  let cursorY = 48

  function drawHeader() {
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'JPEG', marginX, 28, 32, 40, undefined, 'FAST')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.2)
    doc.setTextColor(32, 48, 74)
    doc.text(officialBrand.municipality.toUpperCase(), marginX + 42, 42)
    doc.setFontSize(17)
    doc.text(config.title, pageWidth / 2, 82, { align: 'center' })
    doc.setDrawColor(36, 82, 232)
    doc.setLineWidth(1)
    doc.line(marginX, 92, pageWidth - marginX, 92)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor(102, 117, 140)
    doc.text(`Código de validação: ${validationCode}`, pageWidth - marginX, 38, { align: 'right' })
    doc.text(`Emissão: ${formatEmissionDateTime(new Date())}`, pageWidth - marginX, 50, { align: 'right' })
  }

  function addParagraph(text, y, options = {}) {
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
    doc.setFontSize(options.size || 8.35)
    doc.setTextColor(31, 41, 55)
    const lines = doc.splitTextToSize(text, options.width || contentWidth)
    doc.text(lines, marginX, y, { align: options.align || 'justify', maxWidth: options.width || contentWidth })
    return y + (lines.length * (options.lineHeight || 10.2))
  }

  function addSectionTitle(title, y) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(36, 82, 232)
    doc.text(title, marginX, y)
    return y + 10
  }

  function addLineField(label, value, y, options = {}) {
    const labelWidth = options.labelWidth || 116
    const fieldWidth = options.width || 292
    const valueX = marginX + labelWidth
    const lineEndX = Math.min(marginX + fieldWidth, pageWidth - marginX)
    const printableValue = truncateText(value === null || value === undefined || value === '' ? '-' : value, options.maxLength || 64)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.85)
    doc.setTextColor(31, 41, 55)
    doc.text(`${label}:`, marginX, y)
    doc.setDrawColor(123, 135, 153)
    doc.setLineWidth(0.5)
    doc.line(valueX, y + 3, lineEndX, y + 3)
    doc.text(String(printableValue), valueX + 4, y)
    return y + 16
  }

  function addValidationBlock(y) {
    const blockHeight = validationBlockHeight

    doc.setDrawColor(32, 48, 74)
    doc.setLineWidth(0.8)
    doc.roundedRect(marginX, y, contentWidth, blockHeight, 8, 8)

    if (qrCodeDataUrl) {
      doc.addImage(qrCodeDataUrl, 'PNG', marginX + 11, y + 11, 54, 54, undefined, 'FAST')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.3)
    doc.setTextColor(32, 48, 74)
    doc.text('VALIDAÇÃO DE AUTENTICIDADE', marginX + 78, y + 18)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor(55, 65, 81)
    const validationText = doc.splitTextToSize(
      'Este termo foi emitido pelo sistema oficial da frota municipal. Leia o QR Code ou acesse o link público para conferir sua autenticidade.',
      contentWidth - 92,
    )
    doc.text(validationText, marginX + 78, y + 32)
    doc.setFont('helvetica', 'bold')
    doc.text(`Código: ${validationCode}`, marginX + 78, y + 32 + (validationText.length * 8.3) + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(36, 82, 232)
    doc.text(
      doc.splitTextToSize(validationUrl || 'Link público indisponível', contentWidth - 92),
      marginX + 78,
      y + 32 + (validationText.length * 8.3) + 18,
    )

    return y + blockHeight + 18
  }

  function addDigitalSignatureBlock(y) {
    if (!signatureSummary?.document_id) return y

    const signatures = signatureSummary.signatures || []
    const signatureLines = signatures.length > 0
      ? signatures.map((signature) => `${signature.signer_name} - ${formatEmissionDateTime(signature.signed_at)}`)
      : ['Documento digital emitido, aguardando assinatura.']
    const lines = [
      `Status: ${signatureSummary.status || '-'}`,
      `Hash SHA-256: ${signatureSummary.content_hash || '-'}`,
      ...signatureLines,
    ]
    const blockLines = doc.splitTextToSize(lines.join('\n'), contentWidth - 18)
    const blockHeight = Math.max(48, (blockLines.length * 8.5) + 18)

    doc.setDrawColor(36, 82, 232)
    doc.setLineWidth(0.6)
    doc.roundedRect(marginX, y, contentWidth, blockHeight, 6, 6)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.6)
    doc.setTextColor(36, 82, 232)
    doc.text('ASSINATURAS DIGITAIS INTERNAS', marginX + 9, y + 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.9)
    doc.setTextColor(55, 65, 81)
    doc.text(blockLines, marginX + 9, y + 24)
    return y + blockHeight + 10
  }

  drawHeader()
  cursorY = 116

  const openingText = termType === 'return'
    ? 'Pelo presente termo, o(a) motorista abaixo identificado(a) declara a devolução do veículo ao setor responsável pela frota municipal, registrando as condições de retorno, a quilometragem final e as demais informações operacionais relacionadas à posse encerrada.'
    : 'Pelo presente termo, a Secretaria Municipal de Administração, na qualidade de responsável pelo veículo abaixo descrito, cede em empréstimo o referido bem ao(à) motorista identificado(a), ficando o veículo sob sua responsabilidade, conforme as condições estabelecidas a seguir.'

  cursorY = addParagraph(openingText, cursorY)
  cursorY += 11

  cursorY = addSectionTitle('DADOS DO VEÍCULO', cursorY)
  cursorY = addLineField('Marca', record.vehicle_brand || '-', cursorY)
  cursorY = addLineField('Modelo', record.vehicle_model || '-', cursorY)
  cursorY = addLineField('Placa', record.vehicle_plate || '-', cursorY)
  cursorY += 6

  cursorY = addSectionTitle(termType === 'return' ? 'DETALHES DA DEVOLUÇÃO' : 'DETALHES DO EMPRÉSTIMO', cursorY)
  cursorY = addLineField('Data de saída', formatDate(record.start_date), cursorY)
  cursorY = addLineField('Horário de saída', formatTime(record.start_date), cursorY)
  cursorY = addLineField('Quilometragem inicial', `${formatNumber(record.start_odometer_km)} km`, cursorY)
  if (termType === 'return') {
    cursorY = addLineField('Data de devolução', formatDate(record.end_date), cursorY)
    cursorY = addLineField('Horário de devolução', formatTime(record.end_date), cursorY)
    cursorY = addLineField('Quilometragem final', `${formatNumber(record.end_odometer_km)} km`, cursorY)
    cursorY = addLineField('Km rodados', `${formatNumber(record.kilometers_driven)} km`, cursorY)
  }
  cursorY += 6

  cursorY = addSectionTitle('DADOS DO MOTORISTA RESPONSÁVEL', cursorY)
  cursorY = addLineField('Nome completo', record.driver_name || '-', cursorY, { width: 388, maxLength: 84 })
  cursorY = addLineField('Documento', getDriverDocument(record), cursorY)
  if (record.driver_contact) {
    cursorY = addLineField('Contato', record.driver_contact, cursorY)
  }
  cursorY += 6

  const responsibilityText = termType === 'return'
    ? 'O(a) motorista declara que devolve o veículo ao setor responsável, comprometendo-se a comunicar eventuais danos, avarias, multas, infrações ou ocorrências verificadas durante o período de posse. A devolução não afasta a apuração posterior de responsabilidade por uso inadequado, omissão de informações ou prejuízos decorrentes da posse.'
    : 'O(a) motorista responsabiliza-se pelo uso adequado e pela conservação do veículo, comprometendo-se a utilizá-lo exclusivamente para fins institucionais e a devolvê-lo nas mesmas condições, ressalvado o desgaste natural. Quaisquer danos, infrações ou ocorrências deverão ser comunicados imediatamente à Secretaria Municipal de Administração, sendo o(a) motorista responsável por eventuais prejuízos decorrentes de uso inadequado ou negligência.'

  cursorY = addParagraph(responsibilityText, cursorY)
  if (record.observation) {
    cursorY += 6
    cursorY = addParagraph(`Observações: ${truncateText(record.observation, 180)}`, cursorY, { size: 7.7, lineHeight: 9.4 })
  }

  cursorY += 14
  cursorY = addParagraph('Por estarem de comum acordo, firmam o presente termo.', cursorY, { align: 'left' })
  cursorY += 19
  cursorY = addParagraph(`Teixeira de Freitas-BA, ${formatDate(termType === 'return' ? record.end_date : record.start_date)}.`, cursorY, { align: 'left' })

  const signatureY = Math.min(Math.max(cursorY + 38, 578), validationBlockY - 110)
  doc.setDrawColor(31, 41, 55)
  doc.line(marginX + 96, signatureY, pageWidth - marginX - 96, signatureY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.4)
  doc.setTextColor(31, 41, 55)
  doc.text(record.driver_name || 'Motorista responsável', pageWidth / 2, signatureY + 13, { align: 'center' })
  doc.text('Motorista responsável', pageWidth / 2, signatureY + 24, { align: 'center' })

  addDigitalSignatureBlock(signatureY + 36)
  addValidationBlock(validationBlockY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(102, 117, 140)
  doc.text(officialBrand.reportFooter, marginX, footerY, { maxWidth: contentWidth })

  return doc
}

export async function previewPossessionTermDocument(record, termType = 'loan') {
  const previewWindow = window.open('', '_blank')
  if (previewWindow) {
    previewWindow.document.write(`
      <html lang="pt-BR">
        <head>
          <title>Gerando termo...</title>
          <meta charset="utf-8" />
          <style>
            body {
              margin: 0;
              display: grid;
              place-items: center;
              min-height: 100vh;
              font-family: Arial, sans-serif;
              color: #374151;
              background: #ffffff;
            }
          </style>
        </head>
        <body>Gerando termo institucional em PDF...</body>
      </html>
    `)
    previewWindow.document.close()
  }

  try {
    const doc = await buildDocument(record, termType)
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    if (previewWindow) {
      previewWindow.location.replace(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 120000)
      return
    }

    downloadBlob(blob, buildFileName(record, termType))
  } catch (error) {
    if (previewWindow) previewWindow.close()
    throw error
  }
}

export async function downloadPossessionTermDocument(record, termType = 'loan') {
  const doc = await buildDocument(record, termType)
  const blob = doc.output('blob')
  downloadBlob(blob, buildFileName(record, termType))
}

export function getPossessionTermLabel(termType) {
  return termType === 'return' ? 'Termo de devolução' : 'Termo de empréstimo'
}
