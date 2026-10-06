import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function useFuelSupplyOrderForm(initialValues, organizations, fuelStations) {
  const { user } = useAuth()
  const [values, setValues] = useState(initialValues)
  // Catalogs may arrive after the form opens. An explicit choice (including
  // clearing a field) always takes precedence over the suggested value.
  return [{
    ...values,
    organization_id: values.organization_id ?? organizations.find((org) => org.id === user?.organization_id)?.id ?? '',
    fuel_station_id: values.fuel_station_id ?? fuelStations[0]?.id ?? '',
  }, setValues]
}
