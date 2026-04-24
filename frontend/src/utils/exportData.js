import { officialBrand } from '../constants/officialBrand'

function normalizeValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function createXlsxCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, type: 'number' }
  }

  return { value: normalizeValue(value), type: 'string' }
}

function normalizeFilters(filters = []) {
  return filters
    .map((filter) => {
      if (!filter) return null

      if (typeof filter === 'string') {
        const text = filter.trim()
        return text ? text : null
      }

      const label = String(filter.label || '').trim()
      const value = String(filter.value || '').trim()
      if (!label || !value) return null

      return `${label}: ${value}`
    })
    .filter(Boolean)
}

function normalizeSummaryMetrics(metrics = []) {
  return metrics
    .map((metric) => {
      if (!metric) return null

      const label = String(metric.label || '').trim()
      const value = metric.value === null || metric.value === undefined || metric.value === '' ? '-' : String(metric.value)
      if (!label) return null

      return `${label}: ${value}`
    })
    .filter(Boolean)
}

function formatDateTimeLabel(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  const dateLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)

  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)

  return `${dateLabel} as ${timeLabel}`
}

function buildReportCode(title, generatedAt, rowsLength) {
  const date = generatedAt
    .toISOString()
    .slice(0, 10)
    .replaceAll('-', '')

  const stem = Math.abs(
    `${title}-${generatedAt.toISOString()}-${rowsLength}`
      .split('')
      .reduce((accumulator, char) => ((accumulator << 5) - accumulator) + char.charCodeAt(0), 0),
  )
    .toString(16)
    .toUpperCase()
    .slice(0, 6)

  return `PMTF-${date}-${stem}`
}

function computeOrientation(columns, forcedOrientation) {
  if (forcedOrientation) return forcedOrientation
  return columns.length > 6 ? 'landscape' : 'portrait'
}

let optimizedLogoPromise

async function loadImageDataUrlFromBlob(blob) {
  if (typeof window !== 'undefined' && typeof window.createImageBitmap === 'function') {
    const bitmap = await window.createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })
    const maxWidth = 150
    const scale = Math.min(1, maxWidth / bitmap.width)
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.68)
  }

  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Não foi possível carregar o brasao oficial.'))
      element.src = objectUrl
    })

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })
    const maxWidth = 150
    const scale = Math.min(1, maxWidth / image.width)
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return canvas.toDataURL('image/jpeg', 0.68)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function loadOptimizedLogo() {
  if (!optimizedLogoPromise) {
    optimizedLogoPromise = (async () => {
      const response = await fetch(officialBrand.logoPath)
      if (!response.ok) {
        throw new Error('Não foi possível carregar o brasao oficial.')
      }

      const blob = await response.blob()
      return loadImageDataUrlFromBlob(blob)
    })()
  }

  return optimizedLogoPromise
}

function getColumnStyles(columns) {
  return Object.fromEntries(columns.map((column, index) => ([
    index,
    {
      halign: column.align || 'left',
      cellWidth: column.width || 'auto',
    },
  ])))
}

