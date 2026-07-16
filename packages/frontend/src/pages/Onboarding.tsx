import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '@/api/client'

const PRICE_ID = 'price_1TYZPpRtUHllh5POkbuZXNTH'

type OnboardingForm = {
  name: string
  email: string
  password: string
  companyName: string
  cnpj: string
  slug: string
}

type OnboardingResponse = {
  message: string
  tenantId: string
  subscription: string
}

type CnpjResponse = {
  razao_social: string
  situacao_cadastral: number
  descricao_situacao_cadastral: string
}

function cnpjValido(cnpj: string): boolean {
  const n = cnpj.replace(/\D/g, '')
  if (n.length !== 14 || /^(\d)\1+$/.test(n)) return false
  const calc = (len: number) => {
    const w = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]
    const sum = n.slice(0, len).split('').reduce((a, d, i) => a + parseInt(d) * w[i], 0)
    const r = sum % 11
    return r < 2 ? 0 : 11 - r
  }
  return calc(12) === parseInt(n[12]) && calc(13) === parseInt(n[13])
}

function formatCnpj(value: string): string {
  return value
    .replace(/\D/g, '')
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function formatSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function OnboardingPage() {
  const navigate = useNavigate()

  const [form, setForm] = useState<OnboardingForm>({
    name: '',
    email: '',
    password: '',
    companyName: '',
    cnpj: '',
    slug: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjError, setCnpjError] = useState('')
  const [cnpjValid, setCnpjValid] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target

    if (name === 'cnpj') {
      setForm(prev => ({ ...prev, cnpj: formatCnpj(value) }))
      setCnpjError('')
      setCnpjValid(false)
      return
    }

    if (name === 'slug') {
      setForm(prev => ({ ...prev, slug: formatSlug(value) }))
      return
    }

    if (name === 'companyName') {
      setForm(prev => ({
        ...prev,
        companyName: value,
        slug: formatSlug(value),
      }))
      return
    }

    setForm(prev => ({ ...prev, [name]: value }))
    setError('')
  }

  async function handleCnpjBlur() {
    const cnpjNumeros = form.cnpj.replace(/\D/g, '')
    if (cnpjNumeros.length !== 14) return

    if (!cnpjValido(cnpjNumeros)) {
      setCnpjError('CNPJ inválido.')
      setCnpjValid(false)
      return
    }

    setCnpjLoading(true)
    setCnpjError('')

    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjNumeros}`)
      if (response.ok) {
        const data = await response.json() as CnpjResponse
        setCnpjValid(true)
        setForm(prev => ({
          ...prev,
          companyName: data.razao_social,
          slug: formatSlug(data.razao_social),
        }))
      } else {
        setCnpjValid(true)
      }
    } catch {
      setCnpjValid(true)
    } finally {
      setCnpjLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const allFilled = Object.values(form).every(v => v.trim() !== '')
    if (!allFilled) {
      setError('Preencha todos os campos.')
      return
    }

    if (form.password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        ...form,
        cnpj: form.cnpj.replace(/\D/g, ''),
        priceId: PRICE_ID,
      }

      await api.post<OnboardingResponse>('/onboarding', payload, false)
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao criar conta.')
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
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Conta criada com sucesso!</h2>
            <p className="text-sm text-gray-500 mb-6">
              Verifique seu e-mail e acesse sua conta com o identificador <span className="font-mono text-brand-600">{form.slug}</span>.
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
          <h1 className="text-2xl font-semibold text-gray-900">Criar conta</h1>
          <p className="text-sm text-gray-500 mt-1">Preencha os dados da sua empresa</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Empresa</p>

            <div>
              <label className="input-label" htmlFor="cnpj">CNPJ</label>
              <input
                id="cnpj"
                name="cnpj"
                type="text"
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                value={form.cnpj}
                onChange={handleChange}
                onBlur={handleCnpjBlur}
                className="input-field font-mono"
              />
              {cnpjLoading && (
                <p className="text-xs text-gray-400 mt-1">Consultando Receita Federal...</p>
              )}
              {cnpjError && <p className="form-error">{cnpjError}</p>}
              {cnpjValid && (
                <p className="text-xs text-green-600 mt-1">CNPJ válido ✓</p>
              )}
            </div>

            <div>
              <label className="input-label" htmlFor="companyName">Nome da empresa</label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                placeholder="Minha Empresa Ltda"
                value={form.companyName}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            <div>
              <label className="input-label" htmlFor="slug">
                Identificador <span className="text-gray-400 font-normal">(usado no login)</span>
              </label>
              <input
                id="slug"
                name="slug"
                type="text"
                placeholder="minha-empresa"
                value={form.slug}
                onChange={handleChange}
                className="input-field font-mono"
              />
              {form.slug && (
                <p className="text-xs text-gray-400 mt-1">
                  Acesso: <span className="text-brand-600">{form.slug}</span>.seudominio.com.br
                </p>
              )}
            </div>

            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Seus dados</p>

            <div>
              <label className="input-label" htmlFor="name">Nome completo</label>
              <input
                id="name"
                name="name"
                type="text"
                placeholder="João Silva"
                value={form.name}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            <div>
              <label className="input-label" htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="voce@empresa.com"
                value={form.email}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            <div>
              <label className="input-label" htmlFor="password">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="mínimo 6 caracteres"
                value={form.password}
                onChange={handleChange}
                className="input-field"
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button type="submit" className="btn-primary mt-2" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>

          </form>
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