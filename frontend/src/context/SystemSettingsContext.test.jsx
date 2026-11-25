import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SystemSettingsProvider } from './SystemSettingsContext'
import { applyOfficialBrand, officialBrand } from '../constants/officialBrand'
import { initialSettings } from '../utils/systemBranding'
import api from '../api/client'

vi.mock('../api/client', () => ({ default: { get: vi.fn() } }))

it('restaura as cores padrão numa aba aberta na hora de término, preservando a cor dos documentos', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2027-01-07T02:59:59Z'))
  const root = document.documentElement
  const originalStyle = root.getAttribute('style')
  const appearance = { ...initialSettings.appearance, primary: '#224488' }
  api.get.mockResolvedValue({ data: { values: { ...initialSettings, appearance }, revision: 3,
    seasonal_theme: { id: 'christmas', expires_at: '2027-01-07T03:00:00Z',
      style: { primary: '#145943', sidebar: '#3b202b', accent: '#dab46f' } } } })
  const { unmount } = render(<SystemSettingsProvider><div /></SystemSettingsProvider>)

  try {
    await act(async () => {})
    expect(root.dataset.seasonalTheme).toBe('christmas')
    expect(root.style.getPropertyValue('--brand-primary')).toBe('#145943')
    expect(officialBrand.colors.royalBlue).toBe('#224488')

    act(() => vi.advanceTimersByTime(1_000))
    expect(root.dataset.seasonalTheme).toBeUndefined()
    expect(root.style.getPropertyValue('--brand-primary')).toBe('#224488')
    expect(root.style.getPropertyValue('--seasonal-accent')).toBe('transparent')
    expect(api.get).toHaveBeenCalledOnce()
  } finally {
    unmount()
    delete root.dataset.seasonalTheme
    if (originalStyle === null) root.removeAttribute('style')
    else root.setAttribute('style', originalStyle)
    applyOfficialBrand(initialSettings)
    vi.useRealTimers()
  }
})
