import { type FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { Button, Input, Table } from '@/design-system'

const modes = { monthly: 'Mensal', monthly_advance: 'Mensal com adiantamento', semimonthly: 'Quinzenal' }
type Mode = keyof typeof modes
type DateRule = { monthOffset: number; kind: 'fixed' | 'business' | 'last_business'; day: number; weekdaysOnly: boolean }
type LocalCalendar = { establishment: string; dates: string }
type Calculation = { monthlyProration: string; employeeEmployerRate: string; partnerEmployerRate: string; partnerWithholdingRate: string; reference: string }
type Policy = { id: string; mode: Mode; startsOn: string; endsOn: string | null; agreementReference: string | null; rules: {
  salary: DateRule; partner: DateRule; advance: { date: DateRule; amount: string; unit: string };
  semimonthly: { cutoff: number; first: DateRule; second: DateRule }; calendars: { establishment: string; holidays: string[] }[];
  calculation?: Calculation;
} }
type Schedule = { deadline: string | null; issues: Record<string, string>; dates: { kind: string; startsOn: string; endsOn: string; dueOn: string | null }[] }
const eventNames: Record<string, string> = {
  salary: 'Salário ou saldo mensal', advance: 'Adiantamento', first_half: 'Primeira quinzena', second_half: 'Segunda quinzena', partner: 'Pró-labore',
}
const calculationFields = [
  ['employeeEmployerRate', 'Alíquota patronal sobre salários (%)'],
  ['partnerEmployerRate', 'Alíquota patronal sobre pró-labore (%)'],
  ['partnerWithholdingRate', 'Retenção previdenciária do pró-labore (%)'],
  ['reference', 'Referência dos parâmetros'],
] as const
const emptyCalculation: Calculation = { monthlyProration: '', employeeEmployerRate: '', partnerEmployerRate: '', partnerWithholdingRate: '', reference: '' }

function formatDay(date: string | null) { return date ? date.split('-').reverse().join('/') : 'Pendente' }

function DateFields({ label, value, onChange }: { label: string; value: DateRule; onChange: (next: DateRule) => void }) {
  const selectClass = 'input-field mt-1.5'
  return <fieldset className="space-y-2 rounded-lg border border-graphite-200 p-3">
    <legend className="px-1 text-sm font-medium">{label}</legend>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-xs font-medium text-graphite-600">Mês<select className={selectClass} value={value.monthOffset}
        onChange={event => onChange({ ...value, monthOffset: Number(event.target.value) })}>
        <option value="0">Mês da folha</option><option value="1">Mês seguinte</option>
      </select></label>
      <label className="text-xs font-medium text-graphite-600">Tipo de data<select className={selectClass} value={value.kind}
        onChange={event => onChange({ ...value, kind: event.target.value as DateRule['kind'] })}>
        <option value="fixed">Dia fixo</option><option value="business">Dia útil por ordem</option><option value="last_business">Último dia útil</option>
      </select></label>
      {value.kind !== 'last_business' && <Input label={value.kind === 'fixed' ? 'Dia do mês' : 'Ordem do dia útil'} type="number" min="1" max={value.kind === 'fixed' ? 31 : 26}
        value={value.day || ''} required onChange={event => onChange({ ...value, day: Number(event.target.value) })} />}
    </div>
    {value.kind !== 'fixed' && <label className="flex items-center gap-2 text-sm text-graphite-700">
      <input type="checkbox" checked={value.weekdaysOnly} onChange={event => onChange({ ...value, weekdaysOnly: event.target.checked })} />Usar somente segunda a sexta-feira
    </label>}
  </fieldset>
}

export function PayrollPolicyPanel({ companyId, canWrite }: { companyId: string; canWrite: boolean }) {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [editing, setEditing] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [starts, setStarts] = useState('')
  const [mode, setMode] = useState<Mode>('monthly')
  const [agreementReference, setAgreementReference] = useState('')
  const [salary, setSalary] = useState<DateRule>({ monthOffset: 1, kind: 'business', day: 5, weekdaysOnly: false })
  const [partner, setPartner] = useState<DateRule>({ monthOffset: 0, kind: 'last_business', day: 1, weekdaysOnly: true })
  const [advanceDate, setAdvanceDate] = useState<DateRule>({ monthOffset: 0, kind: 'fixed', day: 15, weekdaysOnly: false })
  const [advanceUnit, setAdvanceUnit] = useState('percentage')
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [cutoff, setCutoff] = useState(15)
  const [first, setFirst] = useState<DateRule>({ monthOffset: 0, kind: 'fixed', day: 15, weekdaysOnly: false })
  const [second, setSecond] = useState<DateRule>({ monthOffset: 1, kind: 'business', day: 5, weekdaysOnly: false })
  const [calendars, setCalendars] = useState<LocalCalendar[]>([{ establishment: '', dates: '' }])
  const [calculation, setCalculation] = useState(emptyCalculation)
  const [month, setMonth] = useState('')
  const [establishment, setEstablishment] = useState('')
  const [schedule, setSchedule] = useState<Schedule | null>(null)

  useEffect(() => {
    let active = true
    api.payroll<Policy[]>(companyId, '/policies').then(data => { if (active) setPolicies(data) }, () => {
      if (active) setError('Não foi possível carregar a política de pagamento.')
    })
    return () => { active = false }
  }, [companyId])

  async function save(event: FormEvent) {
    event.preventDefault()
    setPending(true); setError(''); setFields({}); setMessage('')
    try {
      await api.payroll<Policy>(companyId, editingId ? '/policies/' + encodeURIComponent(editingId) : '/policies', editingId ? 'PUT' : 'POST', {
        startsOn: starts + '-01', mode, agreementReference,
        rules: { salary, partner, advance: { date: advanceDate, amount: advanceAmount, unit: advanceUnit },
          semimonthly: { cutoff, first, second }, calendars: calendars.map(calendar => ({
            establishment: calendar.establishment, holidays: calendar.dates.split(/[\s,;]+/).filter(Boolean),
          })), ...(Object.values(calculation).some(Boolean) ? { calculation } : {}) },
      })
      setPolicies(await api.payroll<Policy[]>(companyId, '/policies'))
      setEditing(false); setEditingId(null); setMonth(starts); setSchedule(null); setMessage('Política de pagamento registrada.')
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível salvar a política.')
      setFields(failure instanceof ApiError ? failure.fields : {})
    } finally { setPending(false) }
  }

  function editPolicy(policy: Policy) {
    const { rules } = policy
    setError(''); setMessage(''); setFields({}); setEditingId(policy.id); setEditing(true)
    setMode(policy.mode); setStarts(policy.startsOn.slice(0, 7)); setAgreementReference(policy.agreementReference ?? '')
    setSalary(rules.salary); setPartner(rules.partner); setAdvanceDate(rules.advance.date)
    setAdvanceAmount(rules.advance.amount); setAdvanceUnit(rules.advance.unit); setCutoff(rules.semimonthly.cutoff)
    setFirst(rules.semimonthly.first); setSecond(rules.semimonthly.second); setCalculation(rules.calculation ?? emptyCalculation)
    setCalendars([{ establishment: '', dates: rules.calendars.find(row => !row.establishment)?.holidays.join(', ') ?? '' },
      ...rules.calendars.filter(row => row.establishment).map(row => ({ establishment: row.establishment, dates: row.holidays.join(', ') }))])
  }

  async function loadSchedule(event: FormEvent) {
    event.preventDefault()
    setPending(true); setError(''); setFields({}); setMessage(''); setSchedule(null)
    try {
      const lookup = '/policies/calendar/' + encodeURIComponent(month) + (establishment ? '?establishment=' + encodeURIComponent(establishment) : '')
      setSchedule(await api.payroll<Schedule>(companyId, lookup))
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível calcular os vencimentos.')
    } finally { setPending(false) }
  }

  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-semibold">Política de pagamento</h3>
      {canWrite && <Button size="sm" variant="secondary" disabled={pending} onClick={() => { setEditingId(null); setEditing(!editing) }}>{editing ? 'Recolher formulário' : 'Nova vigência'}</Button>}
    </div>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {message && <p role="status" className="text-sm text-graphite-700">{message}</p>}
    {editing && <form className="space-y-4" onSubmit={save}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input label="Início da vigência" type="month" required value={starts} disabled={Boolean(editingId)} onChange={event => setStarts(event.target.value)} error={fields.startsOn} />
        <label className="text-xs font-medium text-graphite-600">Modalidade salarial<select className="input-field mt-1.5" value={mode} onChange={event => setMode(event.target.value as Mode)}>
          {Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <Input label="Referência da convenção, acordo ou contrato" value={agreementReference} required={mode === 'semimonthly'}
          onChange={event => setAgreementReference(event.target.value)} error={fields.agreementReference} />
      </div>
      {mode === 'semimonthly' ? <>
        <Input label="Último dia da primeira quinzena" type="number" min="1" max="27" value={cutoff || ''} required error={fields.cutoff}
          onChange={event => setCutoff(Number(event.target.value))} />
        <DateFields label="Vencimento da primeira quinzena" value={first} onChange={setFirst} />
        <DateFields label="Vencimento da segunda quinzena" value={second} onChange={setSecond} />
      </> : <DateFields label={mode === 'monthly_advance' ? 'Vencimento do saldo' : 'Vencimento do salário'} value={salary} onChange={setSalary} />}
      {mode === 'monthly_advance' && <>
        <DateFields label="Data do adiantamento" value={advanceDate} onChange={setAdvanceDate} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-graphite-600">Cálculo do adiantamento<select className="input-field mt-1.5" value={advanceUnit} onChange={event => setAdvanceUnit(event.target.value)}>
            <option value="percentage">Percentual sobre salário-base</option><option value="fixed">Valor fixo</option>
          </select></label>
          <Input label={advanceUnit === 'percentage' ? 'Percentual' : 'Valor (R$)'} inputMode="decimal" required value={advanceAmount}
            onChange={event => setAdvanceAmount(event.target.value)} error={fields.advance} />
        </div>
      </>}
      <DateFields label="Vencimento do pró-labore" value={partner} onChange={setPartner} />
      <fieldset className="space-y-3 rounded-lg border border-graphite-200 p-3">
        <legend className="px-1 text-sm font-medium">Parâmetros da prévia de cálculo</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs font-medium text-graphite-600">Proporcionalidade do salário mensal<select className="input-field mt-1.5" value={calculation.monthlyProration}
            onChange={event => setCalculation({ ...calculation, monthlyProration: event.target.value })}>
            <option value="">Selecione</option><option value="calendar_days">Dias civis do mês</option><option value="thirty_days">Divisor de 30 dias</option>
          </select></label>
          {calculationFields.map(([name, label]) => <Input key={name} label={label} value={calculation[name]}
            inputMode={name === 'reference' ? 'text' : 'decimal'} onChange={event => setCalculation({ ...calculation, [name]: event.target.value })} />)}
        </div>
        {fields.calculation && <p className="text-sm text-danger-600" role="alert">{fields.calculation}</p>}
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-graphite-200 p-3">
        <legend className="px-1 text-sm font-medium">Feriados aplicáveis</legend>
        {calendars.map((calendar, index) => <div key={index} className="grid items-end gap-3 sm:grid-cols-3">
          {index > 0 && <Input label="Inscrição do estabelecimento" required value={calendar.establishment} onChange={event => setCalendars(previous =>
            previous.map((row, i) => i === index ? { ...row, establishment: event.target.value } : row))} />}
          <div className={index === 0 ? 'sm:col-span-2' : ''}><Input label={index === 0 ? 'Feriados comuns aos estabelecimentos' : 'Feriados locais'}
            hint="Separe as datas AAAA-MM-DD por espaço ou vírgula." value={calendar.dates} onChange={event => setCalendars(previous =>
              previous.map((row, i) => i === index ? { ...row, dates: event.target.value } : row))} /></div>
          {index > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setCalendars(previous => previous.filter((_row, i) => i !== index))}>Remover calendário</Button>}
        </div>)}
        {fields.calendars && <p role="alert" className="text-sm text-danger-600">{fields.calendars}</p>}
        <Button size="sm" type="button" variant="secondary" onClick={() => setCalendars(previous => [...previous, { establishment: '', dates: '' }])}>Incluir calendário de estabelecimento</Button>
      </fieldset>
      {['salary', 'partner', 'advanceDate', 'first', 'second'].some(key => fields[key]) && <ul className="space-y-1 text-sm text-danger-600">
        {['salary', 'partner', 'advanceDate', 'first', 'second'].filter(key => fields[key]).map(key => <li key={key}>{fields[key]}</li>)}
      </ul>}
      <Button type="submit" disabled={pending}>Salvar vigência</Button>
    </form>}
    {policies.length ? <Table><Table.Head><Table.Row><Table.Cell>Modalidade</Table.Cell><Table.Cell>Início</Table.Cell><Table.Cell>Fim</Table.Cell><Table.Cell>Referência</Table.Cell>
      {canWrite && <Table.Cell>Ações</Table.Cell>}</Table.Row></Table.Head>
      <tbody>{policies.map(policy => <Table.Row key={policy.id}><Table.Cell>{modes[policy.mode]}</Table.Cell><Table.Cell>{formatDay(policy.startsOn)}</Table.Cell>
        <Table.Cell>{policy.endsOn ? formatDay(policy.endsOn) : 'Em aberto'}</Table.Cell><Table.Cell>{policy.agreementReference ?? '—'}</Table.Cell>
        {canWrite && <Table.Cell><Button size="sm" variant="ghost" disabled={pending} onClick={() => editPolicy(policy)}>Editar vigência</Button></Table.Cell>}</Table.Row>)}</tbody>
    </Table> : <p className="text-sm text-graphite-600">A empresa ainda não tem política de pagamento.</p>}
    {policies.length > 0 && <div className="space-y-3 border-t border-graphite-200 pt-4">
      <h3 className="text-base font-semibold">Vencimentos da competência</h3>
      <form className="grid items-end gap-3 sm:grid-cols-3" onSubmit={loadSchedule}>
        <Input label="Competência" type="month" required value={month} onChange={event => { setMonth(event.target.value); setSchedule(null) }} />
        <Input label="Inscrição do estabelecimento, se aplicável" value={establishment} onChange={event => { setEstablishment(event.target.value); setSchedule(null) }} />
        <Button variant="secondary" type="submit" disabled={pending}>Consultar vencimentos</Button>
      </form>
      {schedule && <>
        {Object.entries(schedule.issues).map(([key, value]) => <p key={key} role="alert" className="text-sm text-danger-600">{value}</p>)}
        <ul className="space-y-1 text-sm text-graphite-700">{schedule.dates.map(row => <li key={row.kind}>{eventNames[row.kind]} · {formatDay(row.dueOn)}</li>)}</ul>
      </>}
    </div>}
  </section>
}
