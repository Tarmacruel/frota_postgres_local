import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ProtectedRoute from './ProtectedRoute'

export default function FuelWorkspaceRoute({ children }) {
  const { canView } = useAuth()
  const module = canView('fuel_supplies') ? 'fuel_supplies' : 'fuel_supply_orders'
  return <ProtectedRoute permission={{ module, action: 'view' }}>{children}</ProtectedRoute>
}

export function FuelOpenOrdersRedirect() {
  const { search, hash } = useLocation()
  const params = new URLSearchParams(search)
  if (params.has('indicator') && !params.has('open_indicator')) params.set('open_indicator', params.get('indicator'))
  params.delete('indicator')
  params.set('view', 'open')
  return <Navigate replace to={{ pathname: '/abastecimentos', search: params.toString(), hash }} />
}
