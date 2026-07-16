import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'

type Role = 'owner' | 'attendant'

type User = {
  userId: string
  tenantId: string
  role: Role
}

type AuthContextValue = {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (token: string) => void
  logout: () => void
  isOwner: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function parseToken(token: string): User | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload)) as User
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem('token')
    if (stored) {
      const parsed = parseToken(stored)
      if (parsed) {
        setToken(stored)
        setUser(parsed)
      } else {
        localStorage.removeItem('token')
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback((newToken: string) => {
    const parsed = parseToken(newToken)
    if (!parsed) return
    localStorage.setItem('token', newToken)
    setToken(newToken)
    setUser(parsed)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        isOwner: user?.role === 'owner',
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}