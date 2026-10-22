import SearchableSelect from './SearchableSelect'

export default function VehicleLoanSelect({ label, options, value, onChange, disabled, placeholder = 'Selecione', searchPlaceholder = 'Digite para filtrar', onOpen }) {
  return <div className="loan-field">
    <span>{label}</span>
    <SearchableSelect onOpen={onOpen} ariaLabel={label} value={value} onChange={onChange} disabled={disabled}
      placeholder={placeholder} searchPlaceholder={searchPlaceholder}
      options={options.map((item) => ({ value: item.id, tags: item.tags || [], label: item.name || [item.plate, item.brand, item.model].filter(Boolean).join(' · ') }))}
      emptyLabel="Nenhum resultado encontrado." />
  </div>
}
