import SearchableSelect from './SearchableSelect'
import { useId } from 'react'
import { LoanFieldLabel } from './LoanFormLayout'

export default function VehicleLoanSelect({ label, options, value, onChange, disabled, placeholder = 'Selecione', searchPlaceholder = 'Digite para filtrar', onOpen, field, error, hint, required = false }) {
  const hintId = useId()
  const ownership = { PROPRIO: 'Próprio', LOCADO: 'Locado', CEDIDO: 'Cedido' }
  return <div className="loan-field" data-loan-field={field} data-invalid={Boolean(error)}>
    <span><LoanFieldLabel label={label} required={required} /></span>
    <SearchableSelect onOpen={onOpen} ariaLabel={label} panelClassName="loan-vehicle-options" ariaDescribedBy={error || hint || required ? hintId : undefined} invalid={Boolean(error)} value={value} onChange={onChange} disabled={disabled}
      placeholder={placeholder} searchPlaceholder={searchPlaceholder}
      options={options.map((item) => ({ value: item.id, tags: item.tags || [], label: item.name || [item.plate, item.brand, item.model].filter(Boolean).join(' · '),
        description: item.plate ? [ownership[item.ownership_type], item.current_department ? `Lotação atual: ${item.current_department}` : '', item.chassis_number ? `Chassi final ${item.chassis_number.slice(-6)}` : ''].filter(Boolean).join(' · ') : undefined }))}
      emptyLabel="Nenhum resultado encontrado." />
    {error ? <small id={hintId} className="loan-editor__field-error">{error}</small> : hint ? <small id={hintId}>{hint}</small> : required ? <span id={hintId} className="sr-only">Seleção obrigatória.</span> : null}
  </div>
}
