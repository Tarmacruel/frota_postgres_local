import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import api from '../api/client'
import { AuditAccessDetails, describeBrowser } from './AuditAccessDetails'

vi.mock('../api/client', () => ({ default: { get: vi.fn() } }))
vi.mock('./AuditIpMap', () => ({ default: ({ label }) => <div role="img" aria-label={label} /> }))

const event = {
  id: 'synthetic-event',
  details: {
    audit_session_id: 'audit-session-test',
    request_context: {
      ip_address: '8.8.8.8',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/156.0.0.0 Safari/537.36',
    },
  },
}

afterEach(() => vi.clearAllMocks())

describe('Detalhes da auditoria de acessos', () => {
  it('só consulta a localização quando o superusuário expande o evento', async () => {
    api.get.mockResolvedValue({
      data: { status: 'located', city: 'Cidade de teste', country: 'Brasil', latitude: -17, longitude: -39 },
    })
    render(<AuditAccessDetails event={event} canLocate />)
    expect(api.get).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Detalhes do acesso'))
    expect(await screen.findByRole('img', { name: 'Cidade de teste, Brasil' })).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/audit/synthetic-event/ip-location', expect.any(Object))
    expect(screen.getByText('audit-session-test')).toBeInTheDocument()
  })

  it('apresenta navegador e sistema em leitura humana', () => {
    expect(describeBrowser(event.details.request_context.user_agent)).toBe('Chrome 156.0.0.0 · Windows · Computador')
    expect(describeBrowser(null)).toBe('Navegador não identificado')
  })
})
