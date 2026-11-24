import { type FormEvent, useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { Button, Input } from '@/design-system'

const conditionLabels = {
  dependent: 'Dependente', transport_voucher: 'Vale-transporte', meal_voucher: 'Vale-refeição', other_source: 'Outra fonte previdenciária',
}
type ConditionKind = keyof typeof conditionLabels
type Interval = { id: string; startsOn: string; endsOn: string | null }
type Conditions = {
  dependents: (Interval & { fullName: string; incomeTax: boolean; familyAllowance: boolean })[]
  records: (Interval & { kind: Exclude<ConditionKind, 'dependent'>; value: Record<string, string> })[]
}
type Values = Record<string, string | boolean>
const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function intervalLabel(interval: Interval) {
  const date = (value: string) => value.split('-').reverse().join('/')
  return interval.endsOn ? `${date(interval.startsOn)} a ${date(interval.endsOn)}` : `desde ${date(interval.startsOn)}`
}

export function PayrollConditionsPanel({ companyId, engagementPath, employee, canWrite }: {
  companyId: string; engagementPath: string; employee: boolean; canWrite: boolean
}) {
  const path = engagementPath + '/conditions'
  const [month, setMonth] = useState('')
  const [conditions, setConditions] = useState<Conditions | null>(null)
  const [selected, setSelected] = useState<ConditionKind | ''>('')
  const [values, setValues] = useState<Values>({})
  const [error, setError] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)

  useEffect(() => {
    let active = true
    setConditions(null)
    api.payroll<Conditions>(companyId, path + (month ? '?month=' + encodeURIComponent(month) : '')).then(
      data => { if (active) setConditions(data) },
      () => { if (active) setError('Não foi possível carregar os dados complementares.') },
    )
    return () => { active = false }
  }, [companyId, path, month])

  function set(name: string, value: string | boolean) { setValues(previous => ({ ...previous, [name]: value })) }
  function text(name: string, label: string, type = 'text') {
    return <Input label={label} type={type} error={fields[name]} value={String(values[name] ?? '')}
      onChange={event => set(name, event.target.value)} />
  }
  function select(name: string, label: string, options: [string, string][]) {
    return <label className="block text-xs font-medium text-graphite-600">{label}
      <select className="input-field mt-1.5" aria-invalid={Boolean(fields[name])} value={String(values[name] ?? '')}
        onChange={event => set(name, event.target.value)}>
        <option value="">Selecione</option>
        {options.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
      </select>
      {fields[name] && <span className="mt-1 block text-danger-600">{fields[name]}</span>}
    </label>
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setPending(true); setError(''); setFields({})
    try {
      const saved = await api.payroll<Conditions>(companyId, `${path}/${selected}`, 'POST', values)
      setSelected(''); setValues({}); setMonth(''); setConditions(saved)
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : 'Não foi possível salvar a vigência.')
      setFields(failure instanceof ApiError ? failure.fields : {})
    } finally { setPending(false) }
  }

  return <section className="space-y-3 border-t border-graphite-200 pt-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h3 className="text-base font-semibold">Dados complementares da folha</h3>
      <div className="w-full sm:w-44"><Input label="Filtrar por competência" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div>
    </div>
    {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
    {conditions && (conditions.dependents.length || conditions.records.length ? <ul className="space-y-1 text-sm text-graphite-700">
      {conditions.dependents.map(dependent => <li key={dependent.id}>{dependent.fullName} · {conditionLabels.dependent}
        {dependent.incomeTax && ' · IRRF'}{dependent.familyAllowance && ' · Salário-família'} · {intervalLabel(dependent)}</li>)}
      {conditions.records.map(record => <li key={record.id}>{conditionLabels[record.kind]} · {
        record.kind === 'other_source' ? `${record.value.registration} · ${currency.format(Number(record.value.remuneration))}`
          : currency.format(Number(record.value.amount))} · {intervalLabel(record)}</li>)}
    </ul> : <p className="text-sm text-graphite-600">Nenhum dado complementar para o período.</p>)}
    {canWrite && <form onSubmit={save} className="space-y-3">
      <div className="max-w-xs">
        <label className="block text-xs font-medium text-graphite-600">Adicionar vigência
          <select className="input-field mt-1.5" value={selected} disabled={pending}
            onChange={event => { setSelected(event.target.value as ConditionKind | ''); setValues({}); setFields({}); setError('') }}>
            <option value="">Selecione o tipo</option>
            {Object.entries(conditionLabels).filter(([key]) => employee || key === 'dependent' || key === 'other_source')
              .map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      {selected && <fieldset disabled={pending} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {text('startsOn', 'Início da vigência', 'date')}{text('endsOn', 'Fim da vigência', 'date')}
          {selected === 'dependent' ? <>
            {text('fullName', 'Nome completo')}{text('cpf', 'CPF')}{text('birthDate', 'Nascimento', 'date')}
            {text('relationship', 'Código do parentesco no eSocial')}
            {values.relationship === '99' && text('relationshipDescription', 'Descrição do parentesco')}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.incomeTax === true} onChange={event => set('incomeTax', event.target.checked)} />Dependente para IRRF</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={values.familyAllowance === true} onChange={event => set('familyAllowance', event.target.checked)} />Dependente para salário-família</label>
          </> : selected === 'other_source' ? <>
            {select('registrationType', 'Tipo da inscrição', [['cnpj', 'CNPJ'], ['cpf', 'CPF']])}
            {text('registration', 'Inscrição da outra fonte')}{text('categoryCode', 'Categoria eSocial na outra fonte')}
            {text('remuneration', 'Remuneração na outra fonte (R$)')}{text('contribution', 'Contribuição já descontada (R$)')}
          </> : <>
            {text('amount', 'Valor do benefício (R$)')}
            {selected === 'meal_voucher' && select('mealType', 'Forma de concessão', [['cash', 'Em dinheiro'],
              ['card_pat', 'Cartão ou tíquete, com PAT'], ['card_other', 'Cartão ou tíquete, sem PAT'],
              ['meal_pat', 'Cesta ou refeição, com PAT'], ['meal_other', 'Cesta ou refeição, sem PAT']])}
            {select('discountRule', 'Regra de desconto', [['none', 'Sem desconto'], ['fixed', 'Valor fixo'], ['percentage', 'Percentual']])}
            {values.discountRule && values.discountRule !== 'none' && text('discount', values.discountRule === 'fixed' ? 'Valor de desconto (R$)' : 'Percentual de desconto')}
          </>}
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>Salvar vigência</Button>
      </fieldset>}
    </form>}
  </section>
}
