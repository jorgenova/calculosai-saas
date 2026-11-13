import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { CompaniesPanel } from '@/components/CompaniesPanel'
import { useAuth } from '@/contexts/AuthContext'
import { AppShell, Card } from '@/design-system'

type Account = { id: string; name: string; slug: string }

export function AttendantDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [account, setAccount] = useState<Account | null>(null)

  useEffect(() => {
    api.get<Account>('/tenant/me').then(setAccount).catch(() => {
      logout(); navigate('/entrar', { replace: true })
    })
  }, [logout, navigate])

  return (
    <AppShell tenantName={account?.name} roleLabel="Atendente" pageTitle="Empresas" onLogout={() => { logout(); navigate('/entrar') }}>
      <Card><Card.Body><p className="text-sm text-graphite-600">Selecione um escritório para trabalhar. Somente os escritórios autorizados aparecem no seletor.</p></Card.Body></Card>
      <CompaniesPanel />
    </AppShell>
  )
}
