import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { api } from '@/api/client'

type AcceptInviteForm = { name: string; password: string; confirmPassword: string }
type AcceptInviteResponse = { message: string }

export function AcceptInvitePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const [form, setForm] = useState<AcceptInviteForm>({ name: '', password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) { setForm(previous => ({ ...previous, [event.target.name]: event.target.value })); setError('') }
  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault(); setError('')
    if (!token) return setError('The invitation link is missing its token.')
    if (!form.name.trim() || !form.password) return setError('Complete all fields.')
    if (form.password.length < 6) return setError('Password must contain at least 6 characters.')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')
    setLoading(true)
    try { await api.post<AcceptInviteResponse>('/convite/accept', { token, name: form.name, password: form.password }, false); setSuccess(true) }
    catch (exception) { setError(exception instanceof Error ? exception.message : 'Failed to accept the invitation.') }
    finally { setLoading(false) }
  }
  if (success) return <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4"><div className="card p-8 w-full max-w-sm text-center"><h2 className="text-lg font-semibold text-gray-900 mb-2">Invitation accepted!</h2><p className="text-sm text-gray-500 mb-6">Your attendant account was created. You can now sign in.</p><button className="btn-primary" onClick={() => navigate('/login')}>Go to login</button></div></div>
  return <div className="min-h-dvh bg-gray-50 flex items-center justify-center p-4"><div className="w-full max-w-sm"><div className="text-center mb-8"><h1 className="text-2xl font-semibold text-gray-900">Accept invitation</h1><p className="text-sm text-gray-500 mt-1">Set your name and password to get started</p></div><div className="card p-6">{!token ? <p className="form-error">The invitation link is missing its token.</p> : <form onSubmit={handleSubmit} className="space-y-4"><label className="input-label" htmlFor="name">Full name</label><input id="name" name="name" value={form.name} onChange={handleChange} className="input-field" /><label className="input-label" htmlFor="password">Password</label><input id="password" name="password" type="password" value={form.password} onChange={handleChange} className="input-field" /><label className="input-label" htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} className="input-field" />{error && <p className="form-error">{error}</p>}<button type="submit" className="btn-primary mt-2" disabled={loading}>{loading ? 'Confirming...' : 'Accept invitation'}</button></form>}</div><p className="text-center text-sm text-gray-500 mt-6">Already have an account? <Link to="/login" className="text-ink-600 hover:text-ink-700 font-medium">Sign in</Link></p></div></div>
}
