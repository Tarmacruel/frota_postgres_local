import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AnalyticsEntityDrawer from './AnalyticsEntityDrawer'
import AnalyticsEntityLink from './AnalyticsEntityLink'
import useAnalyticsDetailStack from './useAnalyticsDetailStack'

function Harness() {
  const detail = useAnalyticsDetailStack()
  return <><AnalyticsEntityLink entityId={1} entityType="vehicle" entityName="Veículo de teste" onOpen={detail.open}>Abrir veículo</AnalyticsEntityLink>
    <AnalyticsEntityDrawer detail={detail.current} canGoBack={detail.canGoBack} onBack={detail.back} onClose={detail.close}>
      <button onClick={() => detail.open({ entityId: 2, entityType: 'driver', title: 'Condutor de teste' })}>Abrir condutor</button>
    </AnalyticsEntityDrawer></>
}

describe('AnalyticsEntityDrawer', () => {
  it('Escape volta um nível, Voltar preserva pilha e Fechar restaura foco', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: /Abrir veículo/ })
    trigger.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement))
    await user.click(screen.getByRole('button', { name: 'Abrir condutor' }))
    expect(screen.getByRole('dialog', { name: 'Condutor de teste' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Veículo de teste' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir condutor' }))
    await user.click(screen.getByRole('button', { name: /Voltar/ }))
    expect(screen.getByRole('dialog', { name: 'Veículo de teste' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir condutor' }))
    await user.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mantém Tab e Shift+Tab dentro do diálogo', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: /Abrir veículo/ }))
    await waitFor(() => expect(document.activeElement).toHaveClass('analytics-drawer__content'))
    await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)))
    const last = screen.getByRole('button', { name: 'Abrir condutor' })
    last.focus()
    await user.tab()
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement)
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
  })

  it('substitui somente o topo da pilha', () => {
    const { result } = renderHook(() => useAnalyticsDetailStack())
    act(() => result.current.open({ entityId: 1 }))
    act(() => result.current.open({ entityId: 2 }))
    act(() => result.current.replace({ entityId: 3 }))
    expect(result.current.stack).toEqual([{ entityId: 1 }, { entityId: 3 }])
    act(() => result.current.back())
    expect(result.current.current).toEqual({ entityId: 1 })
    act(() => result.current.close())
    expect(result.current.isOpen).toBe(false)
  })
})
