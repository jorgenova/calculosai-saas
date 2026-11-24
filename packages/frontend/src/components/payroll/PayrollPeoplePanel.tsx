import { type FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { Badge, Button, Input, Table } from '@/design-system'
import { PayrollConditionsPanel } from './PayrollConditionsPanel'

export type EngagementKind = 'employee' | 'partner'
type Details = Record<string, string>
type Person = { cpf: string; fullName: string; birthDate: string | null; details: Details }
type Compensation = { id: string; amount: string; unit: string; startsOn: string; endsOn: string | null }
type Engagement = {
  id: string
  kind: EngagementKind
  person: Person
  registration: string | null
  startsOn: string | null
  endsOn: string | null
  categoryCode: string | null
  establishmentRegistration: string | null
  taxAllocationCode: string | null
  details: Details
  status: 'draft' | 'active' | 'ended'
  compensation: Compensation[]
  issues?: Details
}

type Field = { name: string; label: string; type?: string; options?: ReadonlyArray<readonly [string, string]> }

const personalFields: Field[] = [
  { name: 'sex', label: 'Sexo', options: [['M', 'Masculino'], ['F', 'Feminino']] },
  { name: 'raceColor', label: 'Raça ou cor autodeclarada', options: [['1', 'Branca'], ['2', 'Preta'], ['3', 'Parda'], ['4', 'Amarela'], ['5', 'Indígena'], ['6', 'Não informada']] },
  { name: 'education', label: 'Escolaridade', options: [
    ['01', 'Analfabeto'], ['02', 'Até o 5º ano incompleto'], ['03', '5º ano completo'], ['04', 'Do 6º ao 9º ano incompleto'],
    ['05', 'Ensino fundamental completo'], ['06', 'Ensino médio incompleto'], ['07', 'Ensino médio completo'],
    ['08', 'Ensino superior incompleto'], ['09', 'Ensino superior completo'], ['10', 'Pós-graduação'], ['11', 'Mestrado'], ['12', 'Doutorado'],
  ] },
  { name: 'birthCountry', label: 'Código do país de nascimento' }, { name: 'nationality', label: 'Código do país da nacionalidade' },
  { name: 'socialName', label: 'Nome social' }, { name: 'maritalStatus', label: 'Estado civil', options: [['1', 'Solteiro'], ['2', 'Casado'], ['3', 'Divorciado'], ['4', 'Separado'], ['5', 'Viúvo']] },
  { name: 'email', label: 'E-mail', type: 'email' }, { name: 'phone', label: 'Telefone', type: 'tel' },
  { name: 'postalCode', label: 'CEP' }, { name: 'streetType', label: 'Tipo de logradouro' },
  { name: 'street', label: 'Logradouro' }, { name: 'streetNumber', label: 'Número' },
  { name: 'addressComplement', label: 'Complemento' }, { name: 'neighborhood', label: 'Bairro' },
  { name: 'municipalityCode', label: 'Código do município (IBGE)' }, { name: 'state', label: 'UF' },
]

const employeeFields: Field[] = [
  { name: 'admissionType', label: 'Tipo de admissão', options: [['1', 'Admissão'], ['2', 'Transferência no grupo econômico'], ['3', 'Transferência de consórcio ou consorciada'], ['4', 'Sucessão, incorporação, cisão ou fusão'], ['5', 'Transferência entre representantes de unidade familiar'], ['6', 'Mudança de CPF'], ['7', 'Transferência de empresa sucedida considerada inapta']] },
  { name: 'admissionIndicator', label: 'Indicativo de admissão', options: [['1', 'Normal'], ['2', 'Decorrente de ação fiscal'], ['3', 'Decorrente de decisão judicial']] },
  { name: 'workRegime', label: 'Regime de trabalho', options: [['1', 'CLT']] },
  { name: 'socialSecurityRegime', label: 'Regime previdenciário', options: [['1', 'RGPS']] },
  { name: 'jobTitle', label: 'Cargo' }, { name: 'occupationCode', label: 'CBO' },
  { name: 'contractType', label: 'Tipo de contrato', options: [['1', 'Prazo indeterminado'], ['2', 'Prazo determinado em dias'], ['3', 'Prazo determinado por condição']] },
  { name: 'contractEndDate', label: 'Término previsto do contrato', type: 'date' },
  { name: 'contractEndCondition', label: 'Condição para término' },
  { name: 'terminationClause', label: 'Cláusula de rescisão antecipada', options: [['S', 'Sim'], ['N', 'Não']] },
  { name: 'unionRegistration', label: 'CNPJ do sindicato' }, { name: 'collectiveBargainingMonth', label: 'Mês da data-base (1 a 12)' },
  { name: 'activityNature', label: 'Natureza da atividade', options: [['1', 'Urbana'], ['2', 'Rural']] },
  { name: 'workTimeRegime', label: 'Regime de jornada', options: [['1', 'Sujeito a horário de trabalho'], ['2', 'Atividade externa'], ['3', 'Cargo de gestão'], ['4', 'Teletrabalho por produção ou tarefa']] },
  { name: 'journeyType', label: 'Tipo de jornada', options: [['2', '12 × 36'], ['3', 'Horário fixo e folga variável'], ['4', 'Horário fixo e folga fixa no domingo'], ['5', 'Horário fixo e folga fixa em outro dia'], ['6', 'Horário fixo com folga adicional periódica no domingo'], ['7', 'Turno ininterrupto de revezamento'], ['9', 'Outra jornada']] },
  { name: 'weeklyHours', label: 'Horas semanais' }, { name: 'schedule', label: 'Dias, horários e intervalos' },
  { name: 'monthlyHoursDivisor', label: 'Divisor mensal para horas e faltas' },
  { name: 'partTimeType', label: 'Tempo parcial', options: [['0', 'Não se aplica'], ['1', 'Até 25 horas semanais'], ['2', 'Até 30 horas semanais'], ['3', 'Até 26 horas semanais']] },
  { name: 'nightWork', label: 'Jornada com horário noturno', options: [['S', 'Sim'], ['N', 'Não']] },
  { name: 'variableSalaryDescription', label: 'Descrição da remuneração variável ou por tarefa' },
]

const partnerFields: Field[] = [
  { name: 'role', label: 'Papel na empresa' }, { name: 'paymentRule', label: 'Data ou regra de pagamento do pró-labore' },
  { name: 'registerWithEsocial', label: 'Enviar cadastro facultativo S-2300', options: [['no', 'Não'], ['yes', 'Sim']] },
]

const units = [['month', 'Mensal'], ['hour', 'Por hora'], ['day', 'Diária'], ['week', 'Semanal'],
  ['fortnight', 'Quinzenal'], ['task', 'Por tarefa'], ['variable', 'Variável']] as const
const statusLabel = { draft: 'Rascunho', active: 'Validado', ended: 'Encerrado' }
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function newEngagement(kind: EngagementKind): Engagement {
  return {
    id: '', kind, person: { cpf: '', fullName: '', birthDate: null, details: {} },
    registration: null, startsOn: null, endsOn: null, categoryCode: kind === 'employee' ? '101' : '723',
    establishmentRegistration: null, taxAllocationCode: null, status: 'draft', compensation: [],
    details: kind === 'employee' ? { workRegime: '1', socialSecurityRegime: '1' } : { registerWithEsocial: 'no' },
  }
}

function DetailFields({ definitions, values, errors, onChange, disabled }: {
  definitions: Field[]; values: Details; errors: Details; onChange: (name: string, value: string) => void; disabled: boolean
}) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {definitions.map(({ name, label, type, options }) => options ? (
      <label key={name} className="block text-xs font-medium text-graphite-600">
        {label}
        <select className="input-field mt-1.5" value={values[name] ?? ''} aria-invalid={Boolean(errors[name])}
          disabled={disabled} onChange={event => onChange(name, event.target.value)}>
          <option value="">Selecione</option>
          {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {errors[name] && <span className="mt-1 block text-danger-600">{errors[name]}</span>}
      </label>
    ) : <Input key={name} label={label} type={type} disabled={disabled} error={errors[name]} value={values[name] ?? ''}
      onChange={event => onChange(name, event.target.value)} />)}
  </div>
}

function relevantEmployeeFields(details: Details) {
  return employeeFields.filter(field => {
    if (field.name === 'contractEndDate') return details.contractType === '2'
    if (field.name === 'contractEndCondition') return details.contractType === '3'
    if (field.name === 'terminationClause') return ['2', '3'].includes(details.contractType)
    if (['journeyType', 'weeklyHours', 'schedule', 'partTimeType', 'nightWork'].includes(field.name)) return details.workTimeRegime === '1'
    return true
  })
}

function PayrollRegistration({ companyId, kind, engagementId, canTransmit }: {
  companyId: string; kind: EngagementKind; engagementId: string; canTransmit: boolean
}) {
  type RegistrationEvent = { id: string; status: string; receipt: string | null; protocol: string | null }
  const [environment, setEnvironment] = useState('restricted')
  const [events, setEvents] = useState<RegistrationEvent[]>([])
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const path = '/esocial/' + environment + '/registration/' + kind + '/' + encodeURIComponent(engagementId)
  const statuses: Record<string, string> = { queued: 'Na fila', sent: 'Aguardando retorno', indeterminate: 'Resultado indeterminado',
    accepted: 'Aceito pelo eSocial', rejected: 'Rejeitado pelo eSocial' }

  useEffect(() => {
    let active = true
    setEvents([])
    setError('')
    api.payroll<RegistrationEvent[]>(companyId, path + '/events').then(
      rows => { if (active) setEvents(rows) },
      () => { if (active) setError('Não foi possível consultar o evento cadastral.') },
    )
    return () => { active = false }
  }, [companyId, path])

  async function stage() {
    setPending(true)
    setError('')
    try {
      await api.payroll(companyId, path + '/queue', 'POST', {})
      setEvents(await api.payroll<RegistrationEvent[]>(companyId, path + '/events'))
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível preparar o evento.')
    } finally { setPending(false) }
  }

  return <section className="space-y-3 border-t border-graphite-200 pt-4">
    <h3 className="text-base font-semibold">Cadastro no eSocial · {kind === 'employee' ? 'S-2200' : 'S-2300'}</h3>
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-graphite-600">Ambiente<select className="input-field mt-1.5"
        value={environment} disabled={pending} onChange={event => setEnvironment(event.target.value)}>
        <option value="restricted">Produção Restrita</option><option value="production">Produção</option>
      </select></label>
      {canTransmit && <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => void stage()}>
        Preparar evento na fila
      </Button>}
    </div>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {events.length ? <ul className="space-y-1 text-sm">{events.map(event => <li key={event.id}>
      {statuses[event.status] ?? event.status}{event.receipt ? ' · Recibo ' + event.receipt
        : event.protocol ? ' · Protocolo ' + event.protocol : ''}
    </li>)}</ul> : <p className="text-sm text-graphite-600">Nenhum evento cadastral registrado neste ambiente.</p>}
  </section>
}

