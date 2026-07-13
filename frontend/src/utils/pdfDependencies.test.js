import { describe, expect, it } from 'vitest'

describe('dependências de exportação PDF', () => {
  it('geram um documento com tabela usando os exports consumidos pela aplicação', async () => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ])
    const document = new jsPDF()

    autoTable(document, {
      head: [['Coluna']],
      body: [['Valor']],
    })

    const output = document.output('arraybuffer')
    expect(output.byteLength).toBeGreaterThan(0)
  })
})
