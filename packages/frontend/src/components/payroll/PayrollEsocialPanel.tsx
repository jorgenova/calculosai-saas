import { type FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { Button, Input } from '@/design-system'

type Environment = 'restricted' | 'production'
type Allocation = { code: string; receipt: string }
type Establishment = { registration: string; receipt: string; allocations: Allocation[] }
type Authorization = { method: string; reference: string; verifiedOn: string; expiresOn: string; scopes: string[] }
type Settings = { employerReceipt: string; authorization: Authorization | null; establishments: Establishment[] }
type Preparation = { settings: Settings; issues: string[]; ready: boolean }
type Version = { id: string; revision: number; approvedAt: string | null }
type Evidence = { id: string; eventKey: string; eventType: string; status: string; receipt: string | null;
  protocol: string | null; origin: string; outcome?: { evidence?: string; reconciliation?: string } }
type Delivery = { delivery: { mode: 'external' | 'integrated'; pendingCount: number } | null; events: Evidence[] }

const blankAuthorization: Authorization = { method: 'employer_certificate', reference: '', verifiedOn: '', expiresOn: '', scopes: [] }
const emptySettings: Settings = { employerReceipt: '', authorization: null, establishments: [] }
const blankEvidence = { eventKey: '', eventType: 'S-1200', beneficiaryCpf: '', status: 'reported', receipt: '', protocol: '', evidence: '' }
const statuses: Record<string, string> = { reported: 'Registrado', sent: 'Enviado', indeterminate: 'Resultado indeterminado',
  accepted: 'Aceito', rejected: 'Rejeitado', queued: 'Na fila', prepared: 'Preparado' }
const statusOptions = ['reported', 'sent', 'indeterminate', 'accepted', 'rejected']

export function PayrollEsocialPanel({ companyId, canTransmit, canConfigure }: {
  companyId: string; canTransmit: boolean; canConfigure: boolean
}) {
  const [environment, setEnvironment] = useState<Environment>('restricted')
  const [settings, setSettings] = useState<Settings>(emptySettings)
  const [preparation, setPreparation] = useState<Preparation | null>(null)
  const [month, setMonth] = useState('')
  const [versionId, setVersionId] = useState('')
  const [versions, setVersions] = useState<Version[]>([])
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [mode, setMode] = useState<'external' | 'integrated'>('external')
  const [evidence, setEvidence] = useState(blankEvidence)
  const [reconciling, setReconciling] = useState<Evidence | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const prefix = '/esocial/' + environment
  const deliveryPath = prefix + '/deliveries/' + encodeURIComponent(month)

  useEffect(() => {
    let active = true
    api.payroll<Preparation>(companyId, prefix + '/settings').then(data => {
      if (active) { setPreparation(data); setSettings(data.settings) }
    }, () => { if (active) setError('Não foi possível carregar a preparação do declarante.') })
    return () => { active = false }
  }, [companyId, prefix])

  async function run(operation: () => Promise<void>) {
    setPending(true); setError('')
    try { await operation() } catch (error) {
      setError(error instanceof ApiError ? error.message : 'Não foi possível concluir a operação.')
    } finally { setPending(false) }
  }

  function eraseDelivery() { setDelivery(null); setVersions([]); setVersionId(''); setReconciling(null); setEvidence(blankEvidence) }
  function setAuthorization(change: Partial<Authorization>) {
    setSettings(current => ({ ...current, authorization: { ...(current.authorization ?? blankAuthorization), ...change } }))
  }
  function updateEstablishment(index: number, update: Partial<Establishment>) {
    setSettings(current => ({ ...current, establishments: current.establishments.map((row, i) => i === index ? { ...row, ...update } : row) }))
  }
  function loadDelivery(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      const [current, history] = await Promise.all([api.payroll<Delivery>(companyId, deliveryPath),
        api.payroll<Version[]>(companyId, '/periods/' + encodeURIComponent(month) + '/versions')])
      const approved = history.filter(row => row.approvedAt)
      setDelivery(current); setMode(current.delivery?.mode ?? 'external'); setVersions(approved)
      setVersionId(approved[0]?.id ?? ''); setReconciling(null); setEvidence(blankEvidence)
    })
  }

  function saveSettings(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      const result = await api.payroll<Preparation>(companyId, prefix + '/settings', 'PUT', settings)
      setPreparation(result); setSettings(result.settings)
    })
  }

  function saveEvidence(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      const action = reconciling ? '/' + encodeURIComponent(reconciling.id) + '/reconcile' : ''
      await api.payroll(companyId, deliveryPath + '/events' + action, reconciling ? 'PUT' : 'POST', { ...evidence, versionId })
      setDelivery(await api.payroll<Delivery>(companyId, deliveryPath)); setReconciling(null); setEvidence(blankEvidence)
    })
  }

  return <section className="space-y-5">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-graphite-600">Ambiente<select className="input-field mt-1.5" value={environment} disabled={pending}
        onChange={event => { setEnvironment(event.target.value as Environment); setPreparation(null); setSettings(emptySettings); eraseDelivery() }}>
        <option value="restricted">Produção Restrita</option><option value="production">Produção</option>
      </select></label>
      {canConfigure && <Button size="sm" variant="secondary" onClick={() => setShowSettings(!showSettings)}>
        {showSettings ? 'Ocultar configuração' : 'Preparar declarante'}
      </Button>}
    </div>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {preparation?.ready && <p className="text-sm text-graphite-700">Referências cadastrais conferidas neste ambiente.</p>}
    {preparation && preparation.issues.map(issue => <p key={issue} className="text-sm text-graphite-700">{issue}</p>)}
    {canConfigure && showSettings && preparation && <form className="space-y-3" onSubmit={saveSettings}>
      <Input label="Recibo do S-1000" value={settings.employerReceipt}
        onChange={event => setSettings({ ...settings, employerReceipt: event.target.value })} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!settings.authorization}
        onChange={event => setSettings({ ...settings, authorization: event.target.checked ? blankAuthorization : null })} />
        Registrar autorização verificada pelo escritório
      </label>
      {settings.authorization && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-graphite-600">Forma de autorização<select className="input-field mt-1.5"
          value={settings.authorization.method} onChange={event => setAuthorization({ method: event.target.value })}>
          <option value="employer_certificate">Certificado do empregador</option><option value="proxy">Procuração eletrônica</option>
        </select></label>
        <Input label="Referência da conferência" required value={settings.authorization.reference}
          onChange={event => setAuthorization({ reference: event.target.value })} />
        <Input label="Data da conferência" type="date" required value={settings.authorization.verifiedOn} onChange={event => setAuthorization({ verifiedOn: event.target.value })} />
        <Input label="Válida até" type="date" required value={settings.authorization.expiresOn} onChange={event => setAuthorization({ expiresOn: event.target.value })} />
        {[['registration', 'Eventos cadastrais'], ['payroll', 'Folha e pagamentos']].map(([value, label]) =>
          <label key={value} className="flex items-center gap-2 text-sm"><input type="checkbox"
            checked={settings.authorization!.scopes.includes(value)} onChange={event => setAuthorization({
              scopes: event.target.checked ? [...settings.authorization!.scopes, value] : settings.authorization!.scopes.filter(item => item !== value),
            })} />{label}</label>)}
      </div>}
      {settings.establishments.map((row, index) => <fieldset key={index} className="space-y-2 rounded-lg border border-graphite-200 p-3">
        <legend className="px-1 text-sm font-medium">Estabelecimento</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input label="CNPJ do estabelecimento" required value={row.registration} onChange={event => updateEstablishment(index, { registration: event.target.value })} />
          <Input label="Recibo do S-1005" value={row.receipt} onChange={event => updateEstablishment(index, { receipt: event.target.value })} />
        </div>
        {row.allocations.map((allocation, position) => <div className="grid gap-2 sm:grid-cols-3" key={position}>
          <Input label="Código da lotação" required value={allocation.code} onChange={event => updateEstablishment(index, {
            allocations: row.allocations.map((item, i) => i === position ? { ...item, code: event.target.value } : item),
          })} />
          <Input label="Recibo do S-1020" value={allocation.receipt} onChange={event => updateEstablishment(index, {
            allocations: row.allocations.map((item, i) => i === position ? { ...item, receipt: event.target.value } : item),
          })} />
          <Button type="button" size="sm" variant="ghost" onClick={() => updateEstablishment(index, { allocations: row.allocations.filter((_, i) => i !== position) })}>Remover lotação</Button>
        </div>)}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => updateEstablishment(index, { allocations: [...row.allocations, { code: '', receipt: '' }] })}>Incluir lotação</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSettings({ ...settings,
            establishments: settings.establishments.filter((_, i) => i !== index) })}>Remover estabelecimento</Button>
        </div>
      </fieldset>)}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setSettings({ ...settings,
          establishments: [...settings.establishments, { registration: '', receipt: '', allocations: [] }] })}>Incluir estabelecimento</Button>
        <Button type="submit" size="sm" disabled={pending}>Salvar configuração</Button>
      </div>
    </form>}
    <form className="flex flex-wrap items-end gap-3 border-t border-graphite-200 pt-3" onSubmit={loadDelivery}>
      <div className="w-full sm:w-48"><Input label="Competência" type="month" required value={month} disabled={pending}
        onChange={event => { setMonth(event.target.value); eraseDelivery() }} /></div>
      <Button type="submit" disabled={pending}>Consultar entrega</Button>
    </form>
    {delivery && <>
      <p className="text-sm">Responsável atual · {delivery.delivery?.mode === 'external' ? 'Envio externo'
        : delivery.delivery?.mode === 'integrated' ? 'Envio integrado' : 'A definir'}</p>
      {!!delivery.delivery?.pendingCount && <p className="text-sm">{delivery.delivery.pendingCount} evento(s) para conciliar neste declarante.</p>}
      {canTransmit && (versions.length ? <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-graphite-600">Versão aprovada<select className="input-field mt-1.5" value={versionId}
          onChange={event => setVersionId(event.target.value)}>{versions.map(row => <option key={row.id} value={row.id}>Versão {row.revision}</option>)}</select></label>
        <label className="text-xs font-medium text-graphite-600">Responsável pela entrega<select className="input-field mt-1.5" value={mode}
          onChange={event => setMode(event.target.value as 'external' | 'integrated')}>
          <option value="external">Envio externo</option><option value="integrated">Envio integrado</option>
        </select></label>
        <Button type="button" size="sm" disabled={pending} onClick={() => void run(async () => {
          await api.payroll(companyId, deliveryPath, 'PUT', { mode, versionId })
          setDelivery(await api.payroll<Delivery>(companyId, deliveryPath))
        })}>Salvar responsável</Button>
      </div> : <p className="text-sm">Aprove uma versão da folha para escolher o responsável pela entrega.</p>)}
      {delivery.events.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 rounded border border-graphite-200 p-2 text-sm">
        <strong>{row.eventType}</strong> <span>{row.eventKey} · {statuses[row.status]} · {row.origin === 'external' ? 'Externo' : 'Integrado'}</span>
        {row.receipt && <span>Recibo {row.receipt}</span>}
        {canTransmit && delivery.delivery?.mode === 'external' && row.origin === 'external' && !row.outcome?.reconciliation &&
          <Button size="sm" variant="secondary" onClick={() => {
            setReconciling(row); setEvidence({ ...blankEvidence, eventType: row.eventType,
              status: row.status === 'accepted' ? 'accepted' : 'rejected', protocol: row.protocol ?? '', receipt: row.receipt ?? '' })
          }}>Conciliar evento</Button>}
      </div>)}
      {canTransmit && delivery.delivery?.mode === 'external' && (versionId || reconciling) && <form className="space-y-2" onSubmit={saveEvidence}>
        <h3 className="text-sm font-semibold">{reconciling ? 'Conciliar ' + reconciling.eventType : 'Registrar evidência externa'}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {!reconciling && <>
            <Input label="Identificador do evento" value={evidence.eventKey} required onChange={event => setEvidence({ ...evidence, eventKey: event.target.value })} />
            <label className="text-xs font-medium text-graphite-600">Evento<select className="input-field mt-1.5" value={evidence.eventType}
              onChange={event => setEvidence({ ...evidence, eventType: event.target.value, beneficiaryCpf: '' })}>
              {['S-1200', 'S-1210', 'S-1298', 'S-1299'].map(event => <option key={event}>{event}</option>)}
            </select></label>
            {['S-1200', 'S-1210'].includes(evidence.eventType) &&
              <Input label="CPF do beneficiário" inputMode="numeric" maxLength={11} value={evidence.beneficiaryCpf}
                onChange={event => setEvidence({ ...evidence, beneficiaryCpf: event.target.value.replace(/\D/g, '') })} />}
          </>}
          <label className="text-xs font-medium text-graphite-600">Situação<select className="input-field mt-1.5" value={evidence.status}
            onChange={event => setEvidence({ ...evidence, status: event.target.value })}>
            {(reconciling ? ['accepted', 'rejected'] : statusOptions).map(status => <option key={status} value={status}>{statuses[status]}</option>)}
          </select></label>
          <Input label="Recibo" value={evidence.receipt} required={evidence.status === 'accepted'} onChange={event => setEvidence({ ...evidence, receipt: event.target.value })} />
          <Input label="Protocolo" value={evidence.protocol} required={!!reconciling && evidence.status === 'rejected'} onChange={event => setEvidence({ ...evidence, protocol: event.target.value })} />
          <Input label="Referência da evidência" value={evidence.evidence} required onChange={event => setEvidence({ ...evidence, evidence: event.target.value })} />
        </div>
        <Button type="submit" size="sm" disabled={pending}>{reconciling ? 'Salvar conciliação' : 'Salvar evidência'}</Button>
        {reconciling && <Button type="button" size="sm" variant="ghost" onClick={() => { setReconciling(null); setEvidence(blankEvidence) }}>Cancelar</Button>}
      </form>}
    </>}
  </section>
}
