import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useOffice } from '@/contexts/OfficeContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { Button, Input } from '@/design-system'

const regimes = [['mei', 'MEI'], ['simples_nacional', 'Simples Nacional'], ['lucro_presumido', 'Lucro Presumido'], ['lucro_real', 'Lucro Real']]
const initialForm = () => ({ identificationType: 'cnpj', taxId: '', name: '', taxRegime: 'simples_nacional', startDate: new Date().toLocaleDateString('en-CA') })

export function CompanyCreate() {
  const { activeOffice } = useOffice()
  const { dirty, setDirty } = useWorkspace()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdId, setCreatedId] = useState('')
  const submitting = useRef(false)
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; setDirty(false) } }, [setDirty])
  useEffect(() => { if (createdId && !dirty) navigate(`/app/companies/${createdId}/registration/identity`, { replace: true }) }, [createdId, dirty, navigate])
  function update(values: Partial<typeof form>) { setForm(previous => ({ ...previous, ...values })); setDirty(true) }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current || !activeOffice) return
    submitting.current = true; setSaving(true); setError('')
    try {
      const company = await api.officePost<{ id: string }>('/companies', form)
      if (!mounted.current) return
      setDirty(false)
      setCreatedId(company.id)
    } catch (exception) {
      if (mounted.current) {
        const message = exception instanceof Error ? exception.message : ''
        setError(/duplicate|unique|already exists|already registered/i.test(message) ? 'Já existe uma empresa com este documento no escritório.' : /identification|tax regime|required/i.test(message) ? 'Confira o documento, o nome e o regime informados.' : 'Não foi possível cadastrar a empresa. Confira os dados e tente novamente.')
      }
    } finally { submitting.current = false; if (mounted.current) setSaving(false) }
  }

  if (!activeOffice) return <p>Selecione um escritório para cadastrar uma empresa.</p>
  return <div className="max-w-5xl">
    <nav aria-label="Caminho" className="text-sm text-graphite-600 mb-4"><Link to="/app/companies" className="portal-link">Empresas</Link> / Nova empresa</nav>
    <h1 className="text-2xl font-semibold">Nova empresa</h1>
    <p className="text-sm text-graphite-600 mt-2">Cadastre os dados essenciais para {activeOffice.name}. Você poderá completar o cadastro depois.</p>
    <form onSubmit={submit} className="mt-5">
      <div className="border-b border-graphite-200 pb-4"><h2 className="font-semibold">Dados iniciais</h2><p className="text-sm text-graphite-600 mt-1">Informe a identificação e o regime tributário inicial.</p></div>
      <div className="grid gap-4 sm:grid-cols-2 mt-4 max-w-3xl">
        <label className="block text-xs font-medium text-graphite-600">Tipo de documento<select className="input-field mt-1" value={form.identificationType} onChange={event => update({ identificationType: event.target.value, taxId: '' })}><option value="cnpj">CNPJ</option><option value="cpf">CPF</option></select></label>
        <Input label={form.identificationType === 'cnpj' ? 'CNPJ' : 'CPF'} value={form.taxId} inputMode="numeric" onChange={event => update({ taxId: event.target.value })} required />
        <div className="sm:col-span-2"><Input label={form.identificationType === 'cnpj' ? 'Razão social' : 'Nome completo'} value={form.name} onChange={event => update({ name: event.target.value })} required /></div>
        <label className="block text-xs font-medium text-graphite-600">Regime tributário<select className="input-field mt-1" value={form.taxRegime} onChange={event => update({ taxRegime: event.target.value })}>{regimes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Input label="Início do regime" type="date" value={form.startDate} onChange={event => update({ startDate: event.target.value })} required />
      </div>
      {error && <p role="alert" className="text-sm text-danger-600 mt-4">{error}</p>}
      <div className="flex flex-wrap gap-2 border-t border-graphite-200 mt-6 pt-4"><Button type="submit" loading={saving}>Cadastrar empresa</Button><Button type="button" variant="secondary" disabled={saving} onClick={() => navigate('/app/companies')}>Cancelar</Button></div>
    </form>
  </div>
}
