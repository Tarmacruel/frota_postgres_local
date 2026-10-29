import { officialBrand } from '../constants/officialBrand'

export const initialSettings = {
  identity: { ...officialBrand },
  appearance: { primary: '#2452e8', sidebar: '#071426', density: 'comfortable' },
  icons: {}, forms: {},
}

export function readableInk(hex) {
  const channels = hex.replace('#', '').match(/.{2}/g)?.map((part) => {
    const value = parseInt(part, 16) / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  }) || [0, 0, 0]
  const luminance = channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
  return (luminance + .05) / .05 > 1.05 / (luminance + .05) ? '#000000' : '#ffffff'
}

export function brandingStyles(values) {
  const primary = values.appearance.primary
  const sidebar = values.appearance.sidebar
  return { '--brand-primary': primary, '--brand-on-primary': readableInk(primary), '--brand-sidebar': sidebar,
    '--brand-on-sidebar': readableInk(sidebar), '--ui-primary': primary, '--ui-action-bg': primary,
    '--ui-action-text': readableInk(primary), '--ui-primary-hover': `color-mix(in srgb, ${primary} 84%, black)`,
    '--ui-action-hover': `color-mix(in srgb, ${primary} 84%, black)`, '--navy': primary,
    '--login-bg': `linear-gradient(135deg, color-mix(in srgb, ${primary} 70%, black), ${primary})`,
    '--navy-soft': `color-mix(in srgb, ${primary} 80%, black)`, '--navy-deep': `color-mix(in srgb, ${primary} 60%, black)` }
}
