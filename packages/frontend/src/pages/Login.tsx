import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api/client'
import { Button, Input } from '@/design-system'
import logoSuperiorContabil from '@/assets/logo-superior-contabil.png'

type LoginForm = {
  slug: string
  email: string
  password: string
}

type LoginResponse = {
  token: string
}

export function LoginPage() {
  const { login, user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<LoginForm>({ slug: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Se já está autenticado, redireciona
  if (user) {
    navigate(user.role === 'owner' ? '/dashboard' : '/atendimento', { replace: true })
    return null
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.slug || !form.email || !form.password) {
      setError('Preencha todos os campos.')
      return
    }

    setLoading(true)
    try {
      const { token } = await api.post<LoginResponse>('/auth/login', form, false)
      login(token)
      const payload = JSON.parse(atob(token.split('.')[1]))
      navigate(payload.role === 'owner' ? '/dashboard' : '/atendimento', { replace: true })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex">
      {/* Painel de marca */}
      <div className="hidden lg:flex lg:w-2/5 bg-ink-900 text-white flex-col justify-between p-12">
        <div>
          <img src={logoSuperiorContabil} alt="Superior Contábil" className="h-8 w-auto" />
        </div>
        <div className="max-w-sm">
          <div className="h-px w-10 bg-aurum-400 mb-6" />
          <p className="text-h2 font-medium leading-snug text-white">
            Contabilidade com a precisão que seu escritório exige.
          </p>
          <p className="text-body text-ink-300 mt-4">
            Lançamentos, DRE, conciliação bancária e gestão de clientes em um único lugar.
          </p>
        </div>
        <p className="text-xs text-ink-400">© {new Date().getFullYear()} Superior Contábil</p>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex items-center justify-center bg-graphite-50 p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-h1 text-graphite-900">Entrar</h1>
            <p className="text-body text-graphite-500 mt-1">Acesse a conta do seu escritório</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="slug"
              name="slug"
              type="text"
              autoComplete="off"
              placeholder="minha-empresa"
              label="Identificador da empresa"
              value={form.slug}
              onChange={handleChange}
            />

            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@empresa.com"
              label="E-mail"
              value={form.email}
              onChange={handleChange}
            />

            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              label="Senha"
              value={form.password}
              onChange={handleChange}
              error={error || undefined}
            />

            <Button type="submit" size="lg" className="w-full mt-2" loading={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>

          <p className="text-center text-sm text-graphite-500 mt-8">
            Ainda não tem conta?{' '}
            <Link to="/cadastro" className="text-ink-600 hover:text-ink-700 font-medium">
              Criar conta
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
