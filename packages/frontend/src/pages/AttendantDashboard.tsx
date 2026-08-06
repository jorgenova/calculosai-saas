import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api/client'
import { AppShell, Card, Badge } from '@/design-system'

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
    <AppShell tenantName={tenant?.name} roleLabel="Atendente" onLogout={handleLogout} pageTitle="Visão geral">
      <Card>
        <Card.Body>
          <p className="text-xs text-graphite-500 uppercase tracking-wide font-semibold mb-1">
            Bem-vindo
          </p>
          <p className="text-graphite-900 font-medium">
            Você está autenticado como <span className="text-ink-600">atendente</span>
            {tenant && <> em <span className="font-mono text-ink-600">{tenant.slug}</span></>}.
          </p>
          <p className="text-xs text-graphite-400 mt-1 font-mono">uid: {user?.userId}</p>
        </Card.Body>
      </Card>

      <Card className="border-dashed border-2 bg-transparent shadow-none">
        <Card.Body>
          <p className="text-xs text-graphite-500 uppercase tracking-wide font-semibold mb-3">
            Área de operação
          </p>
          <p className="text-sm text-graphite-400">
            As funcionalidades do atendente serão implementadas aqui conforme o sistema evoluir.
            Este componente já está protegido por autenticação e isolamento de dados por empresa.
          </p>
          <div className="mt-4 flex gap-2">
            <Badge status="neutral">role: attendant</Badge>
            <Badge status="info">isolamento ativo</Badge>
          </div>
        </Card.Body>
      </Card>
    </AppShell>
  )
}
