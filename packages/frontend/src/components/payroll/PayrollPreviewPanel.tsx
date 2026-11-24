import { useEffect, useState, type FormEvent } from 'react'
import { api, ApiError, downloadPayrollFile } from '@/api/client'
import { Button, Input, Table } from '@/design-system'

type Employee = { id: string; status: string; person: { fullName: string } }
type Statement = {
  engagementId: string; fullName: string; kind: string; dueOn: string;
  totals: { gross: string; deductions: string; net: string; employerCharges: string; bases: { inss: string; irrf: string; fgts: string } };
  items: { code: string; label: string; direction: string; source: string; amount: string; basis: string; quantity?: string }[];
  payments?: { kind: string; dueOn: string; amount: string }[];
  issues: string[];
}
type Preview = { statements: Statement[]; issues: string[]; vacations: { id: string; fullName: string; days: number; gross: string }[] }
type Version = { id: string; revision: number; sourceDigest: string; approvedAt: string | null; correctionReason: string | null; snapshot?: Preview }
type Payment = { id: string; engagementId: string; reference: string; dueOn: string; amount: string; kind: string;
  paidOn: string | null; paidAmount: string | null; evidenceReference: string | null }
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const paymentLabels: Record<string, string> = { regular: 'Pagamento', advance: 'Adiantamento', balance: 'Saldo',
  first_half: 'Primeira quinzena', second_half: 'Segunda quinzena' }
function brl(value: string) { return currency.format(Number(value)) }

