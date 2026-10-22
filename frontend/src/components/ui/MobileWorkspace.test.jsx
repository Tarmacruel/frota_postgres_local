import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import MobileFilters from './MobileFilters'
import ResponsiveRecord from './ResponsiveRecord'
import PageHeader from './PageHeader'
import ActionMenu from './ActionMenu'

describe('mobile workspace', () => {
  it('mantém valores e handlers dos filtros ao recolher e reabrir', async () => {
    const user = userEvent.setup()
    render(<MobileFilters activeCount={1}><label>Secretaria<input defaultValue="Saúde" /></label></MobileFilters>)
    const trigger = screen.getByRole('button', { name: 'Filtros 1' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    const field = screen.getByRole('textbox', { name: 'Secretaria' })
    await user.clear(field); await user.type(field, 'Educação')
    await user.click(screen.getByRole('button', { name: 'Fechar filtros 1' }))
    await user.click(screen.getByRole('button', { name: 'Filtros 1' }))
    expect(field).toHaveValue('Educação')
    expect(document.getElementById(trigger.getAttribute('aria-controls'))).toContainElement(field)
  })

  it('expande dados sem recriar o registro nem alterar a ação original', async () => {
    const user = userEvent.setup(); const action = vi.fn()
    render(<table><tbody><ResponsiveRecord label="ABC1234" identityLabel="Placa" summaryLabels={['Modelo']}>
      <td data-label="Placa">ABC1234</td><td data-label="Modelo">Sedan</td><td data-label="Chassi">CHASSI123</td>
      <td data-label="Ações"><button onClick={action}>Encerrar</button></td>
    </ResponsiveRecord></tbody></table>)
    const cell = screen.getByText('CHASSI123')
    expect(cell).toHaveAttribute('data-mobile-kind', 'detail')
    expect(screen.getByText('ABC1234')).toHaveAttribute('data-mobile-kind', 'identity')
    const toggle = screen.getByRole('button', { name: 'Ver detalhes: ABC1234' })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.getAttribute('aria-controls')).toContain(cell.id)
    await user.click(screen.getByRole('button', { name: 'Encerrar' }))
    expect(action).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Ocultar detalhes: ABC1234' }))
    expect(cell).toBe(screen.getByText('CHASSI123'))
  })

  it('mantém exportações e componente de relatório montados ao recolher opções', async () => {
    const user = userEvent.setup(); const exportFile = vi.fn(); const create = vi.fn()
    render(<PageHeader title="Posses" actions={<><button className="app-button" onClick={create}>Nova posse</button><div><input aria-label="Período do relatório" defaultValue="Hoje" /></div><button onClick={exportFile}>Exportar XLSX</button></>} />)
    await user.click(screen.getByRole('button', { name: 'Opções' }))
    const field = screen.getByRole('textbox', { name: 'Período do relatório' })
    await user.clear(field); await user.type(field, 'Semana')
    await user.click(screen.getByRole('button', { name: 'Opções' }))
    await user.click(screen.getByRole('button', { name: 'Opções' }))
    expect(field).toHaveValue('Semana')
    await user.click(screen.getByRole('button', { name: 'Exportar XLSX' }))
    await user.click(screen.getByRole('button', { name: 'Nova posse' }))
    expect(exportFile).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledTimes(1)
  })

  it('fecha painel de ações e devolve foco ao acionador sem executar itens', async () => {
    const user = userEvent.setup(); const action = vi.fn()
    render(<ActionMenu label="Ações de ABC1234" items={[{ label: 'Editar', onClick: action }]} />)
    const trigger = screen.getByRole('button', { name: 'Ações de ABC1234' })
    await user.click(trigger)
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Editar' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Fechar opções' }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus(); expect(action).not.toHaveBeenCalled()
  })
})
