export default function PageHeader({ title, description, actions, className = '' }) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div className="ui-page-header__copy">
        <h2 className="ui-page-header__title">{title}</h2>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="ui-page-header__actions">{actions}</div> : null}
    </header>
  )
}
