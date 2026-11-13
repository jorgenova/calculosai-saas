import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { CompaniesPanel } from '@/components/CompaniesPanel'
import { useAuth } from '@/contexts/AuthContext'
import { useOffice } from '@/contexts/OfficeContext'
import { AppShell, Badge, Button, Card, Input, Spinner } from '@/design-system'

type Account = { id: string; name: string; slug: string; status: string }
type Attendant = { id: string; name: string; email: string; office_ids: string[] }

function formatCnpj(value: string) {
  return value.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function OwnerDashboard() {
  const { logout } = useAuth()
  const { offices, activeOffice, refreshOffices } = useOffice()
  const navigate = useNavigate()
  const [account, setAccount] = useState<Account | null>(null)
  const [attendants, setAttendants] = useState<Attendant[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [officeForm, setOfficeForm] = useState({ name: '', cnpj: '' })
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteOfficeIds, setInviteOfficeIds] = useState<string[]>([])

  const loadAttendants = useCallback(async () => {
    setAttendants(await api.get<Attendant[]>('/offices/users'))
  }, [])

  useEffect(() => {
    Promise.all([api.get<Account>('/tenant/me'), loadAttendants()])
      .then(([data]) => setAccount(data))
      .catch(() => { logout(); navigate('/entrar', { replace: true }) })
      .finally(() => setLoading(false))
  }, [loadAttendants, logout, navigate])

  useEffect(() => {
    if (inviteOfficeIds.length === 0 && activeOffice) setInviteOfficeIds([activeOffice.id])
  }, [activeOffice, inviteOfficeIds.length])

  function showError(exception: unknown) {
    setMessage(''); setError(exception instanceof Error ? exception.message : 'Operação não concluída.')
  }

  async function createOffice(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    try {
      await api.post('/offices', officeForm, true)
      setOfficeForm({ name: '', cnpj: '' }); setMessage('Escritório criado com sucesso.')
      await refreshOffices()
    } catch (exception) { showError(exception) }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setError(''); setMessage('')
    try {
      await api.post('/invite', { email: inviteEmail, officeIds: inviteOfficeIds }, true)
      setInviteEmail(''); setMessage('Convite ou acesso enviado com sucesso.'); await loadAttendants()
    } catch (exception) { showError(exception) }
  }

  async function toggleAccess(attendant: Attendant, officeId: string) {
    setError(''); setMessage('')
    try {
      if (attendant.office_ids.includes(officeId)) await api.delete(`/offices/${officeId}/accesses/${attendant.id}`)
      else await api.post(`/offices/${officeId}/accesses`, { userId: attendant.id }, true)
      await loadAttendants()
    } catch (exception) { showError(exception) }
  }

  if (loading) return <div className="min-h-dvh flex items-center justify-center"><Spinner className="h-6 w-6" /></div>

  return (
    <AppShell tenantName={account?.name} roleLabel="Proprietário" pageTitle="Gestão da conta" onLogout={() => { logout(); navigate('/entrar') }}>
      {(message || error) && <Badge status={error ? 'danger' : 'success'}>{error || message}</Badge>}
      <Card><Card.Header><h2 className="text-h3 text-graphite-900">Conta</h2></Card.Header><Card.Body>
        <dl className="grid sm:grid-cols-3 gap-4"><div><dt className="text-xs text-graphite-500">Nome</dt><dd>{account?.name}</dd></div><div><dt className="text-xs text-graphite-500">Identificador</dt><dd className="font-mono">{account?.slug}</dd></div><div><dt className="text-xs text-graphite-500">Status</dt><dd>{account?.status}</dd></div></dl>
      </Card.Body></Card>

      <Card><Card.Header><h2 className="text-h3 text-graphite-900">Escritórios</h2></Card.Header><Card.Body>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">{offices.map(office => <div key={office.id} className="rounded-lg border border-graphite-200 p-3"><p className="font-medium">{office.name}</p><p className="text-xs font-mono text-graphite-500">{formatCnpj(office.cnpj)}</p></div>)}</div>
          <form className="space-y-3" onSubmit={createOffice}><Input label="Nome do novo escritório" value={officeForm.name} onChange={event => setOfficeForm(previous => ({ ...previous, name: event.target.value }))} required /><Input label="CNPJ" value={officeForm.cnpj} onChange={event => setOfficeForm(previous => ({ ...previous, cnpj: event.target.value }))} required /><Button type="submit">Criar escritório</Button></form>
        </div>
      </Card.Body></Card>

      <Card><Card.Header><h2 className="text-h3 text-graphite-900">Convidar atendente</h2></Card.Header><Card.Body>
        <form className="space-y-3" onSubmit={invite}><Input type="email" label="E-mail" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} required /><div><p className="text-xs font-medium text-graphite-600 mb-2">Escritórios autorizados</p><div className="flex flex-wrap gap-3">{offices.map(office => <label key={office.id} className="text-sm"><input type="checkbox" className="mr-1" checked={inviteOfficeIds.includes(office.id)} onChange={event => setInviteOfficeIds(current => event.target.checked ? [...current, office.id] : current.filter(id => id !== office.id))} />{office.name}</label>)}</div></div><Button type="submit">Enviar convite ou conceder acesso</Button></form>
      </Card.Body></Card>

      <Card><Card.Header><h2 className="text-h3 text-graphite-900">Acessos dos atendentes</h2></Card.Header><Card.Body>
        {attendants.length === 0 ? <p className="text-sm text-graphite-500">Nenhum atendente cadastrado.</p> : <div className="space-y-4">{attendants.map(attendant => <div key={attendant.id} className="border-b border-graphite-100 pb-3"><p className="font-medium">{attendant.name} <span className="font-normal text-graphite-500">{attendant.email}</span></p><div className="flex flex-wrap gap-2 mt-2">{offices.map(office => <Button key={office.id} size="sm" variant={attendant.office_ids.includes(office.id) ? 'primary' : 'secondary'} onClick={() => void toggleAccess(attendant, office.id)}>{office.name}</Button>)}</div></div>)}</div>}
      </Card.Body></Card>

      <CompaniesPanel />
    </AppShell>
  )
}
