import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuditPage from './pages/AuditPage'
import AdminAnalyticsDashboard from './pages/AdminAnalyticsDashboard'
import CadastrosPage from './pages/CadastrosPage'
import ClaimsPage from './pages/ClaimsPage'
import DashboardPage from './pages/DashboardPage'
import DriversPage from './pages/DriversPage'
import FinesPage from './pages/FinesPage'
import FuelSuppliesPage from './pages/FuelSuppliesPage'
import FuelStationsPage from './pages/FuelStationsPage'
import LoginPage from './pages/LoginPage'
import MaintenancePage from './pages/MaintenancePage'
import PossessionPage from './pages/PossessionPage'
import UsersPage from './pages/UsersPage'
import VehiclesPage from './pages/VehiclesPage'
import UnauthorizedPage from './pages/UnauthorizedPage'

function HomeRoute() {
  const { isFuelStation } = useAuth()
  if (isFuelStation) return <Navigate to="/abastecimentos" replace />
  return <DashboardPage />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
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
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <CadastrosPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="vehicles"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <VehiclesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="posses"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <PossessionPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="condutores"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <DriversPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="manutencoes"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <MaintenancePage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="sinistros"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <ClaimsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="multas"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <FinesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="abastecimentos"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO', 'POSTO']}>
                  <FuelSuppliesPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="postos"
              element={(
                <ProtectedRoute adminOnly>
                  <FuelStationsPage />
                </ProtectedRoute>
              )}
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
                <ProtectedRoute adminOnly>
                    <AdminAnalyticsDashboard />
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
