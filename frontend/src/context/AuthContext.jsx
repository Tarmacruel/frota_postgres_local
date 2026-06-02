import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { hasPermission } from '../utils/permissions'
import { getRoleLabel, isAdmin, isFuelStation, isPosto } from '../utils/roles'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadMe({ silent = false } = {}) {
    if (!silent) setLoading(true)
    try {
      const { data } = await api.get('/auth/me')
      setUser(data)
      return data
    } catch {
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMe()
  }, [])

  async function login(email, password) {
    setLoading(true)
    try {
      await api.post('/auth/login', { email, password })
      return await loadMe({ silent: true })
    } catch (error) {
      setLoading(false)
      throw error
    }
  }

  async function logout() {
    setLoading(true)
    await api.post('/auth/logout')
    setUser(null)
    setLoading(false)
  }

  async function changePassword({ current_password, new_password }) {
    await api.post('/auth/change-password', { current_password, new_password })
    return await loadMe({ silent: true })
  }

  const value = useMemo(() => {
    const can = (module, action = 'view') => hasPermission(user, module, action)
    const permissions = Object.values(user?.permissions || {})
    return {
      user,
      loading,
      login,
      logout,
      changePassword,
      reload: loadMe,
      mustChangePassword: Boolean(user?.must_change_password),
      isAdmin: isAdmin(user?.role),
      isProduction: user?.role === 'PRODUCAO',
      isPosto: isPosto(user?.role),
      can,
      canView: (module) => can(module, 'view'),
      canCreate: (module) => can(module, 'create'),
      canEdit: (module) => can(module, 'edit'),
      canDeleteModule: (module) => can(module, 'delete'),
      canWrite: permissions.some((flags) => flags.can_create || flags.can_edit),
      canDelete: permissions.some((flags) => flags.can_delete),
      canManageCadastros: can('master_data', 'view'),
      canAccessFuelSupplies: can('fuel_supplies', 'view'),
      canManageFuelSupplyOrders: can('fuel_supply_orders', 'view'),
      canConfirmFuelOrders: can('fuel_supply_orders', 'edit'),
      isFuelStation: isFuelStation(user?.role),
      roleLabel: getRoleLabel(user?.role),
    }
  }, [user, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
