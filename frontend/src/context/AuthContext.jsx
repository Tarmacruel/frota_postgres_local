import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/client'
import { canAccessFuelSupplies, canConfirmFuelOrders, canDelete, canManageCadastros, canWrite, getRoleLabel, isAdmin, isFuelStation } from '../utils/roles'

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

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout,
    reload: loadMe,
    isAdmin: isAdmin(user?.role),
    canWrite: canWrite(user?.role),
    canDelete: canDelete(user?.role),
    canManageCadastros: canManageCadastros(user?.role),
    canAccessFuelSupplies: canAccessFuelSupplies(user?.role),
    canConfirmFuelOrders: canConfirmFuelOrders(user?.role),
    isFuelStation: isFuelStation(user?.role),
    roleLabel: getRoleLabel(user?.role),
  }), [user, loading])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
