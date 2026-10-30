import { officialBrand } from '../constants/officialBrand'

export const initialSettings = {
  identity: { ...officialBrand },
  appearance: { primary: '#2452e8', sidebar: '#071426', density: 'comfortable' },
  icons: {}, forms: {},
}

export const isBrandColor = (value) => /^#[0-9a-fA-F]{6}$/.test(value || '')
const safeColor = (value, fallback = '#2452e8') => isBrandColor(value) ? value : fallback
const channels = (color) => safeColor(color).slice(1).match(/.{2}/g).map((part) => parseInt(part, 16))
function luminance(color) {
  const linear = channels(color).map((channel) => {
    const value = channel / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  })
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
}
export function colorContrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + .05) / (dark + .05)
}
export function readableInk(color) {
  return colorContrast(color, '#000000') > colorContrast(color, '#ffffff') ? '#000000' : '#ffffff'
}
function blend(color, target, proportion) {
  const to = channels(target)
  return '#' + channels(color).map((channel, index) => Math.round(channel + (to[index] - channel) * proportion).toString(16).padStart(2, '0')).join('')
}
// Preserve the hue while text/links remain legible on both interface surfaces.
function readableAccent(color, surfaces, target) {
  for (let step = 0; step <= 100; step += 1) {
    const candidate = blend(color, target, step / 100)
    if (surfaces.every((surface) => colorContrast(candidate, surface) >= 4.5)) return candidate
  }
  return target
}

export function brandingStyles(values) {
  const primary = safeColor(values.appearance.primary)
  const sidebar = safeColor(values.appearance.sidebar, '#071426')
  const ink = readableInk(primary)
  const hover = blend(primary, ink === '#000000' ? '#ffffff' : '#000000', .16)
  return { '--brand-primary': primary, '--brand-on-primary': ink, '--brand-sidebar': sidebar,
    '--brand-on-sidebar': readableInk(sidebar), '--brand-primary-hover': hover,
    '--brand-accent-light': readableAccent(primary, ['#ffffff', '#f1f5fb'], '#000000'),
    '--brand-accent-dark': readableAccent(primary, ['#0d192b', '#14253d'], '#ffffff'),
    '--ui-primary': 'var(--brand-accent)', '--ui-action-bg': primary,
    '--ui-action-text': ink, '--ui-primary-hover': hover, '--ui-action-hover': hover, '--navy': primary,
    '--login-bg': `linear-gradient(135deg, color-mix(in srgb, ${primary} 70%, black), ${primary})`,
    '--navy-soft': `color-mix(in srgb, ${primary} 80%, black)`, '--navy-deep': `color-mix(in srgb, ${primary} 60%, black)` }
}
