const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const object = (value) => value != null && !Array.isArray(value) && typeof value === 'object'
const keyed = (value) => Array.isArray(value) && value.every((entry) => object(entry) && typeof entry.key === 'string')

// Compare the saved reference, the local draft and the latest server version.
// A deletion conflicts with a concurrent edit; custom fields are matched by permanent key.
export function mergeSettingsDraft(base, local, remote, choices = {}) {
  const conflicts = []
  function merge(before, mine, current, path) {
    if (same(mine, before)) return current
    if (same(current, before) || same(mine, current)) return mine
    if (object(mine) && object(current)) {
      return Object.fromEntries([...new Set([...Object.keys(mine), ...Object.keys(current)])]
        .map((key) => [key, merge(before?.[key], mine[key], current[key], [...path, key])])
        .filter(([, value]) => value !== undefined))
    }
    if (keyed(mine) && keyed(current)) {
      const original = new Map((before || []).map((entry) => [entry.key, entry]))
      const draft = new Map(mine.map((entry) => [entry.key, entry]))
      const latest = new Map(current.map((entry) => [entry.key, entry]))
      return [...new Set([...latest.keys(), ...draft.keys()])].map((key) =>
        merge(original.get(key), draft.get(key), latest.get(key), [...path, key])).filter((value) => value !== undefined)
    }
    const key = path.join('.')
    conflicts.push({ key, path, before, local: mine, remote: current })
    return choices[key] === 'remote' ? current : mine
  }
  return { values: merge(base, local, remote, []), conflicts }
}

export function newCustomFieldKey() {
  return `campo_${crypto.randomUUID().replaceAll('-', '')}`
}

export const settingNames = { identity: 'Identidade', appearance: 'Aparência', icons: 'Ícones', forms: 'Formulários',
  systemName: 'Nome do sistema', municipality: 'Nome da prefeitura', city: 'Município', state: 'UF', subtitle: 'Descrição do sistema',
  administrationSecretariat: 'Secretaria administrativa', fleetDepartment: 'Setor responsável', cnpj: 'CNPJ', addressLine: 'Endereço institucional',
  logoPath: 'Logo ou brasão', primary: 'Cor principal', sidebar: 'Menu lateral', density: 'Densidade',
  label: 'Nome exibido', visible: 'Exibir', required: 'Obrigatório', type: 'Tipo', active: 'Ativo',
  comfortable: 'Confortável', compact: 'Compacta', text: 'Texto', number: 'Número', date: 'Data', boolean: 'Sim / Não' }

export function settingsValue(value) {
  if (value === undefined || value === null) return 'Não informado'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'object') {
    if (value.key) return `${value.label} · ${settingNames[value.type] || value.type} · ${value.required ? 'Obrigatório' : 'Opcional'}`
    return Object.entries(value).map(([key, entry]) => `${settingNames[key] || key}: ${settingsValue(entry)}`).join(' · ')
  }
  return settingNames[value] || String(value) || 'Em branco'
}

export function settingsDifferences(before, after, metadata) {
  const rows = []
  const add = (key, label, previous, next, warning = '') => {
    if (JSON.stringify(previous) !== JSON.stringify(next)) rows.push({ key, label, before: previous, after: next, warning })
  }
  for (const group of ['identity', 'appearance', 'icons']) {
    for (const key of new Set([...Object.keys(before[group] || {}), ...Object.keys(after[group] || {})])) {
      const label = `${settingNames[group]} · ${settingNames[key] || metadata.navigation?.[key] || key}`
      const iconLabel = (value) => metadata.navigation?.[value] || ({ orders: 'Ordens de abastecimento', settings: 'Parâmetros' })[value] || value
      add(`${group}.${key}`, label, group === 'icons' ? iconLabel(before[group]?.[key] || key) : before[group]?.[key], group === 'icons' ? iconLabel(after[group]?.[key] || key) : after[group]?.[key])
    }
  }
  for (const module of new Set([...Object.keys(before.forms || {}), ...Object.keys(after.forms || {})])) {
    const previous = before.forms?.[module] || { fields: {}, custom: [] }
    const next = after.forms?.[module] || { fields: {}, custom: [] }
    const label = metadata.modules?.[module] || module
    for (const key of new Set([...Object.keys(previous.fields), ...Object.keys(next.fields)])) {
      const field = metadata.form_catalog?.[module]?.find((entry) => entry.key === key)
      const initial = field ? { label: field.label, visible: true, required: field.required } : undefined
      add(`forms.${module}.fields.${key}`, `${label} · ${field?.label || key}`, previous.fields[key] || initial, next.fields[key] || initial)
    }
    for (const key of new Set([...previous.custom.map((field) => field.key), ...next.custom.map((field) => field.key)])) {
      const old = previous.custom.find((field) => field.key === key)
      const current = next.custom.find((field) => field.key === key)
      add(`forms.${module}.custom.${key}`, `${label} · ${current?.label || old?.label}`, old, current,
        !current ? 'O campo deixará de aparecer. Os valores já registrados serão preservados.'
          : old && old.type !== current.type ? 'O tipo mudou. Valores anteriores não serão convertidos; confira os registros existentes.' : '')
    }
  }
  return rows
}