export function PayrollPreviewPanel({ companyId, canWrite, canApprove }: { companyId: string; canWrite: boolean; canApprove: boolean }) {
  const [month, setMonth] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [error, setError] = useState('')
  const [news, setNews] = useState('')
  const [pending, setPending] = useState(false)
  const [input, setInput] = useState({ engagementId: '', kind: 'overtime', date: '', hours: '', premium: '' })
  const [version, setVersion] = useState<Version | null>(null)
  const [versions, setVersions] = useState<Version[]>([])
  const [correctionReason, setCorrectionReason] = useState('')
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentForm, setPaymentForm] = useState<{ id: string; paidOn: string; paidAmount: string; evidenceReference: string } | null>(null)
  const versionPath = '/periods/' + encodeURIComponent(month) + '/versions'

  useEffect(() => {
    let active = true
    if (canWrite) api.payroll<Employee[]>(companyId, '/people/employee').then(list => {
      if (active) setEmployees(list.filter(record => record.status !== 'draft'))
    }, () => { if (active) setError('Não foi possível carregar os funcionários para lançamento.') })
    return () => { active = false }
  }, [companyId, canWrite])

  async function run(event: FormEvent) {
    event.preventDefault(); setError(''); setNews(''); setPending(true); setPreview(null)
    setVersion(null)
    setPayments([]); setPaymentForm(null)
    try {
      const [calculation, history] = await Promise.all([
        api.payroll<Preview>(companyId, '/periods/' + encodeURIComponent(month) + '/preview'),
        api.payroll<Version[]>(companyId, versionPath),
      ])
      setPreview(calculation); setVersions(history)
    }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : 'Não foi possível calcular a prévia.') }
    finally { setPending(false) }
  }

  async function add(event: FormEvent) {
    event.preventDefault(); setError(''); setNews(''); setPending(true)
    try {
      const sourceMonth = input.date.slice(0, 7)
      await api.payroll(companyId, '/periods/' + encodeURIComponent(sourceMonth) + '/inputs', 'POST', input)
      setNews('Lançamento registrado.'); setMonth(sourceMonth); setPreview(null); setVersion(null); setVersions([])
      setPayments([]); setPaymentForm(null)
      setInput({ ...input, hours: '', premium: '' })
    } catch (failure) { setError(failure instanceof ApiError ? failure.message : 'Não foi possível salvar o lançamento.') }
    finally { setPending(false) }
  }

  async function changeVersion(action: 'save' | 'approve' | 'open', current?: Version) {
    setError(''); setNews(''); setPending(true)
    try {
      const path = current ? versionPath + '/' + encodeURIComponent(current.id) : versionPath
      const next = action === 'save' ? await api.payroll<Version>(companyId, path, 'POST', { correctionReason })
        : action === 'approve' ? await api.payroll<Version>(companyId, path + '/approve', 'POST', { sourceDigest: current?.sourceDigest })
        : await api.payroll<Version>(companyId, path)
      setVersion(next); setPreview(next.snapshot ?? null)
      setPaymentForm(null)
      setPayments(next.approvedAt ? await api.payroll<Payment[]>(companyId, versionPath + '/' + next.id + '/payments') : [])
      if (action !== 'open') {
        setVersions(await api.payroll<Version[]>(companyId, versionPath))
        setNews(action === 'approve' ? 'Versão aprovada.' : 'Versão salva para revisão.')
        if (action === 'save') setCorrectionReason('')
      }
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível atualizar a versão.')
    } finally { setPending(false) }
  }

  async function download(relative: string, filename: string) {
    if (!version) return
    setError('')
    try { await downloadPayrollFile(companyId, versionPath + '/' + version.id + relative, filename) }
    catch (failure) { setError(failure instanceof ApiError ? failure.message : 'Não foi possível baixar o documento.') }
  }

  async function confirmPayment(event: FormEvent) {
    event.preventDefault()
    if (!version || !paymentForm) return
    setPending(true); setError(''); setNews('')
    try {
      const confirmed = await api.payroll<Payment>(companyId, versionPath + '/' + version.id + '/payments/' + paymentForm.id, 'PUT', paymentForm)
      setPayments(rows => rows.map(row => row.id === confirmed.id ? confirmed : row)); setPaymentForm(null); setNews('Pagamento registrado.')
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível confirmar o pagamento.')
    } finally { setPending(false) }
  }

  return <section className="space-y-5">
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {news && <p role="status" className="text-sm text-graphite-700">{news}</p>}
    {canWrite && employees.length > 0 && <form className="space-y-3" onSubmit={add}>
      <h3 className="text-base font-semibold">Lançamento da competência</h3>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-medium text-graphite-600">Funcionário<select className="input-field mt-1.5" required value={input.engagementId}
          onChange={event => setInput({ ...input, engagementId: event.target.value })}>
          <option value="">Selecione</option>{employees.map(row => <option key={row.id} value={row.id}>{row.person.fullName}</option>)}
        </select></label>
        <label className="text-xs font-medium text-graphite-600">Tipo<select className="input-field mt-1.5" value={input.kind}
          onChange={event => setInput({ ...input, kind: event.target.value })}>
          <option value="regular_hours">Horas regulares de horista</option><option value="overtime">Horas extras</option><option value="unpaid_absence">Falta ou atraso com desconto</option>
          <option value="paid_leave">Ausência justificada ou afastamento remunerado</option>
        </select></label>
        <Input label="Data" type="date" value={input.date} required onChange={event => setInput({ ...input, date: event.target.value })} />
        <Input label="Horas" inputMode="decimal" value={input.hours} required onChange={event => setInput({ ...input, hours: event.target.value })} />
        {input.kind === 'overtime' && <Input label="Adicional (%)" inputMode="decimal" value={input.premium} required onChange={event => setInput({ ...input, premium: event.target.value })} />}
        <Button type="submit" variant="secondary" disabled={pending}>Registrar lançamento</Button>
      </div>
    </form>}
    <form className="flex flex-wrap items-end gap-3" onSubmit={run}>
      <div className="w-full sm:w-48"><Input label="Competência da prévia" type="month" value={month} required
        onChange={event => { setMonth(event.target.value); setPreview(null); setVersion(null); setVersions([]); setCorrectionReason(''); setPayments([]); setPaymentForm(null) }} /></div>
      <Button type="submit" disabled={pending}>Calcular prévia</Button>
    </form>
    {versions.length > 0 && <section className="flex flex-wrap gap-2" aria-label="Versões da folha">
      {versions.map(row => <Button key={row.id} size="sm" variant="secondary" disabled={pending}
        onClick={() => void changeVersion('open', row)}>Versão {row.revision} · {row.approvedAt ? 'Aprovada' : 'Rascunho'}</Button>)}
    </section>}
    {preview && <div className="space-y-3">
      {version && <p className="text-sm font-medium">Versão {version.revision} · {version.approvedAt ? 'Aprovada' : 'Rascunho'}
        {version.correctionReason && ' · ' + version.correctionReason}</p>}
      <div className="flex flex-wrap items-end gap-2">
        {canWrite && versions[0]?.approvedAt && <div className="w-full sm:max-w-lg">
          <Input label="Motivo da correção" value={correctionReason} onChange={event => setCorrectionReason(event.target.value)} />
        </div>}
        {canWrite && <Button size="sm" disabled={pending || Boolean(versions[0]?.approvedAt && !correctionReason.trim())}
          variant="secondary" onClick={() => void changeVersion('save')}>{versions[0]?.approvedAt ? 'Criar versão de correção' : 'Salvar cálculo para revisão'}</Button>}
        {canApprove && version && !version.approvedAt && <Button size="sm"
          disabled={pending || !preview.statements.length || !!preview.issues.length || preview.statements.some(row => row.issues.length > 0)}
          onClick={() => void changeVersion('approve', version)}>Aprovar versão</Button>}
        {version && preview.statements.some(row => row.kind === 'employee') && <Button size="sm" variant="secondary"
          onClick={() => void download('/documents/salary', 'folha-salarios-' + month + '.html')}>Baixar folha de salários</Button>}
        {version && preview.statements.some(row => row.kind === 'partner') && <Button size="sm" variant="secondary"
          onClick={() => void download('/documents/partner', 'folha-pro-labore-' + month + '.html')}>Baixar folha de pró-labore</Button>}
      </div>
      {preview.issues.map(issue => <p key={issue} role="alert" className="text-sm text-danger-600">{issue}</p>)}
      {preview.vacations.length > 0 && <div>
        <h3 className="text-sm font-semibold">Férias previstas na competência</h3>
        <ul className="text-sm text-graphite-700">{preview.vacations.map(row => <li key={row.id}>
          {row.fullName} · {row.days} dias · bruto previsto {brl(row.gross)}
        </li>)}</ul>
      </div>}
      {preview.statements.length === 0 && <p className="text-sm text-graphite-600">Nenhum demonstrativo disponível para esta competência.</p>}
      {preview.statements.map(row => <details key={row.engagementId} className="space-y-3 rounded-lg border border-graphite-200 p-3">
        <summary className="cursor-pointer text-sm font-medium">{row.fullName} · {row.kind === 'partner' ? 'Pró-labore' : 'Salário'} · Líquido previsto {brl(row.totals.net)}</summary>
        {row.issues.map(issue => <p key={issue} role="alert" className="text-sm text-danger-600">{issue}</p>)}
        <p className="text-sm">Bruto {brl(row.totals.gross)} · Descontos {brl(row.totals.deductions)} · Encargos {brl(row.totals.employerCharges)}</p>
        <p className="text-sm">Bases de INSS {brl(row.totals.bases.inss)}, IRRF {brl(row.totals.bases.irrf)} e FGTS {brl(row.totals.bases.fgts)}</p>
        {!!row.payments?.length && <ul className="space-y-1 text-sm">{row.payments.map(payment => <li key={payment.kind}>
          {paymentLabels[payment.kind]} · {payment.dueOn.split('-').reverse().join('/')} · {brl(payment.amount)}
        </li>)}</ul>}
        {version && <Button size="sm" variant="secondary" onClick={() => void download('/documents/statement?engagementId='
          + encodeURIComponent(row.engagementId), 'demonstrativo-' + month + '.html')}>Baixar demonstrativo</Button>}
        <Table><Table.Head><Table.Row><Table.Cell>Rubrica</Table.Cell><Table.Cell>Horas</Table.Cell><Table.Cell>Base</Table.Cell><Table.Cell align="right">Valor</Table.Cell></Table.Row></Table.Head>
          <tbody>{row.items.map((item, index) => <Table.Row key={item.code + item.source + index}><Table.Cell>{item.label}</Table.Cell>
            <Table.Cell>{item.quantity ? Number(item.quantity).toLocaleString('pt-BR') : '—'}</Table.Cell>
            <Table.Cell>{brl(item.basis)}</Table.Cell><Table.Cell align="right">{brl(item.amount)}</Table.Cell></Table.Row>)}</tbody>
        </Table>
      </details>)}
      {payments.length > 0 && <section className="space-y-2">
        <h3 className="text-sm font-semibold">Pagamentos da versão</h3>
        {payments.map(row => <div key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span>{preview.statements.find(statement => statement.engagementId === row.engagementId)?.fullName} · {paymentLabels[row.kind]} · {brl(row.amount)} · {row.paidOn
            ? 'Pago em ' + row.paidOn.split('-').reverse().join('/') : 'Previsto para ' + row.dueOn.split('-').reverse().join('/')}</span>
          {row.paidOn ? <Button size="sm" variant="ghost" onClick={() => void download('/payments/' + row.id + '/receipt', 'recibo-' + month + '.html')}>Baixar recibo</Button>
            : canWrite && <Button size="sm" variant="secondary" onClick={() => setPaymentForm({ id: row.id, paidAmount: row.amount,
              paidOn: row.dueOn, evidenceReference: '' })}>Registrar pagamento</Button>}
        </div>)}
        {paymentForm && <form className="grid items-end gap-2 sm:grid-cols-3" onSubmit={confirmPayment}>
          <Input label="Data do pagamento" type="date" required value={paymentForm.paidOn} onChange={event => setPaymentForm({ ...paymentForm, paidOn: event.target.value })} />
          <Input label="Valor pago" required value={paymentForm.paidAmount} onChange={event => setPaymentForm({ ...paymentForm, paidAmount: event.target.value })} />
          <Input label="Referência do comprovante" required value={paymentForm.evidenceReference} onChange={event => setPaymentForm({ ...paymentForm, evidenceReference: event.target.value })} />
          <Button type="submit" disabled={pending}>Confirmar</Button><Button type="button" variant="ghost" onClick={() => setPaymentForm(null)}>Cancelar</Button>
        </form>}
      </section>}
    </div>}
  </section>
}