export function PayrollPeoplePanel({ companyId, kind, canWrite, canTransmit }: {
  companyId: string; kind: EngagementKind; canWrite: boolean; canTransmit: boolean
}) {
  const listPath = '/people/' + kind
  const [people, setPeople] = useState<Engagement[]>([])
  const [selected, setSelected] = useState<Engagement | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Details>({})
  const [compensation, setCompensation] = useState({ amount: '', unit: 'month', startsOn: '' })
  const employee = kind === 'employee'
  const label = employee ? 'funcionário' : 'sócio'
  const recordPath = selected?.id ? listPath + '/' + encodeURIComponent(selected.id) : listPath

  useEffect(() => {
    let active = true
    api.payroll<Engagement[]>(companyId, listPath).then(
      rows => { if (active) setPeople(rows) },
      () => { if (active) setError('Não foi possível carregar os cadastros.') },
    ).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [companyId, listPath])

  function setResult(record: Engagement, feedback: string, showIssues = false) {
    setSelected(record)
    setPeople(previous => [...previous.filter(row => row.id !== record.id), record]
      .sort((a, b) => a.person.fullName.localeCompare(b.person.fullName, 'pt-BR')))
    setFields(showIssues ? record.issues ?? {} : {})
    setMessage(feedback)
  }

  function resetFeedback() { setError(''); setFields({}); setMessage('') }

  async function handle(work: () => Promise<void>) {
    setPending(true)
    resetFeedback()
    try { await work() } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível concluir a operação.')
      setFields(failure instanceof ApiError ? failure.fields : {})
    } finally { setPending(false) }
  }

  function changePerson(key: keyof Omit<Person, 'details'>, value: string) {
    setSelected(record => record && ({ ...record, person: { ...record.person, [key]: value } }))
  }

  function changeDetails(key: string, value: string, person: boolean) {
    setSelected(record => {
      if (!record) return record
      if (person) return { ...record, person: { ...record.person, details: { ...record.person.details, [key]: value } } }
      const details = { ...record.details, [key]: value }
      if (key === 'contractType') {
        if (value !== '2') delete details.contractEndDate
        if (value !== '3') delete details.contractEndCondition
        if (value === '1') delete details.terminationClause
      }
      return { ...record, details }
    })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    await handle(async () => {
      const result = await api.payroll<Engagement>(companyId, recordPath, selected.id ? 'PUT' : 'POST', selected)
      setResult(result, 'Cadastro salvo.')
      setCompensation(previous => ({ ...previous, startsOn: previous.startsOn || result.startsOn || '' }))
    })
  }

  if (loading) return <p role="status" className="text-sm text-graphite-600">Carregando cadastros…</p>

  return <section className="space-y-4">
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {message && <p role="status" className="text-sm text-graphite-700">{message}</p>}
    {!selected ? <>
      {canWrite && <Button onClick={() => { resetFeedback(); setSelected(newEngagement(kind)); setCompensation({ amount: '', unit: 'month', startsOn: '' }) }}>
        {employee ? 'Novo funcionário' : 'Novo sócio'}
      </Button>}
      {people.length ? <Table><Table.Head><Table.Row><Table.Cell>Nome</Table.Cell><Table.Cell>CPF</Table.Cell><Table.Cell>Situação</Table.Cell><Table.Cell>Ações</Table.Cell></Table.Row></Table.Head>
        <tbody>{people.map(record => <Table.Row key={record.id}>
          <Table.Cell>{record.person.fullName}</Table.Cell><Table.Cell mono>{record.person.cpf}</Table.Cell>
          <Table.Cell><Badge status={record.status === 'active' ? 'success' : 'neutral'}>{statusLabel[record.status]}</Badge></Table.Cell>
          <Table.Cell><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void handle(async () => {
            const result = await api.payroll<Engagement>(companyId, listPath + '/' + encodeURIComponent(record.id))
            setSelected(result); setCompensation({ amount: '', unit: 'month', startsOn: result.startsOn || '' })
          })}>Abrir</Button></Table.Cell>
        </Table.Row>)}</tbody>
      </Table> : <p className="text-sm text-graphite-600">Nenhum {label} cadastrado.</p>}
    </> : <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => { resetFeedback(); setSelected(null) }}>Voltar à lista</Button>
        <Badge status={selected.status === 'active' ? 'success' : 'neutral'}>{statusLabel[selected.status]}</Badge>
      </div>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={!canWrite || pending} className="space-y-3">
          <legend className="text-base font-semibold">Identificação</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="CPF" inputMode="numeric" value={selected.person.cpf} error={fields['person.cpf']} readOnly={Boolean(selected.id)} required
              onChange={event => changePerson('cpf', event.target.value)} />
            <Input label="Nome completo" value={selected.person.fullName} error={fields['person.fullName']} required
              onChange={event => changePerson('fullName', event.target.value)} />
            <Input label="Nascimento" type="date" value={selected.person.birthDate ?? ''} error={fields['person.birthDate']}
              onChange={event => changePerson('birthDate', event.target.value)} />
          </div>
          {!selected.id && <Button type="button" variant="secondary" size="sm" disabled={!selected.person.cpf || pending} onClick={() => void handle(async () => {
            const { person } = await api.payroll<{ person: Person | null }>(companyId, '/people/by-cpf/' + encodeURIComponent(selected.person.cpf.replace(/\D/g, '')))
            if (person) setSelected(current => current && ({ ...current, person }))
            setMessage(person ? 'Dados do CPF preenchidos.' : 'CPF ainda não cadastrado nesta empresa.')
          })}>Buscar CPF na empresa</Button>}
          {(employee || selected.details.registerWithEsocial === 'yes') && <DetailFields definitions={personalFields} values={selected.person.details}
            errors={Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith('person.details.')).map(([key, value]) => [key.slice(15), value]))}
            onChange={(key, value) => changeDetails(key, value, true)} disabled={!canWrite || pending} />}
        </fieldset>
        <fieldset disabled={!canWrite || pending} className="space-y-3">
          <legend className="text-base font-semibold">Vínculo</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {([
              ['categoryCode', 'Categoria eSocial', 'text'], ['startsOn', employee ? 'Data de admissão' : 'Início da atuação remunerada', 'date'],
              ['endsOn', 'Fim do vínculo', 'date'], ['registration', 'Matrícula', 'text'],
              ['establishmentRegistration', 'Inscrição do estabelecimento', 'text'], ['taxAllocationCode', 'Lotação tributária', 'text'],
            ] as const).filter(([key]) => employee || !['registration', 'establishmentRegistration', 'taxAllocationCode'].includes(key)).map(([key, label, type]) => (
              <Input key={key} label={label} type={type} value={selected[key] ?? ''} error={fields[key]}
                onChange={event => setSelected({ ...selected, [key]: event.target.value })} />
            ))}
          </div>
          <DetailFields definitions={employee ? relevantEmployeeFields(selected.details) : partnerFields} values={selected.details}
            errors={Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith('details.')).map(([key, value]) => [key.slice(8), value]))}
            onChange={(key, value) => changeDetails(key, value, false)} disabled={!canWrite || pending} />
        </fieldset>
        {canWrite && <Button type="submit" disabled={pending}>{selected.status === 'draft' ? 'Salvar rascunho' : 'Salvar alterações'}</Button>}
      </form>
      {selected.id && <section className="space-y-3 border-t border-graphite-200 pt-4">
        <h3 className="text-base font-semibold">Histórico de {employee ? 'remuneração' : 'pró-labore'}</h3>
        {fields.compensation && <p role="alert" className="text-sm text-danger-600">{fields.compensation}</p>}
        {selected.compensation.length ? <ul className="space-y-1 text-sm text-graphite-700">{selected.compensation.map(item => <li key={item.id}>
          {brl.format(Number(item.amount))} · {units.find(([unit]) => unit === item.unit)?.[1]} · {item.startsOn.split('-').reverse().join('/')}
          {item.endsOn ? ' a ' + item.endsOn.split('-').reverse().join('/') : ' em diante'}
        </li>)}</ul> : <p className="text-sm text-graphite-600">Adicione a primeira vigência de remuneração.</p>}
        {canWrite && <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={event => {
          event.preventDefault()
          void handle(async () => {
            const result = await api.payroll<Engagement>(companyId, recordPath + '/compensation', 'POST', compensation)
            setResult(result, 'Vigência adicionada.')
            setCompensation(previous => ({ ...previous, amount: '' }))
          })
        }}>
          <Input label="Valor bruto (R$)" inputMode="decimal" required value={compensation.amount} error={fields.amount}
            onChange={event => setCompensation({ ...compensation, amount: event.target.value })} />
          {employee && <label className="block text-xs font-medium text-graphite-600">Unidade salarial<select className="input-field mt-1.5"
            value={compensation.unit} onChange={event => setCompensation({ ...compensation, unit: event.target.value })}>
            {units.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>}
          <Input label="Início da vigência" type="date" required value={compensation.startsOn} error={fields.startsOn}
            onChange={event => setCompensation({ ...compensation, startsOn: event.target.value })} />
          <Button type="submit" variant="secondary" disabled={pending}>Adicionar vigência</Button>
        </form>}
        {canWrite && <Button disabled={pending} onClick={() => void handle(async () => {
          const result = await api.payroll<Engagement>(companyId, recordPath + '/validate', 'POST')
          setResult(result, 'Vínculo validado.', true)
        })}>Validar vínculo salvo</Button>}
      </section>}
      {selected.id && selected.status !== 'draft' && (employee || selected.details.registerWithEsocial === 'yes') &&
        <PayrollRegistration key={selected.id} companyId={companyId} kind={kind} engagementId={selected.id} canTransmit={canTransmit} />}
      {selected.id && <PayrollConditionsPanel key={selected.id} companyId={companyId} engagementPath={recordPath} employee={employee} canWrite={canWrite} />}
    </>}
  </section>
}
