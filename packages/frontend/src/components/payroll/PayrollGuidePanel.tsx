import { type FormEvent, useState } from 'react'
import { api, ApiError, downloadPayrollFile } from '@/api/client'
import { Button, Input } from '@/design-system'

const kinds = { dctfweb: 'DCTFWeb', darf: 'DARF', gfd: 'GFD' }
const labels = { pending: 'Pendente', declared: 'Declarada', issued: 'Emitida', paid: 'Quitada', not_applicable: 'Não aplicável' }
const deliveryLabels: Record<string, string> = { accepted: 'Aceita', rejected: 'Rejeitada', sent: 'Enviada', reported: 'Registrada',
  queued: 'Na fila', prepared: 'Preparada', indeterminate: 'Resultado pendente', reopened: 'Reaberta' }
type Kind = keyof typeof kinds
type Status = keyof typeof labels
type Guide = {
  id: string; kind: Kind; status: Status; officialReference: string | null; amount: string | null; expectedAmount: string | null;
  dueOn: string | null; paidOn: string | null; paymentReference: string | null; discrepancyReason: string | null; documentId: string | null;
}
type Result = { guides: Guide[]; delivery: { status: string; receipt: string | null } | null }
const blank = { kind: 'dctfweb' as Kind, status: 'pending' as Status, officialReference: '', amount: '', expectedAmount: '',
  dueOn: '', paidOn: '', paymentReference: '', discrepancyReason: '' }
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const date = (value: string) => value.split('-').reverse().join('/')

export function PayrollGuidePanel({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [month, setMonth] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(blank)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const path = '/guides/' + encodeURIComponent(month)
  const statuses: Status[] = form.kind === 'dctfweb' ? ['pending', 'declared', 'not_applicable'] : ['pending', 'issued', 'paid', 'not_applicable']

  async function run(action: () => Promise<void>) {
    setError(''); setFields({}); setPending(true)
    try { await action() } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível atualizar as obrigações.')
      setFields(failure instanceof ApiError ? failure.fields : {})
    } finally { setPending(false) }
  }

  function open(guide?: Guide) {
    setError(''); setFields({}); setEditing(guide?.id ?? 'new')
    setForm(guide ? {
      kind: guide.kind, status: guide.status, officialReference: guide.officialReference ?? '', amount: guide.amount ?? '',
      expectedAmount: guide.expectedAmount ?? '', dueOn: guide.dueOn ?? '', paidOn: guide.paidOn ?? '',
      paymentReference: guide.paymentReference ?? '', discrepancyReason: guide.discrepancyReason ?? '',
    } : blank)
  }

  function save(event: FormEvent) {
    event.preventDefault()
    void run(async () => {
      await api.payroll(companyId, editing === 'new' ? path : path + '/' + editing, editing === 'new' ? 'POST' : 'PUT', form)
      setResult(await api.payroll<Result>(companyId, path))
      setEditing(null)
    })
  }

  return <section className="space-y-4">
    <h3 className="text-base font-semibold">Obrigações e guias</h3>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault(); void run(async () => { setResult(await api.payroll<Result>(companyId, path)); setEditing(null) })
    }}>
      <div className="w-full sm:w-48"><Input label="Competência" type="month" required value={month}
        onChange={event => { setMonth(event.target.value); setResult(null); setEditing(null) }} /></div>
      <Button type="submit" disabled={pending}>Pesquisar</Button>
    </form>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {result && <>
      <p className="text-sm text-graphite-700">Entrega eSocial · {result.delivery ? deliveryLabels[result.delivery.status] : 'Sem fechamento registrado'}
        {result.delivery?.receipt && ' · Recibo ' + result.delivery.receipt}</p>
      {canWrite && <Button size="sm" variant="secondary" disabled={pending} onClick={() => open()}>Registrar obrigação</Button>}
      {editing && <form className="space-y-3" onSubmit={save}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-graphite-600">Obrigação<select className="input-field mt-1.5" value={form.kind}
            disabled={editing !== 'new'} onChange={event => setForm({ ...form, kind: event.target.value as Kind, status: 'pending', paidOn: '', paymentReference: '' })}>
            {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          <label className="text-xs font-medium text-graphite-600">Situação<select className="input-field mt-1.5" value={form.status}
            onChange={event => setForm({ ...form, status: event.target.value as Status,
              ...((event.target.value !== 'paid') ? { paidOn: '', paymentReference: '' } : {}) })}>
            {statuses.map(status => <option key={status} value={status}>{labels[status]}</option>)}
          </select></label>
          {([['officialReference', 'Referência oficial', 'text'], ['amount', 'Valor oficial', 'text'],
            ['expectedAmount', 'Valor de referência', 'text'], ['dueOn', 'Vencimento', 'date'],
            ['discrepancyReason', 'Justificativa da divergência', 'text'],
            ...(form.status === 'paid' ? [['paidOn', 'Data da quitação', 'date'], ['paymentReference', 'Referência da quitação', 'text']] as const : []),
          ] as const).map(([name, label, type]) => <Input key={name} label={label} type={type} value={form[name]}
            error={fields[name]} onChange={event => setForm({ ...form, [name]: event.target.value })} />)}
        </div>
        <div className="flex gap-2"><Button type="submit" disabled={pending}>Salvar</Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button></div>
      </form>}
      {!result.guides.length && <p className="text-sm text-graphite-600">Nenhuma obrigação registrada nesta competência.</p>}
      {result.guides.map(guide => <div className="space-y-2 rounded-lg border border-graphite-200 p-3" key={guide.id}>
        <h4 className="text-sm font-semibold">{kinds[guide.kind]} · {labels[guide.status]}</h4>
        {guide.officialReference && <p className="text-sm">Referência {guide.officialReference}</p>}
        {guide.amount && <p className="text-sm">{brl.format(Number(guide.amount))}{guide.dueOn && ' · Vence em ' + date(guide.dueOn)}</p>}
        {guide.discrepancyReason && <p className="text-sm">Divergência · {guide.discrepancyReason}</p>}
        {guide.paidOn && <p className="text-sm">Quitada em {date(guide.paidOn)} · {guide.paymentReference}</p>}
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && <Button size="sm" variant="secondary" disabled={pending} onClick={() => open(guide)}>Editar</Button>}
          {guide.documentId && <Button size="sm" variant="secondary" disabled={pending} onClick={() => void run(() =>
            downloadPayrollFile(companyId, '/documents/' + encodeURIComponent(guide.documentId!), kinds[guide.kind] + '-' + month + '.pdf'))}>Baixar PDF</Button>}
          {canWrite && <label className="text-xs text-graphite-700">Anexar PDF
            <input className="ml-2 text-xs" type="file" accept="application/pdf" disabled={pending} onChange={event => {
              const file = event.target.files?.[0]
              if (!file) return
              void run(async () => {
                await api.payroll(companyId, path + '/' + guide.id + '/document', 'PUT', file)
                setResult(await api.payroll<Result>(companyId, path))
              })
            }} /></label>}
        </div>
      </div>)}
    </>}
  </section>
}
