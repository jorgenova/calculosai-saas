import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOffice } from '@/contexts/OfficeContext'
import { Badge, Button, Card, Input, Modal, Table } from '@/design-system'

type CompanyStatus = 'active' | 'closure_pending' | 'closed'
type Company = {
  id: string
  identification_type: 'cpf' | 'cnpj'
  tax_id: string
  name: string
  status: CompanyStatus
  current_tax_regime: string
}

const REGIMES = [
  ['mei', 'MEI'],
  ['simples_nacional', 'Simples Nacional'],
  ['lucro_presumido', 'Lucro Presumido'],
  ['lucro_real', 'Lucro Real'],
] as const

const STATUS_LABELS: Record<CompanyStatus, string> = {
  active: 'Ativa', closure_pending: 'Encerramento pendente', closed: 'Encerrada',
}

function formatTaxId(type: Company['identification_type'], value: string) {
  if (type === 'cpf') return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

export function CompaniesPanel() {
  const { isOwner } = useAuth()
  const { activeOffice } = useOffice()
  const [companies, setCompanies] = useState<Company[]>([])
  const [includeClosed, setIncludeClosed] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    identificationType: 'cnpj', taxId: '', name: '', taxRegime: 'simples_nacional',
    startDate: new Date().toISOString().slice(0, 10),
  })

  const loadCompanies = useCallback(async () => {
    if (!activeOffice) { setCompanies([]); return }
    setLoading(true); setError('')
    try {
      setCompanies(await api.officeGet<Company[]>(`/companies?includeClosed=${includeClosed}`))
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : 'Não foi possível carregar as empresas.')
    } finally { setLoading(false) }
  }, [activeOffice, includeClosed])

  useEffect(() => { void loadCompanies() }, [loadCompanies])

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try {
      await api.officePost('/companies', form)
      setModalOpen(false)
      setForm(previous => ({ ...previous, taxId: '', name: '' }))
      await loadCompanies()
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Falha ao cadastrar empresa.') }
  }

  async function action(company: Company, path: string) {
    setError('')
    try { await api.officePost(`/companies/${company.id}/${path}`); await loadCompanies() }
    catch (exception) { setError(exception instanceof Error ? exception.message : 'Ação não concluída.') }
  }

  async function changeRegime(company: Company) {
    const taxRegime = window.prompt('Novo regime: mei, simples_nacional, lucro_presumido ou lucro_real')
    if (!taxRegime) return
    const startDate = window.prompt('Data de início (AAAA-MM-DD)', new Date().toISOString().slice(0, 10))
    if (!startDate) return
    try { await api.officePost(`/companies/${company.id}/tax-regime`, { taxRegime, startDate }); await loadCompanies() }
    catch (exception) { setError(exception instanceof Error ? exception.message : 'Falha ao alterar regime.') }
  }

  if (!activeOffice) {
    return <Card><Card.Body><p className="text-sm text-graphite-500">Selecione um escritório para acessar as empresas.</p></Card.Body></Card>
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-h3 text-graphite-900">Empresas</h2><p className="text-xs text-graphite-500">{activeOffice.name}</p></div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-graphite-600"><input type="checkbox" checked={includeClosed} onChange={event => setIncludeClosed(event.target.checked)} className="mr-1" />Exibir encerradas</label>
            <Button size="sm" onClick={() => setModalOpen(true)}>Nova empresa</Button>
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {error && <p className="text-sm text-danger-600 mb-3">{error}</p>}
        {loading ? <p className="text-sm text-graphite-500">Carregando...</p> : companies.length === 0 ? (
          <p className="text-sm text-graphite-500">Nenhuma empresa cadastrada neste escritório.</p>
        ) : (
          <Table><Table.Head><Table.Row><Table.Cell>Empresa</Table.Cell><Table.Cell>Documento</Table.Cell><Table.Cell>Regime</Table.Cell><Table.Cell>Status</Table.Cell><Table.Cell align="right">Ações</Table.Cell></Table.Row></Table.Head>
            <tbody>{companies.map(company => <Table.Row key={company.id}>
              <Table.Cell>{company.name}</Table.Cell>
              <Table.Cell mono>{formatTaxId(company.identification_type, company.tax_id)}</Table.Cell>
              <Table.Cell>{REGIMES.find(([value]) => value === company.current_tax_regime)?.[1] ?? company.current_tax_regime}</Table.Cell>
              <Table.Cell><Badge status={company.status === 'active' ? 'success' : company.status === 'closure_pending' ? 'warning' : 'neutral'}>{STATUS_LABELS[company.status]}</Badge></Table.Cell>
              <Table.Cell align="right"><div className="flex flex-wrap justify-end gap-1">
                {company.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => void changeRegime(company)}>Regime</Button>}
                {isOwner && company.status === 'active' && <Button size="sm" variant="danger" onClick={() => void action(company, 'close')}>Encerrar</Button>}
                {!isOwner && company.status === 'active' && <Button size="sm" variant="secondary" onClick={() => void action(company, 'request-closure')}>Solicitar encerramento</Button>}
                {isOwner && company.status === 'closure_pending' && <><Button size="sm" onClick={() => void action(company, 'approve-closure')}>Aprovar</Button><Button size="sm" variant="secondary" onClick={() => void action(company, 'reject-closure')}>Rejeitar</Button></>}
                {isOwner && company.status === 'closed' && <Button size="sm" onClick={() => void action(company, 'reactivate')}>Reativar</Button>}
              </div></Table.Cell>
            </Table.Row>)}</tbody>
          </Table>
        )}
      </Card.Body>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nova empresa">
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs font-medium text-graphite-600">Tipo de documento<select className="input-field mt-1" value={form.identificationType} onChange={event => setForm(previous => ({ ...previous, identificationType: event.target.value }))}><option value="cnpj">CNPJ</option><option value="cpf">CPF</option></select></label>
          <Input label="CPF ou CNPJ" value={form.taxId} onChange={event => setForm(previous => ({ ...previous, taxId: event.target.value }))} required />
          <Input label="Razão social ou nome completo" value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} required />
          <label className="block text-xs font-medium text-graphite-600">Regime tributário<select className="input-field mt-1" value={form.taxRegime} onChange={event => setForm(previous => ({ ...previous, taxRegime: event.target.value }))}>{REGIMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <Input label="Início do regime" type="date" value={form.startDate} onChange={event => setForm(previous => ({ ...previous, startDate: event.target.value }))} required />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="submit">Cadastrar</Button></div>
        </form>
      </Modal>
    </Card>
  )
}
