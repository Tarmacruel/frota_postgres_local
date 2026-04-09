import { officialBrand } from '../constants/officialBrand'

function normalizeValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

function downloadBlob(buffer, fileName, mimeType) {
  const blob = new Blob([buffer], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
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
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 6 }],
  })
  const now = new Date().toLocaleString('pt-BR')
  const logoDataUrl = await loadLogoAsDataUrl().catch(() => null)

  workbook.creator = officialBrand.municipality
  workbook.lastModifiedBy = officialBrand.systemName
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.subject = sheetName
  workbook.title = `${officialBrand.systemName} - ${sheetName}`

  if (logoDataUrl) {
    const imageId = workbook.addImage({
      base64: logoDataUrl,
      extension: 'png',
    })
    worksheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 78, height: 96 },
    })
  }

  worksheet.mergeCells('C1:H1')
  worksheet.getCell('C1').value = officialBrand.municipality
  worksheet.getCell('C1').font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FF1739B7' } }
  worksheet.getCell('C1').alignment = { vertical: 'middle' }

  worksheet.mergeCells('C2:H2')
  worksheet.getCell('C2').value = `${officialBrand.systemName} | ${sheetName}`
  worksheet.getCell('C2').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF2452E8' } }

  worksheet.mergeCells('C3:H3')
  worksheet.getCell('C3').value = officialBrand.addressLine
  worksheet.getCell('C3').font = { name: 'Arial', size: 10, color: { argb: 'FF66758C' } }

  worksheet.mergeCells('C4:H4')
  worksheet.getCell('C4').value = `CNPJ ${officialBrand.cnpj} | Gerado em ${now}`
  worksheet.getCell('C4').font = { name: 'Arial', size: 10, color: { argb: 'FF66758C' } }

  worksheet.addRow([])
  const headerRow = worksheet.addRow(columns.map((column) => column.header))
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2452E8' },
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD6E0F0' } },
      left: { style: 'thin', color: { argb: 'FFD6E0F0' } },
      bottom: { style: 'thin', color: { argb: 'FFD6E0F0' } },
      right: { style: 'thin', color: { argb: 'FFD6E0F0' } },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })

  rows.forEach((row, index) => {
    const dataRow = worksheet.addRow(columns.map((column) => normalizeValue(column.value(row))))
    dataRow.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF20304A' } }
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE4EBF5' } },
        left: { style: 'thin', color: { argb: 'FFE4EBF5' } },
        bottom: { style: 'thin', color: { argb: 'FFE4EBF5' } },
        right: { style: 'thin', color: { argb: 'FFE4EBF5' } },
      }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: index % 2 === 0 ? 'FFF8FAFF' : 'FFFFFFFF' },
      }
    })
  })

  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.header,
    width: Math.min(34, Math.max(16, column.header.length + 6)),
  }))

  worksheet.getRow(1).height = 28
  worksheet.getRow(2).height = 22
  worksheet.getRow(3).height = 20
  worksheet.getRow(4).height = 20
  worksheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  }

  const buffer = await workbook.xlsx.writeBuffer()
  downloadBlob(buffer, `${fileName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
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
