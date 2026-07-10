import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuditPage from './pages/AuditPage'
import AdminAnalyticsDashboard from './pages/AdminAnalyticsDashboard'
import CadastrosPage from './pages/CadastrosPage'
import ClaimsPage from './pages/ClaimsPage'
import DashboardPage from './pages/DashboardPage'
import DataImportsPage from './pages/DataImportsPage'
import DriversPage from './pages/DriversPage'
import FinesPage from './pages/FinesPage'
import FuelSuppliesPage from './pages/FuelSuppliesPage'
import FuelStationsPage from './pages/FuelStationsPage'
import FuelSupplyOrdersPage from './pages/FuelSupplyOrdersPage'
import LoginPage from './pages/LoginPage'
import MaintenancePage from './pages/MaintenancePage'
import PaymentProcessesPage from './pages/PaymentProcessesPage'
import PossessionPage from './pages/PossessionPage'
import PublicFuelSupplyOrderPage from './pages/PublicFuelSupplyOrderPage'
import PublicPossessionTermPage from './pages/PublicPossessionTermPage'
import UsersPage from './pages/UsersPage'
import VehiclesPage from './pages/VehiclesPage'
import UnauthorizedPage from './pages/UnauthorizedPage'

function HomeRoute() {
  const { canView } = useAuth()
  if (!canView('vehicles') && canView('fuel_supply_orders')) return <Navigate to="/ordens-abastecimento" replace />
  return <DashboardPage />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/validar/ordem-abastecimento/:validationCode" element={<PublicFuelSupplyOrderPage />} />
          <Route path="/validar/termo-emprestimo/:validationCode" element={<PublicPossessionTermPage termType="loan" />} />
          <Route path="/validar/termo-devolucao/:validationCode" element={<PublicPossessionTermPage termType="return" />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<HomeRoute />} />
            <Route
              path="cadastros"
              element={(
                <ProtectedRoute permission={{ module: 'master_data', action: 'view' }}>
                  <CadastrosPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="vehicles"
              element={(
                <ProtectedRoute permission={{ module: 'vehicles', action: 'view' }}>
                  <VehiclesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="posses"
              element={(
                <ProtectedRoute permission={{ module: 'possession', action: 'view' }}>
                  <PossessionPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="condutores"
              element={(
                <ProtectedRoute permission={{ module: 'drivers', action: 'view' }}>
                  <DriversPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="manutencoes"
              element={(
                <ProtectedRoute permission={{ module: 'maintenance', action: 'view' }}>
                  <MaintenancePage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="sinistros"
              element={(
                <ProtectedRoute permission={{ module: 'claims', action: 'view' }}>
                  <ClaimsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="multas"
              element={(
                <ProtectedRoute permission={{ module: 'fines', action: 'view' }}>
                  <FinesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="abastecimentos"
              element={(
                <ProtectedRoute permission={{ module: 'fuel_supplies', action: 'view' }}>
                  <FuelSuppliesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="postos"
              element={(
                <ProtectedRoute permission={{ module: 'fuel_stations', action: 'view' }}>
                  <FuelStationsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="ordens-abastecimento"
              element={
                <ProtectedRoute permission={{ module: 'fuel_supply_orders', action: 'view' }}>
                  <FuelSupplyOrdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="processos-pagamento"
              element={
                <ProtectedRoute permission={{ module: 'payment_processes', action: 'view' }}>
                  <PaymentProcessesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="users"
              element={
                <ProtectedRoute adminOnly>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="analytics"
              element={
                <ProtectedRoute permission={{ module: 'analytics', action: 'view' }}>
                  <AdminAnalyticsDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="importacao-dados"
              element={
                <ProtectedRoute permission={{ module: 'data_imports', action: 'view' }}>
                  <DataImportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="auditoria"
              element={
                <ProtectedRoute adminOnly>
                  <AuditPage />
                </ProtectedRoute>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
