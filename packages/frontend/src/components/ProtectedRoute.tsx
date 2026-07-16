import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  requireOwner?: boolean
}

export function ProtectedRoute({ children, requireOwner = false }: Props) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <span className="text-sm text-gray-400">Carregando...</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/entrar" replace />
  }

  if (requireOwner && user.role !== 'owner') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}