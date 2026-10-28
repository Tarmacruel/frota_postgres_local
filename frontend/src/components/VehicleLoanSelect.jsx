import SearchableSelect from './SearchableSelect'

export default function VehicleLoanSelect({ label, options, value, onChange, disabled, placeholder = 'Selecione', searchPlaceholder = 'Digite para filtrar', onOpen, field, error, hint }) {
  return <div className="loan-field" data-loan-field={field} data-invalid={Boolean(error)}>
    <span>{label}</span>
    <SearchableSelect onOpen={onOpen} ariaLabel={label} value={value} onChange={onChange} disabled={disabled}
      placeholder={placeholder} searchPlaceholder={searchPlaceholder}
      options={options.map((item) => ({ value: item.id, tags: item.tags || [], label: item.name || [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))}
      emptyLabel="Nenhum resultado encontrado." />
    {error ? <small className="loan-editor__field-error">{error}</small> : hint ? <small>{hint}</small> : null}
  </div>
}
