import { officialBrand } from '../constants/officialBrand'
import { formatDateTimeLabel, loadOptimizedLogo } from './exportData'
import {
  formatCurrencyBRL,
  formatOrderNumber,
  getOrderStatusLabel,
  resolvePublicValidationUrl,
} from './fuelSupplyOrders'

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === '') return '-'
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${fileName}.pdf`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 3000)
}

function buildFileName(order) {
  return `comprovante-${formatOrderNumber(order).toLowerCase()}`
}

function buildReferenceCode(order) {
  return order.validation_code || formatOrderNumber(order)
}

async function buildDocument(order) {
  const [{ default: jsPDF }, { default: autoTable }, { default: QRCode }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    import('qrcode'),
  ])

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true,
  })

  const logoDataUrl = await loadOptimizedLogo().catch(() => null)
  const validationUrl = resolvePublicValidationUrl(order.public_validation_path)
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
  const headerTop = 28
  const footerHeight = 38
  const totalPagesExp = '{total_pages_count_string}'
  const headerLeftX = marginX + 40
  const headerRightWidth = 230
  const headerRightX = pageWidth - marginX - headerRightWidth
  const headerGap = 20
  const headerLeftWidth = Math.max(180, headerRightX - headerLeftX - headerGap)
  const headerRightLineHeight = 9
  const municipalityLineHeight = 11
  const titleLineHeight = 14
  const systemLineHeight = 9
  const generatedAtLabel = `Emissao do documento: ${formatDateTimeLabel(new Date())}`
  const validationCodeLabel = `Codigo de validacao: ${buildReferenceCode(order)}`
  const footerPageLabelWidth = 104

  function getHeaderLayout() {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    const municipalityLines = doc.splitTextToSize(officialBrand.municipality.toUpperCase(), headerLeftWidth)

    doc.setFontSize(14)
    const titleLines = doc.splitTextToSize('COMPROVANTE DE ORDEM DE ABASTECIMENTO', headerLeftWidth)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.2)
    const systemLines = doc.splitTextToSize(`Sistema: ${officialBrand.systemName}`, headerLeftWidth)
    const generatedAtLines = doc.splitTextToSize(generatedAtLabel, headerRightWidth)
    const validationCodeLines = doc.splitTextToSize(validationCodeLabel, headerRightWidth)

    const leftContentHeight = (
      municipalityLines.length * municipalityLineHeight
      + titleLines.length * titleLineHeight
      + systemLines.length * systemLineHeight
      + 6
    )
    const rightContentHeight = (
      generatedAtLines.length * headerRightLineHeight
      + validationCodeLines.length * headerRightLineHeight
      + 3
    )
    const logoBottom = headerTop + 38
    const contentBottom = Math.max(
      headerTop + leftContentHeight,
      headerTop + rightContentHeight,
      logoBottom,
    )

    return {
      municipalityLines,
      titleLines,
      systemLines,
      generatedAtLines,
      validationCodeLines,
      dividerY: contentBottom + 10,
    }
  }

  function getFooterLayout() {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    const footerTextWidth = pageWidth - (marginX * 2) - footerPageLabelWidth - 18
    const footerLines = doc.splitTextToSize(officialBrand.reportFooter, footerTextWidth)
    return {
      footerLines,
      footerTextWidth,
    }
  }

  function drawHeader() {
    const headerLayout = getHeaderLayout()

    if (logoDataUrl) {
      doc.addImage(logoDataUrl, 'JPEG', marginX, headerTop + 4, 28, 34, undefined, 'FAST')
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(32, 48, 74)
    doc.text(headerLayout.municipalityLines, headerLeftX, headerTop + 12)

    doc.setFontSize(14)
    doc.text(
      headerLayout.titleLines,
      headerLeftX,
      headerTop + 12 + (headerLayout.municipalityLines.length * municipalityLineHeight) + 3,
    )

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.2)
    doc.setTextColor(102, 117, 140)
    doc.text(
      headerLayout.systemLines,
      headerLeftX,
      headerTop
        + 12
        + (headerLayout.municipalityLines.length * municipalityLineHeight)
        + 3
        + (headerLayout.titleLines.length * titleLineHeight)
        + 1,
    )
    doc.text(headerLayout.generatedAtLines, headerRightX, headerTop + 12)
    doc.text(
      headerLayout.validationCodeLines,
      headerRightX,
      headerTop + 12 + (headerLayout.generatedAtLines.length * headerRightLineHeight) + 3,
    )

    doc.setDrawColor(221, 221, 221)
    doc.setLineWidth(0.8)
    doc.line(marginX, headerLayout.dividerY, pageWidth - marginX, headerLayout.dividerY)
    return headerLayout.dividerY
  }

  function drawFooter() {
    const footerLayout = getFooterLayout()
    const footerY = pageHeight - footerHeight
    doc.setDrawColor(221, 221, 221)
    doc.setLineWidth(0.6)
    doc.line(marginX, footerY - 8, pageWidth - marginX, footerY - 8)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.8)
    doc.setTextColor(102, 117, 140)
    doc.text(footerLayout.footerLines, marginX, footerY + 1)
    doc.text(`Pagina ${doc.getCurrentPageInfo().pageNumber} de ${totalPagesExp}`, pageWidth - marginX, footerY + 1, { align: 'right' })
  }

  function addSection(title, rows, startY) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(32, 48, 74)
    doc.text(title.toUpperCase(), marginX, startY)

    autoTable(doc, {
      startY: startY + 8,
      margin: {
        left: marginX,
        right: marginX,
        bottom: footerHeight + 10,
      },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 8.3,
        textColor: [31, 41, 55],
        cellPadding: { top: 5, right: 7, bottom: 5, left: 7 },
        lineColor: [229, 231, 235],
        lineWidth: 0.5,
      },
      columnStyles: {
        0: {
          cellWidth: 146,
          fontStyle: 'bold',
          fillColor: [249, 250, 251],
        },
      },
      body: rows,
      didDrawPage: () => {
        drawHeader()
        drawFooter()
      },
    })

    return (doc.lastAutoTable?.finalY || startY) + 10
  }

  function addWrappedBlock(title, text, startY) {
    const nextPageThreshold = pageHeight - 150
    if (startY > nextPageThreshold) {
      doc.addPage()
      startY = headerTop + 58
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(32, 48, 74)
    doc.text(title.toUpperCase(), marginX, startY)

    const lines = doc.splitTextToSize(text, pageWidth - (marginX * 2) - 18)
    const blockHeight = Math.max(40, (lines.length * 11.5) + 12)
    doc.setDrawColor(229, 231, 235)
    doc.roundedRect(marginX, startY + 8, pageWidth - (marginX * 2), blockHeight, 12, 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.6)
    doc.setTextColor(55, 65, 81)
    doc.text(lines, marginX + 10, startY + 22)
    return startY + blockHeight + 16
  }

  const headerDividerY = drawHeader()
  drawFooter()

  let cursorY = headerDividerY + 16

  cursorY = addSection('Identificacao da ordem', [
    ['Numero da ordem', formatOrderNumber(order)],
    ['Situacao atual', getOrderStatusLabel(order.status)],
    ['Emitida em', formatDateTimeLabel(order.created_at)],
    ['Valida ate', formatDateTimeLabel(order.expires_at)],
    ['Codigo de validacao', buildReferenceCode(order)],
  ], cursorY)

  cursorY = addSection('Dados operacionais', [
    ['Veiculo', order.vehicle_description || order.vehicle_plate || '-'],
    ['Condutor', order.driver_name || 'Nao informado'],
    ['Orgao solicitante', order.organization_name || 'Nao informado'],
    ['Posto credenciado', order.fuel_station_name || 'Nao informado'],
    ['Endereco do posto', order.fuel_station_address || 'Nao informado'],
    ['CNPJ do posto', order.fuel_station_cnpj || 'Nao informado'],
    ['Servidor emissor', order.created_by_name || 'Nao informado'],
    ['Conclusao da ordem', order.confirmed_at ? formatDateTimeLabel(order.confirmed_at) : 'Pendente'],
  ], cursorY)

  cursorY = addSection('Limites autorizados', [
    ['Litros previstos', order.requested_liters ? `${formatNumber(order.requested_liters, 2)} L` : 'Nao informado'],
    ['Valor maximo autorizado', formatCurrencyBRL(order.max_amount)],
    ['Responsavel pelo encerramento', order.confirmed_by_name || 'Nao informado'],
  ], cursorY)

  if (order.notes) {
    cursorY = addWrappedBlock('Observacoes institucionais', order.notes, cursorY)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.6)
  const validationLines = doc.splitTextToSize(
    'Este documento foi emitido pelo sistema oficial da frota municipal. Para validar sua autenticidade, leia o QR Code ou acesse o endereco publico informado ao lado. Nao e necessario login para confirmar os dados e baixar novamente este comprovante.',
    pageWidth - (marginX * 2) - 118,
  )
  const validationLinkLines = doc.splitTextToSize(
    validationUrl || 'Link publico indisponivel',
    pageWidth - (marginX * 2) - 124,
  )
  const validationTextHeight = (validationLines.length * 10) + 8 + 10 + (validationLinkLines.length * 9)
  const validationQrSize = 78
  const validationBlockHeight = Math.max(88, Math.max(validationQrSize, validationTextHeight) + 18)
  const validationBlockMinHeight = validationBlockHeight + 28
  if (cursorY > pageHeight - validationBlockMinHeight) {
    doc.addPage()
    cursorY = headerTop + 58
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(32, 48, 74)
  doc.text('VALIDACAO DE AUTENTICIDADE', marginX, cursorY)

  doc.setDrawColor(32, 48, 74)
  doc.setLineWidth(0.8)
  doc.roundedRect(marginX, cursorY + 8, pageWidth - (marginX * 2), validationBlockHeight, 16, 16)

  if (qrCodeDataUrl) {
    doc.addImage(qrCodeDataUrl, 'PNG', marginX + 14, cursorY + 18, validationQrSize, validationQrSize, undefined, 'FAST')
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.6)
  doc.setTextColor(55, 65, 81)
  doc.text(validationLines, marginX + 108, cursorY + 28)
  doc.setFont('helvetica', 'bold')
  doc.text(`Codigo: ${buildReferenceCode(order)}`, marginX + 108, cursorY + 28 + (validationLines.length * 10) + 8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(32, 48, 74)
  doc.text(validationLinkLines, marginX + 108, cursorY + 28 + (validationLines.length * 10) + 24)

  if (typeof doc.putTotalPages === 'function') {
    doc.putTotalPages(totalPagesExp)
  }

  return doc
}

export async function previewFuelSupplyOrderDocument(order) {
  const previewWindow = window.open('', '_blank')
  if (previewWindow) {
    previewWindow.document.write(`
      <html lang="pt-BR">
        <head>
          <title>Gerando comprovante...</title>
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
        <body>Gerando comprovante institucional em PDF...</body>
      </html>
    `)
    previewWindow.document.close()
  }

  try {
    const doc = await buildDocument(order)
    const blob = doc.output('blob')
    const url = URL.createObjectURL(blob)
    if (previewWindow) {
      previewWindow.location.replace(url)
      window.setTimeout(() => URL.revokeObjectURL(url), 120000)
      return
    }

    downloadBlob(blob, buildFileName(order))
  } catch (error) {
    if (previewWindow) previewWindow.close()
    throw error
  }
}

export async function downloadFuelSupplyOrderDocument(order) {
  const doc = await buildDocument(order)
  const blob = doc.output('blob')
  downloadBlob(blob, buildFileName(order))
}