async function buildPdfDocument({
  title,
  columns,
  rows,
  subtitle,
  filters = [],
  summaryMetrics = [],
  reportCode,
  referenceLabel,
  responsibleSector = 'Departamento de Gestao da Frota',
  orientation,
  generatedBy = 'Sistema oficial da frota municipal',
}) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const generatedAt = new Date()
  const normalizedFilters = normalizeFilters(filters)
  const normalizedMetrics = normalizeSummaryMetrics(summaryMetrics)
  const reportLabel = reportCode || buildReportCode(title, generatedAt, rows.length)

  const doc = new jsPDF({
    orientation: computeOrientation(columns, orientation),
    unit: 'pt',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  })

  const logoDataUrl = await loadOptimizedLogo().catch(() => null)
  const totalPagesExp = '{total_pages_count_string}'
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 42
  const headerTop = 34
  const footerHeight = 28

  function drawHeader() {
    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'JPEG', marginX, headerTop + 2, 28, 36, undefined, 'FAST')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(33, 37, 41)
    doc.text('PREFEITURA MUNICIPAL DE TEIXEIRA DE FREITAS', marginX + 38, headerTop + 14)

    doc.setFontSize(14)
    doc.text(title.toUpperCase(), marginX + 38, headerTop + 31)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(107, 114, 128)
    doc.text(`Emissao: ${formatDateTimeLabel(generatedAt)}`, pageWidth - marginX, headerTop + 14, { align: 'right' })
    doc.text(`Ref: ${reportLabel}`, pageWidth - marginX, headerTop + 29, { align: 'right' })

    doc.setDrawColor(221, 221, 221)
    doc.setLineWidth(0.8)
    doc.line(marginX, headerTop + 46, pageWidth - marginX, headerTop + 46)
  }

  function drawFooter() {
    const footerY = pageHeight - footerHeight
    doc.setDrawColor(221, 221, 221)
    doc.setLineWidth(0.6)
    doc.line(marginX, footerY - 8, pageWidth - marginX, footerY - 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(107, 114, 128)
    doc.text(`PMTF - ${responsibleSector} | Gerado em ${formatDateTimeLabel(generatedAt)} | ${generatedBy}`, marginX, footerY + 4)
    doc.text(`Pagina ${doc.getCurrentPageInfo().pageNumber} de ${totalPagesExp}`, pageWidth - marginX, footerY + 4, { align: 'right' })
  }

  function drawSummaryBlock() {
    let cursorY = headerTop + 64

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(75, 85, 99)

    const filtersLine = normalizedFilters.length
      ? `Filtros: ${normalizedFilters.join(' | ')}`
      : 'Filtros: Sem filtros especificos'

    const wrappedFilters = doc.splitTextToSize(filtersLine, pageWidth - (marginX * 2))
    doc.text(wrappedFilters, marginX, cursorY)
    cursorY += wrappedFilters.length * 12

    const metricsLine = normalizedMetrics.length
      ? normalizedMetrics.join(' | ')
      : `Total: ${rows.length}`

    const wrappedMetrics = doc.splitTextToSize(metricsLine, pageWidth - (marginX * 2))
    doc.text(wrappedMetrics, marginX, cursorY)
    cursorY += wrappedMetrics.length * 12

    if (subtitle) {
      const wrappedSubtitle = doc.splitTextToSize(subtitle, pageWidth - (marginX * 2))
      doc.text(wrappedSubtitle, marginX, cursorY)
      cursorY += wrappedSubtitle.length * 12
    }

    if (referenceLabel) {
      const wrappedReference = doc.splitTextToSize(referenceLabel, pageWidth - (marginX * 2))
      doc.text(wrappedReference, marginX, cursorY)
      cursorY += wrappedReference.length * 12
    }

    return cursorY + 6
  }

  const firstPageTableStartY = drawSummaryBlock()

  autoTable(doc, {
    startY: firstPageTableStartY,
    head: [columns.map((column) => column.header.toUpperCase())],
    body: rows.map((row) => columns.map((column) => normalizeValue(column.value(row)))),
    margin: {
      top: headerTop + 64,
      left: marginX,
      right: marginX,
      bottom: footerHeight + 10,
    },
    styles: {
      font: 'helvetica',
      fontSize: 8.8,
      cellPadding: { top: 8, right: 8, bottom: 8, left: 8 },
      textColor: [31, 41, 55],
      lineColor: [229, 231, 235],
      lineWidth: { bottom: 0.5 },
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [249, 250, 251],
      textColor: [55, 65, 81],
      fontStyle: 'bold',
      halign: 'left',
      lineColor: [229, 231, 235],
      lineWidth: { bottom: 0.7 },
      cellPadding: { top: 7, right: 8, bottom: 7, left: 8 },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: getColumnStyles(columns),
    didDrawPage: () => {
      drawHeader()
      drawFooter()
    },
    didParseCell: (hook) => {
      if (hook.section === 'head') return

      const column = columns[hook.column.index]
      if (!column) return

      hook.cell.styles.lineWidth = { bottom: 0.5 }
      hook.cell.styles.lineColor = [229, 231, 235]
      hook.cell.styles.fillColor = hook.row.index % 2 === 1 ? [250, 250, 250] : [255, 255, 255]

      if (column.align) {
        hook.cell.styles.halign = column.align
      }
    },
  })

  if (typeof doc.putTotalPages === 'function') {
    doc.putTotalPages(totalPagesExp)
  }

  return doc
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}

export async function exportRowsToXlsx({ fileName, sheetName, columns, rows, filters = [] }) {
  const { default: zipcelx } = await import('zipcelx')
  const now = new Date().toLocaleString('pt-BR')
  const normalizedFilters = normalizeFilters(filters)
  const sheetRows = [
    [createXlsxCell(officialBrand.municipality)],
    [createXlsxCell(`${officialBrand.systemName} | ${sheetName}`)],
    [createXlsxCell(officialBrand.addressLine)],
    [createXlsxCell(`CNPJ ${officialBrand.cnpj} | Gerado em ${now}`)],
    ...(normalizedFilters.length ? normalizedFilters.map((filter) => [createXlsxCell(filter)]) : []),
    [],
    columns.map((column) => createXlsxCell(column.header)),
    ...rows.map((row) => columns.map((column) => createXlsxCell(column.value(row)))),
  ]

  await zipcelx({
    filename: fileName,
    sheet: {
      data: sheetRows,
    },
  })
}

export async function exportRowsToPdf(options) {
  const doc = await buildPdfDocument(options)
  const blob = doc.output('blob')
  downloadBlob(blob, options.fileName)
}

export async function previewRowsToPdf(options) {
  const previewWindow = window.open('', '_blank')
  if (previewWindow) {
    previewWindow.document.write(`
      <html lang="pt-BR">
        <head>
          <title>Gerando PDF...</title>
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
        <body>Gerando relatorio em PDF...</body>
      </html>
    `)
    previewWindow.document.close()
  }

  try {
    const doc = await buildPdfDocument(options)
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    if (previewWindow) {
      previewWindow.location.replace(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 120000)
      return
    }

    downloadBlob(blob, options.fileName)
  } catch (error) {
    if (previewWindow) {
      previewWindow.close()
    }
    throw error
  }
}
