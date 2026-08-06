import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api/client'
import { AppShell, Card, Input, Button, Badge, Spinner } from '@/design-system'

type Tenant = {
  id: string
  name: string
  cnpj: string
  slug: string
}

function formatCnpj(cnpj: string): string {
  return cnpj
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function OwnerDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loadingTenant, setLoadingTenant] = useState(true)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  useEffect(() => {
    api.get<Tenant>('/tenant/me').then(data => {
      setTenant(data)
    }).catch(() => {
      logout()
      navigate('/entrar', { replace: true })
    }).finally(() => {
      setLoadingTenant(false)
    })
  }, [logout, navigate])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError('')
    setInviteSuccess('')

    if (!inviteEmail) {
      setInviteError('Informe o e-mail do atendente.')
      return
    }

    setInviteLoading(true)
    try {
      await api.post('/invite', { email: inviteEmail }, true)
      setInviteSuccess('Convite enviado com sucesso!')
      setInviteEmail('')
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Erro ao enviar convite.')
    } finally {
      setInviteLoading(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/entrar', { replace: true })
  }

  if (loadingTenant) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-graphite-50">
        <Spinner className="h-6 w-6 text-ink-400" />
      </div>
    )
  }

  return (
    <AppShell tenantName={tenant?.name} roleLabel="Proprietário" onLogout={handleLogout} pageTitle="Visão geral">
      <Card>
        <Card.Header>
          <h2 className="text-h3 text-graphite-900">Dados da empresa</h2>
        </Card.Header>
        <Card.Body>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <dt className="text-xs text-graphite-500">Nome</dt>
              <dd className="text-sm font-medium text-graphite-900 mt-0.5">{tenant?.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-graphite-500">CNPJ</dt>
              <dd className="text-sm font-medium text-graphite-900 font-mono mt-0.5">
                {tenant?.cnpj ? formatCnpj(tenant.cnpj) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-graphite-500">Identificador</dt>
              <dd className="text-sm font-medium text-ink-600 font-mono mt-0.5">{tenant?.slug}</dd>
            </div>
          </dl>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <h2 className="text-h3 text-graphite-900">Convidar atendente</h2>
        </Card.Header>
        <Card.Body>
          <form onSubmit={handleInvite} className="space-y-4 max-w-sm">
            <Input
              id="inviteEmail"
              type="email"
              label="E-mail do atendente"
              placeholder="atendente@empresa.com"
              value={inviteEmail}
              onChange={e => {
                setInviteEmail(e.target.value)
                setInviteError('')
                setInviteSuccess('')
              }}
              error={inviteError || undefined}
            />

            {inviteSuccess && <Badge status="success">{inviteSuccess}</Badge>}

            <Button type="submit" loading={inviteLoading}>
              {inviteLoading ? 'Enviando...' : 'Enviar convite'}
            </Button>
          </form>
        </Card.Body>
      </Card>
    </AppShell>
  )
}
