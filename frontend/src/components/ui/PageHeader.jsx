import { Children, Fragment, isValidElement, useId, useState } from 'react'

function flattenActions(children) {
  return Children.toArray(children).flatMap((child) => isValidElement(child) && child.type === Fragment ? flattenActions(child.props.children) : [child])
}

export default function PageHeader({ title, description, actions, inlineActions = false, className = '' }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const id = useId()
  const items = flattenActions(actions)
  const primary = items.find((item) => item.props?.className?.split(' ').includes('app-button'))
  const secondary = items.filter((item) => item !== primary)
  const progressive = !inlineActions && secondary.length > 0 && (Boolean(primary) || secondary.length > 1)
  return (
    <header className={`ui-page-header${!description ? ' ui-page-header--compact' : ''}${inlineActions ? ' ui-page-header--inline-actions' : ''} ${className}`.trim()}>
      <div className="ui-page-header__copy">
        <h2 className="ui-page-header__title">{title}</h2>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className={`ui-page-header__actions${moreOpen ? ' is-open' : ''}`}>
        {primary}
        {progressive ? <button type="button" className="ghost-button mobile-page-options" aria-expanded={moreOpen} aria-controls={id} onClick={() => setMoreOpen(!moreOpen)}>Opções <span aria-hidden="true">•••</span></button> : null}
        <div id={id} className={`ui-page-header__secondary${progressive ? ' is-progressive' : ''}`}>{secondary}</div>
      </div> : null}
    </header>
  )
}
