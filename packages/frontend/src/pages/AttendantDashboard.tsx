import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api/client'

type Tenant = {
  id: string
  name: string
  slug: string
}

export function AttendantDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [tenant, setTenant] = useState<Tenant | null>(null)

  useEffect(() => {
    api.get<Tenant>('/tenant/me').then(setTenant).catch(() => {
      logout()
      navigate('/entrar', { replace: true })
    })
  }, [logout, navigate])

  function handleLogout() {
    logout()
    navigate('/entrar', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900">{tenant?.name ?? '...'}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Boas vindas */}
        <div className="card p-6">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-1">
            Bem-vindo
          </p>
          <p className="text-gray-900 font-medium">
            Você está autenticado como <span className="text-brand-600">atendente</span>
            {tenant && <> em <span className="font-mono text-brand-600">{tenant.slug}</span></>}.
          </p>
          <p className="text-xs text-gray-400 mt-1 font-mono">uid: {user?.userId}</p>
        </div>

        {/* Placeholder de funcionalidades */}
        <div className="card p-6 border-dashed border-2 border-gray-200 bg-transparent">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-3">
            Área de operação
          </p>
          <p className="text-sm text-gray-400">
            As funcionalidades do atendente serão implementadas aqui conforme o SaaS evoluir.
            Este componente já está protegido por autenticação e isolamento de tenant via RLS.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded font-mono">role: attendant</span>
            <span className="text-xs bg-brand-50 text-brand-600 px-2 py-1 rounded font-mono">RLS ativo</span>
          </div>
        </div>

      </main>
    </div>
  )
}