import { Children, cloneElement, isValidElement } from 'react'

export const formRoutes = { '/vehicles': 'vehicles', '/condutores': 'drivers', '/posses': 'possession',
  '/emprestimos': 'vehicle_loans', '/sinistros': 'claims', '/multas': 'fines', '/manutencoes': 'maintenance',
  '/abastecimentos': 'fuel_supplies', '/processos-pagamento': 'payment_processes' }
const aliases = { 'driver-name': 'nome_completo', 'driver-document': 'documento', 'driver-registration': 'matricula',
  'driver-contact': 'contato', 'driver-email': 'email', 'driver-license-number': 'cnh_numero',
  'driver-expiry': 'cnh_validade', chassis_number: 'chassi' }
const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const textOf = (children) => Children.toArray(children).map((child) => !isValidElement(child) ? String(child ?? '')
  : ['input', 'select', 'textarea', 'small'].includes(child.type) ? '' : textOf(child.props.children)).join(' ')
const containsRequired = (node) => isValidElement(node) && (node.props.required || Children.toArray(node.props.children).some(containsRequired))

function setControls(children, required) {
  return Children.map(children, (node) => {
    if (!isValidElement(node)) return node
    const name = node.type?.render?.name || node.type?.name
    const control = ['input', 'select', 'textarea'].includes(node.type) || ['SearchableSelect', 'MoneyInput', 'DriverSelect'].includes(name)
    return cloneElement(node, control ? { required: node.props.required || required } : {},
      node.props.children ? setControls(node.props.children, required) : undefined)
  })
}

export function configureFields(children, rules = {}, catalog = []) {
  if (!Object.keys(rules).length) return children
  return Children.map(children, (node) => {
    if (!isValidElement(node)) return node
    const isContainer = node.type === 'label' || /(^|\s)form-field(\s|$)/.test(node.props.className || '')
    if (isContainer) {
      const controls = []
      const collect = (items) => Children.forEach(items, (child) => {
        if (!isValidElement(child)) return
        if (['input', 'select', 'textarea'].includes(child.type)) controls.push(child)
        collect(child.props.children)
      })
      collect(node.props.children)
      const id = controls[0]?.props.id || controls[0]?.props.name || node.props.htmlFor
      const key = rules[id] ? id : aliases[id] || catalog.find((field) => normalize(field.label) === normalize(textOf(node.props.children)))?.key
      const rule = rules[key]
      if (rule) {
        // A rule can never hide a conditionally required field in a particular action.
        if (rule.visible === false && !containsRequired(node)) return null
        let renamed = false
        const caption = (items) => Children.map(items, (part) => {
          if (!renamed && typeof part === 'string' && part.trim()) { renamed = true; return rule.label }
          if (isValidElement(part) && !['input', 'select', 'textarea', 'small'].includes(part.type) && part.props.children) {
            return cloneElement(part, {}, caption(part.props.children))
          }
          return part
        })
        return cloneElement(node, {}, setControls(caption(node.props.children), rule.required))
      }
    }
    return node.props.children ? cloneElement(node, {}, configureFields(node.props.children, rules, catalog)) : node
  })
}
