import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { api } from '@/api/client'

type AcceptInviteForm = {
  nome: string
  senha: string
  confirmarSenha: string
}

type AcceptInviteResponse = {
  message: string
}

export function AceitarConvitePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [form, setForm] = useState<AcceptInviteForm>({
    nome: '',
    senha: '',
    confirmarSenha: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!token) {
      setError('Link de convite inválido — falta o token.')
      return
    }

    if (!form.nome.trim() || !form.senha) {
      setError('Preencha todos os campos.')
      return
    }

    if (form.senha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    if (form.senha !== form.confirmarSenha) {
      setError('As senhas não conferem.')
      return
    }

    setLoading(true)
    try {
      await api.post<AcceptInviteResponse>('/convite/aceitar', {
        token,
        nome: form.nome,
        senha: form.senha,
      }, false)
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao aceitar o convite.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="card p-8">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Convite aceito!</h2>
            <p className="text-sm text-gray-500 mb-6">
              Sua conta de atendente foi criada. Já pode entrar com seu e-mail e senha.
            </p>
            <button className="btn-primary" onClick={() => navigate('/entrar')}>
              Ir para o login
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Aceitar convite</h1>
          <p className="text-sm text-gray-500 mt-1">Defina seu nome e sua senha para começar</p>
        </div>

        <div className="card p-6">
          {!token ? (
            <p className="form-error">Link de convite inválido — falta o token.</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="input-label" htmlFor="nome">Nome completo</label>
                <input
                  id="nome"
                  name="nome"
                  type="text"
                  placeholder="João Silva"
                  value={form.nome}
                  onChange={handleChange}
                  className="input-field"
                />
              </div>

              <div>
                <label className="input-label" htmlFor="senha">Senha</label>
                <input
                  id="senha"
                  name="senha"
                  type="password"
                  placeholder="mínimo 6 caracteres"
                  value={form.senha}
                  onChange={handleChange}
                  className="input-field"
                />
              </div>

              <div>
                <label className="input-label" htmlFor="confirmarSenha">Confirmar senha</label>
                <input
                  id="confirmarSenha"
                  name="confirmarSenha"
                  type="password"
                  placeholder="repita a senha"
                  value={form.confirmarSenha}
                  onChange={handleChange}
                  className="input-field"
                />
              </div>

              {error && <p className="form-error">{error}</p>}

              <button type="submit" className="btn-primary mt-2" disabled={loading}>
                {loading ? 'Confirmando...' : 'Aceitar convite'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Já tem conta?{' '}
          <Link to="/entrar" className="text-brand-600 hover:text-brand-700 font-medium">
            Entrar
          </Link>
        </p>

      </div>
    </div>
  )
}
