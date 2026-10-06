import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionMenu, IconButton, PageHeader, StatCard, StatusChip, VehicleThumbnail } from '../components/ui'
import Modal from '../components/Modal'

describe('fundação visual', () => {
  it('preserva título, contexto e ação do cabeçalho sem disparar ações ao renderizar', async () => {
    const action = vi.fn()
    render(<PageHeader title="Veículos" description="Operação da frota" actions={<button onClick={action}>Novo veículo</button>} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Veículos' })).toBeInTheDocument()
    expect(screen.getByText('Operação da frota')).toBeInTheDocument()
    expect(action).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Novo veículo' }))
    expect(action).toHaveBeenCalledOnce()
  })

  it('mostra zero como valor válido, contexto e carregamento acessível', () => {
    const { rerender } = render(<StatCard icon="vehicles" label="Em uso" value={0} note="Hoje" />)
    expect(screen.getByRole('article', { name: 'Em uso' })).toHaveTextContent('0')
    expect(screen.getByText('Hoje')).toBeInTheDocument()
    rerender(<StatCard label="Em uso" value={10} loading />)
    expect(screen.getByRole('article', { name: 'Em uso' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Carregando')).toBeInTheDocument()
    expect(screen.queryByText('10')).not.toBeInTheDocument()
  })

  it('status conserva rótulo legível sem depender só da cor', () => {
    render(<StatusChip tone="warning" title="Recebimento pendente">Aguardando recebimento</StatusChip>)
    expect(screen.getByText('Aguardando recebimento')).toHaveAttribute('title', 'Recebimento pendente')
  })

  it.each([
    ['HATCH', 'hatch'], ['SEDAN', 'sedan'], ['SUV', 'suv'], ['PERUA_SW', 'wagon'],
    ['PICAPE', 'pickup'], ['VAN', 'van'], ['MICRO_ONIBUS', 'microbus'], ['ONIBUS', 'bus'],
    ['CAMINHAO', 'truck'], ['MOTOCICLETA', 'motorcycle'], ['MAQUINA', 'machine'],
    [null, 'default'], ['OUTRO', 'default'], [' sedan ', 'sedan'],
  ])('carrega miniatura de %s sem marca específica', (vehicleType, asset) => {
    render(<VehicleThumbnail vehicleType={vehicleType} plate="ABC1D23" />)
    const image = screen.getByRole('img', { name: /Miniatura ilustrativa.*ABC1D23/ })
    expect(image).toHaveAttribute('src', `/vehicle-thumbnails/${asset}.svg`)
    expect(image).toHaveAttribute('width', '52')
    expect(image).toHaveAttribute('height', '34')
  })

  it('botão de ícone exige nome e respeita disabled sem enviar formulário', async () => {
    expect(() => IconButton({ icon: 'vehicles', label: ' ' })).toThrow(/label/)
    const submit = vi.fn((event) => event.preventDefault())
    const click = vi.fn()
    const { rerender } = render(<form onSubmit={submit}><IconButton icon="vehicles" label="Ver veículo" onClick={click} /></form>)
    await userEvent.click(screen.getByRole('button', { name: 'Ver veículo' }))
    expect(click).toHaveBeenCalledOnce()
    expect(submit).not.toHaveBeenCalled()
    rerender(<IconButton icon="vehicles" label="Ver veículo" onClick={click} disabled />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver veículo' }))
    expect(click).toHaveBeenCalledOnce()
  })
})

describe('ActionMenu', () => {
  const items = [
    { key: 'view', label: 'Consultar' },
    { key: 'disabled', label: 'Indisponível', disabled: true },
    { key: 'edit', label: 'Retificar' },
    { key: 'hidden', label: 'Oculto', hidden: true },
  ]

  it('navega por setas, Home/End, pula desabilitados e restaura foco com Escape', async () => {
    const user = userEvent.setup()
    render(<ActionMenu items={items} />)
    const trigger = screen.getByRole('button', { name: 'Mais ações' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menu', { name: 'Mais ações' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Consultar' })).toHaveFocus()
    expect(screen.queryByText('Oculto')).not.toBeInTheDocument()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Retificar' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Consultar' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Retificar' })).toHaveFocus()
    await user.keyboard('{Home}{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Retificar' })).toHaveFocus()
  })

  it.each(['{Enter}', ' '])('abre com %s e executa somente a ação escolhida', async (key) => {
    const user = userEvent.setup()
    const select = vi.fn()
    render(<ActionMenu items={[{ label: 'Excluir', tone: 'danger', onClick: select }]} />)
    const trigger = screen.getByRole('button', { name: 'Mais ações' })
    trigger.focus()
    await user.keyboard(key)
    expect(select).not.toHaveBeenCalled()
    await user.keyboard('{Enter}')
    expect(select).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('fecha por clique externo sem roubar foco e remove o portal ao desmontar', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<div><ActionMenu items={items} /><button>Fora</button></div>)
    await user.click(screen.getByRole('button', { name: 'Mais ações' }))
    await user.click(screen.getByRole('button', { name: 'Fora' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fora' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Mais ações' }))
    unmount()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Tab e Shift+Tab retornam à sequência da página', async () => {
    const user = userEvent.setup()
    render(<><button>Anterior</button><ActionMenu items={items} /><button>Seguinte</button></>)
    await user.click(screen.getByRole('button', { name: 'Mais ações' }))
    await user.tab()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Seguinte' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Mais ações' }))
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Anterior' })).toHaveFocus()
  })

  it('não apresenta ações ausentes e bloqueia menu inteiramente indisponível', () => {
    const { rerender } = render(<ActionMenu items={[false, null, { label: 'Oculto', hidden: true }]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<ActionMenu items={[{ label: 'Bloqueado', disabled: true }]} />)
    expect(screen.getByRole('button', { name: 'Mais ações' })).toBeDisabled()
  })

  it('Escape fecha o menu sem fechar o modal que o contém', async () => {
    const closeModal = vi.fn()
    render(<Modal open title="Teste" onClose={closeModal}><ActionMenu items={items} /></Modal>)
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }))
    fireEvent.keyDown(screen.getByRole('menuitem', { name: 'Consultar' }), { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(closeModal).not.toHaveBeenCalled()
  })
})
