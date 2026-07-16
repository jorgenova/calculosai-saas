import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api/client'

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
      <div className="min-h-dvh flex items-center justify-center">
        <span className="text-sm text-gray-400">Carregando...</span>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50">

      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-gray-900">{tenant?.name}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Dados da empresa */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Dados da empresa
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400">Nome</p>
              <p className="text-sm font-medium text-gray-900">{tenant?.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">CNPJ</p>
              <p className="text-sm font-medium text-gray-900 font-mono">
                {tenant?.cnpj ? formatCnpj(tenant.cnpj) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Identificador</p>
              <p className="text-sm font-medium text-brand-600 font-mono">{tenant?.slug}</p>
            </div>
          </div>
        </div>

        {/* Convidar atendente */}
        <div className="card p-6">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Convidar atendente
          </h2>
          <form onSubmit={handleInvite} className="space-y-3">
            <div>
              <label className="input-label" htmlFor="inviteEmail">
                E-mail do atendente
              </label>
              <input
                id="inviteEmail"
                type="email"
                placeholder="atendente@empresa.com"
                value={inviteEmail}
                onChange={e => {
                  setInviteEmail(e.target.value)
                  setInviteError('')
                  setInviteSuccess('')
                }}
                className="input-field"
              />
            </div>

            {inviteError && <p className="form-error">{inviteError}</p>}
            {inviteSuccess && <p className="text-xs text-green-600 mt-1">{inviteSuccess}</p>}

            <button type="submit" className="btn-primary" disabled={inviteLoading}>
              {inviteLoading ? 'Enviando...' : 'Enviar convite'}
            </button>
          </form>
        </div>

      </main>
    </div>
  )
}