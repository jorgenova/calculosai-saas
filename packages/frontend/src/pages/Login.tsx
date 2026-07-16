import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/api/client'

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
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo / título */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Entrar</h1>
          <p className="text-sm text-gray-500 mt-1">Acesse sua conta</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="input-label" htmlFor="slug">
                Identificador da empresa
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                autoComplete="off"
                placeholder="minha-empresa"
                value={form.slug}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            <div>
              <label className="input-label" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com"
                value={form.email}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            <div>
              <label className="input-label" htmlFor="password">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="btn-primary mt-2" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

          </form>
        </div>

        {/* Link para cadastro */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="text-brand-600 hover:text-brand-700 font-medium">
            Criar conta
          </Link>
        </p>

      </div>
    </div>
  )
}