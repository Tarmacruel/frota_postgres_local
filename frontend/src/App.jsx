import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import AuditPage from './pages/AuditPage'
import CadastrosPage from './pages/CadastrosPage'
import ClaimsPage from './pages/ClaimsPage'
import DashboardPage from './pages/DashboardPage'
import DriversPage from './pages/DriversPage'
import LoginPage from './pages/LoginPage'
import MaintenancePage from './pages/MaintenancePage'
import PossessionPage from './pages/PossessionPage'
import UsersPage from './pages/UsersPage'
import VehiclesPage from './pages/VehiclesPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="cadastros" element={<CadastrosPage />} />
            <Route path="vehicles" element={<VehiclesPage />} />
            <Route path="posses" element={<PossessionPage />} />
            <Route path="condutores" element={<DriversPage />} />
            <Route path="manutencoes" element={<MaintenancePage />} />
            <Route path="sinistros" element={<ClaimsPage />} />
            <Route
              path="users"
              element={
                <ProtectedRoute adminOnly>
                  <UsersPage />
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
