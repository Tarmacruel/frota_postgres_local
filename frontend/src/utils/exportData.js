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
      if (typeof filter === 'string') return filter.trim() || null
      const label = String(filter.label || '').trim()
      const value = String(filter.value || '').trim()
      if (!label || !value) return null
      return `${label}: ${value}`
    })
    .filter(Boolean)
}

async function loadLogoAsDataUrl() {
  const response = await fetch(officialBrand.logoPath)
  if (!response.ok) {
    throw new Error('Nao foi possivel carregar o brasao oficial.')
  }

  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Nao foi possivel converter o brasao oficial.'))
    reader.readAsDataURL(blob)
  })
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

async function buildPdfDocument({ title, columns, rows, subtitle, filters = [] }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const now = new Date().toLocaleString('pt-BR')
  const logoDataUrl = await loadLogoAsDataUrl().catch(() => null)
  const normalizedFilters = normalizeFilters(filters)

  const brandBlue = [36, 82, 232]
  const brandBlueDark = [23, 57, 183]
  const softInk = [102, 117, 140]

  function drawOfficialHeader() {
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()

    doc.setFillColor(...brandBlue)
    doc.roundedRect(26, 22, pageWidth - 52, 96, 24, 24, 'F')
    doc.setFillColor(255, 255, 255)
    doc.roundedRect(34, 30, pageWidth - 68, 80, 20, 20, 'F')

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'PNG', 46, 38, 50, 64)
    }

    doc.setTextColor(...brandBlueDark)
    doc.setFontSize(16)
    doc.text(officialBrand.municipality, 110, 54)
    doc.setFontSize(11)
    doc.text(officialBrand.addressLine, 110, 72)
    doc.text(`CNPJ ${officialBrand.cnpj}`, 110, 88)

    doc.setFontSize(19)
    doc.text(title, pageWidth - 44, 58, { align: 'right' })
    doc.setTextColor(...softInk)
    doc.setFontSize(10)
    doc.text(subtitle || 'Relatorio exportado do ambiente oficial da frota municipal.', pageWidth - 44, 76, { align: 'right' })
    doc.text(`Gerado em ${now}`, pageWidth - 44, 92, { align: 'right' })

    let bottomY = 118
    if (normalizedFilters.length) {
      const filtersLabel = `Filtros ativos | ${normalizedFilters.join(' | ')}`
      const wrappedFilters = doc.splitTextToSize(filtersLabel, pageWidth - 88)
      doc.setTextColor(...brandBlueDark)
      doc.setFontSize(9)
      doc.text(wrappedFilters, 44, 116)
      bottomY = 116 + (wrappedFilters.length * 12)
    }

    doc.setDrawColor(215, 225, 242)
    doc.line(34, pageHeight - 28, pageWidth - 34, pageHeight - 28)
    doc.setTextColor(...softInk)
    doc.setFontSize(9)
    doc.text(officialBrand.reportFooter, 36, pageHeight - 14)
    doc.text(`Pagina ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 36, pageHeight - 14, { align: 'right' })
    return bottomY
  }

  const tableStartY = drawOfficialHeader() + 18

  autoTable(doc, {
    startY: tableStartY,
    head: [columns.map((column) => column.header)],
    body: rows.map((row) => columns.map((column) => normalizeValue(column.value(row)))),
    margin: { left: 28, right: 28, bottom: 28 },
    styles: {
      fontSize: 9,
      cellPadding: 8,
      textColor: [23, 50, 74],
      lineColor: [220, 228, 237],
      lineWidth: 0.5,
    },
    headStyles: {
      fillColor: brandBlue,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 255],
    },
    didDrawPage: drawOfficialHeader,
  })

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
              color: #1739b7;
              background: #eef3fd;
            }
          </style>
        </head>
        <body>Gerando pre-visualizacao do PDF...</body>
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
