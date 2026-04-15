import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AuditPage from './pages/AuditPage'
import AdminAnalyticsDashboard from './pages/AdminAnalyticsDashboard'
import CadastrosPage from './pages/CadastrosPage'
import ClaimsPage from './pages/ClaimsPage'
import DashboardPage from './pages/DashboardPage'
import DriversPage from './pages/DriversPage'
import FinesPage from './pages/FinesPage'
import FuelSuppliesPage from './pages/FuelSuppliesPage'
import LoginPage from './pages/LoginPage'
import MaintenancePage from './pages/MaintenancePage'
import PossessionPage from './pages/PossessionPage'
import UsersPage from './pages/UsersPage'
import VehiclesPage from './pages/VehiclesPage'
import UnauthorizedPage from './pages/UnauthorizedPage'

function LazyPageFallback() {
  return (
    <div className="app-loading">
      <div className="loading-card">
        <strong>Carregando módulo de analytics</strong>
        <p className="muted">Preparando gráficos e indicadores administrativos.</p>
      </div>
    </div>
  )
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
            <Route index element={<DashboardPage />} />
            <Route
              path="cadastros"
              element={(
                <ProtectedRoute allowedRoles={['ADMIN', 'PRODUCAO']}>
                  <CadastrosPage />
                </ProtectedRoute>
              )}
            />
            <Route path="vehicles" element={<VehiclesPage />} />
            <Route path="posses" element={<PossessionPage />} />
            <Route path="condutores" element={<DriversPage />} />
            <Route path="manutencoes" element={<MaintenancePage />} />
            <Route path="sinistros" element={<ClaimsPage />} />
            <Route path="multas" element={<FinesPage />} />
            <Route path="abastecimentos" element={<FuelSuppliesPage />} />
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
