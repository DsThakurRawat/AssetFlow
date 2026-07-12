import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { authAPI } from './api'

export interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'asset_manager' | 'dept_head' | 'employee'
  department_id: number | null
  is_active: boolean
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Validate the session cookie on first load.
  useEffect(() => {
    authAPI
      .me()
      .then((r) => setUser(r.data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const r = await authAPI.login(email, password)
    setUser(r.data)
  }
  const signup = async (name: string, email: string, password: string) => {
    const r = await authAPI.signup(name, email, password)
    setUser(r.data)
  }
  const logout = async () => {
    try {
      await authAPI.logout()
    } finally {
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

function SessionSplash() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg-app)',
        color: 'var(--color-text-muted)',
      }}
    >
      Loading…
    </div>
  )
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <SessionSplash />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <SessionSplash />
  if (user) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}
