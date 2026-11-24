import { type FormEvent, useEffect, useState } from 'react'
import { api, ApiError, downloadPayrollFile } from '@/api/client'
import { Button, Input } from '@/design-system'

type Employee = { id: string; status: string; person: { fullName: string } }
type Vacation = { id: string; fullName: string; startsOn: string; endsOn: string; value: {
  days: number; noticeDueOn: string; paymentDueOn: string; base: string; gross: string; constitutionalThird: string;
  allocations: { competence: string; days: number; gross: string }[];
  payment?: { paidOn: string; paidAmount: string };
} }

const blankForm = { engagementId: '', startsOn: '', endsOn: '', acquisitionStartsOn: '', acquisitionEndsOn: '',
  entitlementDays: '30', additionalBase: '' }
const dates = [
  ['acquisitionStartsOn', 'Início do período aquisitivo'], ['acquisitionEndsOn', 'Fim do período aquisitivo'],
  ['startsOn', 'Início do gozo'], ['endsOn', 'Fim do gozo'],
] as const
const paymentFields = [
  ['paidOn', 'Data do pagamento', 'date'], ['paidAmount', 'Líquido pago (R$)', 'text'],
  ['inss', 'INSS conferido (R$)', 'text'], ['irrf', 'IRRF conferido (R$)', 'text'],
  ['otherDeductions', 'Outros descontos (R$)', 'text'], ['evidenceReference', 'Referência do comprovante', 'text'],
] as const
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
function brl(value: string) { return currency.format(Number(value)) }
function displayDate(value: string) { return value.split('-').reverse().join('/') }

export function PayrollVacationPanel({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [vacations, setVacations] = useState<Vacation[] | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [form, setForm] = useState(blankForm)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [paymentForm, setPaymentForm] = useState<{
    id: string; paidOn: string; paidAmount: string; inss: string; irrf: string; otherDeductions: string; evidenceReference: string;
  } | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([api.payroll<Vacation[]>(companyId, '/vacations'),
      canWrite ? api.payroll<Employee[]>(companyId, '/people/employee') : Promise.resolve([])]).then(
      ([rows, people]) => { if (active) { setVacations(rows); setEmployees(people.filter(person => person.status === 'active')) } },
      () => { if (active) setError('Não foi possível carregar as férias.') },
    )
    return () => { active = false }
  }, [companyId, canWrite])

  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setPending(true)
    try {
      await api.payroll(companyId, '/vacations', 'POST', form)
      setForm(blankForm)
      setVacations(await api.payroll<Vacation[]>(companyId, '/vacations'))
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível programar as férias.')
    } finally { setPending(false) }
  }

  async function savePayment(event: FormEvent) {
    event.preventDefault()
    if (!paymentForm) return
    setPending(true); setError('')
    try {
      await api.payroll(companyId, '/vacations/' + paymentForm.id + '/payment', 'PUT', paymentForm)
      setVacations(await api.payroll<Vacation[]>(companyId, '/vacations')); setPaymentForm(null)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível registrar o pagamento.')
    } finally { setPending(false) }
  }

  async function download(vacation: Vacation, kind: 'notice' | 'receipt') {
    setError('')
    try { await downloadPayrollFile(companyId, '/vacations/' + vacation.id + '/documents/' + kind,
      'ferias-' + (kind === 'notice' ? 'aviso-' : 'recibo-') + vacation.startsOn + '.html') }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : 'Não foi possível baixar o documento.') }
  }

  return <section className="space-y-4">
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {canWrite && employees.length > 0 && <form className="space-y-3" onSubmit={save}>
      <h3 className="text-base font-semibold">Programar férias</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-graphite-600">Funcionário<select className="input-field mt-1.5" required
          value={form.engagementId} onChange={event => setForm({ ...form, engagementId: event.target.value })}>
          <option value="">Selecione</option>{employees.map(row => <option key={row.id} value={row.id}>{row.person.fullName}</option>)}
        </select></label>
        <label className="text-xs font-medium text-graphite-600">Dias de direito no período aquisitivo<select className="input-field mt-1.5"
          value={form.entitlementDays} onChange={event => setForm({ ...form, entitlementDays: event.target.value })}>
          {['12', '18', '24', '30'].map(days => <option key={days}>{days}</option>)}
        </select></label>
        {dates.map(([field, label]) => <Input key={field} label={label} type="date" required value={form[field]}
          onChange={event => setForm({ ...form, [field]: event.target.value })} />)}
        <Input label="Médias e adicionais que compõem a base mensal (R$)" inputMode="decimal"
          value={form.additionalBase} onChange={event => setForm({ ...form, additionalBase: event.target.value })} />
      </div>
      <Button type="submit" disabled={pending}>Salvar programação</Button>
    </form>}
    <h3 className="text-base font-semibold">Férias programadas</h3>
    {vacations?.length === 0 && <p className="text-sm text-graphite-600">Nenhum período cadastrado.</p>}
    {vacations?.map(vacation => <details key={vacation.id} className="space-y-2 rounded-lg border border-graphite-200 p-3">
      <summary className="cursor-pointer text-sm font-medium">{vacation.fullName} · {displayDate(vacation.startsOn)} a {displayDate(vacation.endsOn)}</summary>
      <p className="text-sm">Aviso até {displayDate(vacation.value.noticeDueOn)} · Pagamento até {displayDate(vacation.value.paymentDueOn)}</p>
      <p className="text-sm">Base {brl(vacation.value.base)} · Terço constitucional {brl(vacation.value.constitutionalThird)} · Bruto previsto {brl(vacation.value.gross)}</p>
      <ul className="text-sm text-graphite-600">{vacation.value.allocations.map(slice => <li key={slice.competence}>
        {displayDate(slice.competence)} · {slice.days} dias · {brl(slice.gross)}
      </li>)}</ul>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void download(vacation, 'notice')}>Baixar aviso</Button>
        {vacation.value.payment ? <Button size="sm" variant="secondary" onClick={() => void download(vacation, 'receipt')}>Baixar recibo</Button>
          : canWrite && <Button size="sm" variant="ghost" onClick={() => setPaymentForm({ id: vacation.id, paidOn: vacation.value.paymentDueOn,
            paidAmount: '', inss: '', irrf: '', otherDeductions: '0', evidenceReference: '' })}>Registrar pagamento conferido</Button>}
      </div>
      {vacation.value.payment && <p className="text-sm">Pago em {displayDate(vacation.value.payment.paidOn)} · {brl(vacation.value.payment.paidAmount)}</p>}
      {paymentForm?.id === vacation.id && <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" onSubmit={savePayment}>
        {paymentFields.map(([field, label, type]) => <Input key={field} label={label} type={type} required value={paymentForm[field]}
          onChange={event => setPaymentForm({ ...paymentForm, [field]: event.target.value })} />)}
        <Button type="submit" disabled={pending}>Confirmar pagamento</Button>
        <Button type="button" variant="ghost" onClick={() => setPaymentForm(null)}>Cancelar</Button>
      </form>}
    </details>)}
  </section>
}
