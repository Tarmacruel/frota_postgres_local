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

export async function exportRowsToXlsx({ fileName, sheetName, columns, rows }) {
  const { default: zipcelx } = await import('zipcelx')
  const now = new Date().toLocaleString('pt-BR')
  const sheetRows = [
    [createXlsxCell(officialBrand.municipality)],
    [createXlsxCell(`${officialBrand.systemName} | ${sheetName}`)],
    [createXlsxCell(officialBrand.addressLine)],
    [createXlsxCell(`CNPJ ${officialBrand.cnpj} | Gerado em ${now}`)],
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

export async function exportRowsToPdf({ title, fileName, columns, rows, subtitle }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const now = new Date().toLocaleString('pt-BR')
  const logoDataUrl = await loadLogoAsDataUrl().catch(() => null)

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

    doc.setDrawColor(215, 225, 242)
    doc.line(34, pageHeight - 28, pageWidth - 34, pageHeight - 28)
    doc.setTextColor(...softInk)
    doc.setFontSize(9)
    doc.text(officialBrand.reportFooter, 36, pageHeight - 14)
    doc.text(`Pagina ${doc.getCurrentPageInfo().pageNumber}`, pageWidth - 36, pageHeight - 14, { align: 'right' })
  }

  drawOfficialHeader()

  autoTable(doc, {
    startY: 132,
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

  doc.save(`${fileName}.pdf`)
}
