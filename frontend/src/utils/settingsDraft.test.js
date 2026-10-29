import { expect, it } from 'vitest'
import { mergeSettingsDraft, newCustomFieldKey } from './settingsDraft'
import { brandingStyles, colorContrast, readableInk } from './systemBranding'

it('combina edições independentes sem substituir o que a outra sessão publicou', () => {
  const base = { identity: { city: 'Cidade', systemName: 'Frota' } }
  const local = { identity: { city: 'Cidade', systemName: 'Frota local' } }
  const remote = { identity: { city: 'Cidade atualizada', systemName: 'Frota' } }
  expect(mergeSettingsDraft(base, local, remote)).toEqual({ conflicts: [], values: { identity: { city: 'Cidade atualizada', systemName: 'Frota local' } } })
})

it('exige escolha explícita quando o mesmo dado muda nas duas sessões', () => {
  const base = { name: 'Original', nullable: null }, local = { name: 'Meu nome', nullable: '' }, remote = { name: 'Outro nome', nullable: null }
  const merged = mergeSettingsDraft(base, local, remote)
  expect(merged.conflicts).toHaveLength(1)
  expect(merged.conflicts[0]).toMatchObject({ key: 'name', local: 'Meu nome', remote: 'Outro nome' })
  expect(mergeSettingsDraft(base, local, remote, { name: 'remote' }).values).toEqual({ name: 'Outro nome', nullable: '' })
})

it('mescla campos por identidade e detecta exclusão contra edição concorrente', () => {
  const old = { key: 'campo_1', label: 'Antigo', type: 'text' }
  const other = { key: 'campo_2', label: 'Outro', type: 'text' }
  const base = { custom: [old] }, local = { custom: [] }, remote = { custom: [{ ...old, label: 'Atualizado' }, other] }
  expect(mergeSettingsDraft(base, local, remote).conflicts[0].key).toBe('custom.campo_1')
  expect(mergeSettingsDraft(base, local, remote, { 'custom.campo_1': 'remote' }).values.custom).toEqual(remote.custom)
  expect(mergeSettingsDraft(base, local, remote, { 'custom.campo_1': 'local' }).values.custom).toEqual([other])
})

it('preserva adições independentes e nunca recicla a chave de um campo apagado', () => {
  const first = newCustomFieldKey(), second = newCustomFieldKey()
  expect(first).toMatch(/^[a-z][a-z0-9_]{1,39}$/)
  expect(first).not.toBe(second)
  const merged = mergeSettingsDraft({ custom: [] }, { custom: [{ key: first, label: 'Local' }] }, { custom: [{ key: second, label: 'Remoto' }] })
  expect(merged.conflicts).toHaveLength(0)
  expect(merged.values.custom).toHaveLength(2)
})

it('mantém contraste de texto, botões e hover em cores extremas e paletas cadastradas', () => {
  for (const primary of ['#000000', '#ffffff', '#787878', '#ffff00', '#2452e8', '#087f5b', '#096b7b', '#6d28d9', '#a54423']) {
    const style = brandingStyles({ appearance: { primary, sidebar: primary } })
    expect(style['--brand-primary']).toBe(primary)
    expect(colorContrast(primary, readableInk(primary))).toBeGreaterThanOrEqual(4.5)
    expect(colorContrast(style['--brand-primary-hover'], style['--brand-on-primary'])).toBeGreaterThanOrEqual(4.5)
    for (const surface of ['#ffffff', '#f1f5fb']) expect(colorContrast(style['--brand-accent-light'], surface)).toBeGreaterThanOrEqual(4.5)
    for (const surface of ['#0d192b', '#14253d']) expect(colorContrast(style['--brand-accent-dark'], surface)).toBeGreaterThanOrEqual(4.5)
  }
})

it('mantém prévia válida enquanto um código de cor está incompleto', () => {
  const style = brandingStyles({ appearance: { primary: '#7', sidebar: '' } })
  expect(style['--brand-primary']).toBe('#2452e8')
  expect(style['--brand-sidebar']).toBe('#071426')
  expect(readableInk('')).toMatch(/^#[a-f0-9]{6}$/)
})
