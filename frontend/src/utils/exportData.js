function normalizeValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  return String(value)
}

export async function exportRowsToXlsx({ fileName, sheetName, columns, rows }) {
  const XLSX = await import('xlsx')
  const worksheetRows = rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column.header, normalizeValue(column.value(row))])),
  )

  const worksheet = XLSX.utils.json_to_sheet(worksheetRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  XLSX.writeFile(workbook, `${fileName}.xlsx`)
}

export async function exportRowsToPdf({ title, fileName, columns, rows, subtitle }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const now = new Date().toLocaleString('pt-BR')

  doc.setFillColor(18, 57, 91)
  doc.roundedRect(28, 24, 785, 76, 18, 18, 'F')
  doc.setTextColor(245, 248, 251)
  doc.setFontSize(20)
  doc.text(title, 44, 56)
  doc.setFontSize(10)
  doc.text(subtitle || 'Relatorio exportado do ambiente operacional da frota.', 44, 76)
  doc.text(`Gerado em ${now}`, 44, 92)

  autoTable(doc, {
    startY: 120,
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
      fillColor: [18, 57, 91],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 248, 251],
    },
  })

  doc.save(`${fileName}.pdf`)
}
