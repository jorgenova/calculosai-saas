import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { PILLARS } from '@/pages/app/pillars'
import { useCallback, useEffect, useState, useRef } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/contexts/AuthContext'
import { useOffice } from '@/contexts/OfficeContext'
import { Badge, Button, Card, Input, Table } from '@/design-system'
import { TaxRegimeModal } from './TaxRegimeModal'
import { PayrollWorkspace } from './payroll/PayrollWorkspace'
import { DiscardChangesModal } from '@/design-system/DiscardChangesModal'

type CompanyStatus = 'active' | 'closure_pending' | 'closed'
type Company = {
  id: string
  identification_type: 'cpf' | 'cnpj'
  tax_id: string
  name: string
  status: CompanyStatus
  current_tax_regime: string
}

type CompanyDetail = Company & {
  taxPeriods: { id: string; tax_regime: string; start_date: string; end_date: string | null }[]
  legal_name: string | null
  trade_name: string | null
  is_headquarters: boolean | null
  activity_started_at: string | null
  legal_nature: string | null
  municipal_registration: string | null
  state_registration: string | null
  suframa_registration: string | null
  cei: string | null
  caepf: string | null
  primary_cnae_code: string | null
  preparation_cnae_code: string | null
  activity_description: string | null
  share_capital: string | null
  annual_revenue: string | null
  is_small_business: boolean | null
  primaryAddress: {
    postal_code: string | null
    street_type: string | null
    street: string | null
    number: string | null
    complement: string | null
    neighborhood: string | null
    district: string | null
    city_code: string | null
    city: string | null
    state: string | null
    federal_code: string | null
  } | null
}

type ProfileForm = {
  legalName: string; tradeName: string; isHeadquarters: '' | 'true' | 'false'; activityStartedAt: string
  legalNature: string; municipalRegistration: string; stateRegistration: string
  suframaRegistration: string; cei: string; caepf: string; primaryCnaeCode: string
  preparationCnaeCode: string; activityDescription: string; shareCapital: string
  annualRevenue: string; isSmallBusiness: '' | 'true' | 'false'
}

type AddressForm = {
  postalCode: string; streetType: string; street: string; number: string; complement: string
  neighborhood: string; district: string; cityCode: string; city: string; state: string; federalCode: string
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

function formatPostalCode(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.replace(/(\d{5})(\d)/, '$1-$2')
}

function formatCurrency(value: string | null) {
  if (!value) return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) : value
}

function toApiMoney(value: string) {
  return value.trim() ? value.replace(/\./g, '').replace(',', '.') : null
}

function nullable(value: string) { return value.trim() || null }

const emptyProfile = (): ProfileForm => ({
  legalName: '', tradeName: '', isHeadquarters: '', activityStartedAt: '', legalNature: '', municipalRegistration: '',
  stateRegistration: '', suframaRegistration: '', cei: '', caepf: '', primaryCnaeCode: '', preparationCnaeCode: '',
  activityDescription: '', shareCapital: '', annualRevenue: '', isSmallBusiness: '',
})

const emptyAddress = (): AddressForm => ({
  postalCode: '', streetType: '', street: '', number: '', complement: '', neighborhood: '', district: '', cityCode: '', city: '', state: '', federalCode: '',
})

export function CompaniesPanel() {
  const { isOwner } = useAuth()
  const { activeOffice } = useOffice()
  const [companies, setCompanies] = useState<Company[]>([])
  const [includeClosed, setIncludeClosed] = useState(false)
  const [regimeCompany, setRegimeCompany] = useState<Company | null>(null)
  const [confirmRegime, setConfirmRegime] = useState(false)
  const { companyId, section = 'overview', tab = 'identity' } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { dirty, setDirty } = useWorkspace()
  const [baseline, setBaseline] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const requestVersion = useRef(0)
  const listVersion = useRef(0)
  const officeId = activeOffice?.id
  const base = `/app/companies/${companyId}`
  const personnel = section === 'pillars' && tab === 'personnel'
  const tabs = [['identity', 'Identificação empresarial'], ['registrations', 'Inscrições'], ['activity', 'Atividade econômica'], ['size', 'Porte e valores cadastrais'], ['address', 'Endereço principal']]
  useEffect(() => () => { requestVersion.current++; listVersion.current++; setDirty(false) }, [setDirty])
  const [selectedCompany, setSelectedCompany] = useState<CompanyDetail | null>(null)
  const [profile, setProfile] = useState<ProfileForm>(emptyProfile)
  const [address, setAddress] = useState<AddressForm>(emptyAddress)
  useEffect(() => { setDirty(!!baseline && baseline !== JSON.stringify([profile, address])) }, [profile, address, baseline, setDirty])
  const [savingDetail, setSavingDetail] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)


  const loadCompanies = useCallback(async () => {
    if (!activeOffice) { setCompanies([]); return }
    const version = ++listVersion.current
    setLoading(true); setError('')
    try {
      const result = await api.officeGet<Company[]>(`/companies?includeClosed=${includeClosed}`)
      if (version === listVersion.current) setCompanies(result)
    } catch (exception) {
      if (version === listVersion.current) setError(exception instanceof Error ? exception.message : 'Não foi possível carregar as empresas.')
    } finally { if (version === listVersion.current) setLoading(false) }
  }, [activeOffice, includeClosed])

  useEffect(() => { void loadCompanies() }, [loadCompanies])

  async function action(company: Company, path: string) {
    setError('')
    try { await api.officePost(`/companies/${company.id}/${path}`); await loadCompanies() }
    catch (exception) { setError(exception instanceof Error ? exception.message : 'Ação não concluída.') }
  }

  async function openDetail(id: string) {
    const version = ++requestVersion.current
    setSelectedCompany(null); setBaseline('')
    setError('')
    try {
      const detail = await api.officeGet<CompanyDetail>(`/companies/${id}`)
      if (version !== requestVersion.current) return
      detail.current_tax_regime = detail.taxPeriods?.find(period => !period.end_date)?.tax_regime ?? ''
      setSelectedCompany(detail)
      const nextProfile: ProfileForm = {
        legalName: detail.legal_name ?? '', tradeName: detail.trade_name ?? '',
        isHeadquarters: detail.is_headquarters === null ? '' : String(detail.is_headquarters) as ProfileForm['isHeadquarters'],
        activityStartedAt: detail.activity_started_at?.slice(0, 10) ?? '', legalNature: detail.legal_nature ?? '',
        municipalRegistration: detail.municipal_registration ?? '', stateRegistration: detail.state_registration ?? '',
        suframaRegistration: detail.suframa_registration ?? '', cei: detail.cei ?? '', caepf: detail.caepf ?? '',
        primaryCnaeCode: detail.primary_cnae_code ?? '', preparationCnaeCode: detail.preparation_cnae_code ?? '',
        activityDescription: detail.activity_description ?? '', shareCapital: formatCurrency(detail.share_capital),
        annualRevenue: formatCurrency(detail.annual_revenue),
        isSmallBusiness: detail.is_small_business === null ? '' : String(detail.is_small_business) as ProfileForm['isSmallBusiness'],
      }
      setProfile(nextProfile)
      const primaryAddress = detail.primaryAddress
      const nextAddress: AddressForm = {
        postalCode: formatPostalCode(primaryAddress?.postal_code ?? ''), streetType: primaryAddress?.street_type ?? '', street: primaryAddress?.street ?? '',
        number: primaryAddress?.number ?? '', complement: primaryAddress?.complement ?? '', neighborhood: primaryAddress?.neighborhood ?? '',
        district: primaryAddress?.district ?? '', cityCode: primaryAddress?.city_code ?? '', city: primaryAddress?.city ?? '',
        state: primaryAddress?.state ?? '', federalCode: primaryAddress?.federal_code ?? '',
      }
      setAddress(nextAddress)
      setBaseline(JSON.stringify([nextProfile, nextAddress]))
    } catch (exception) { if (version === requestVersion.current) setError(exception instanceof Error ? exception.message : 'Não foi possível carregar o cadastro.') }
  }

  useEffect(() => { if (companyId && officeId) void openDetail(companyId) }, [companyId, officeId])

  async function saveDetail(event: React.FormEvent) {
    event.preventDefault()
    if (!selectedCompany) return
    const version = requestVersion.current
    setSavingDetail(true); setError('')
    try {
      await api.officePut(`/companies/${selectedCompany.id}/profile`, {
        ...Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, nullable(value)])),
        isHeadquarters: profile.isHeadquarters === '' ? null : profile.isHeadquarters === 'true',
        isSmallBusiness: profile.isSmallBusiness === '' ? null : profile.isSmallBusiness === 'true',
        shareCapital: toApiMoney(profile.shareCapital), annualRevenue: toApiMoney(profile.annualRevenue),
      })
      if (version !== requestVersion.current) return
      await api.officePut(`/companies/${selectedCompany.id}/primary-address`, {
        ...Object.fromEntries(Object.entries(address).map(([key, value]) => [key, nullable(value)])),
        postalCode: address.postalCode.replace(/\D/g, '') || null,
      })
      if (version !== requestVersion.current) return
      await loadCompanies()
      setBaseline(JSON.stringify([profile, address])); setDirty(false)
    } catch (exception) { setError(exception instanceof Error ? exception.message : 'Não foi possível salvar o cadastro.') }
    finally { setSavingDetail(false) }
  }

  if (!activeOffice) {
    return <Card><Card.Body><p className="text-sm text-graphite-500">Selecione um escritório para acessar as empresas.</p></Card.Body></Card>
  }


  if (companyId) return <div>
    <nav aria-label="Caminho" className="text-sm text-graphite-600 mb-6"><Link to="/app" className="portal-link">Início</Link> / <Link to="/app/companies" className="portal-link">Empresas</Link> / {selectedCompany?.name ?? 'Carregando empresa'}</nav>
    {error && <div role="alert" className="mb-4 text-danger-600">{error} <Button variant="ghost" onClick={() => void openDetail(companyId)}>Tentar novamente</Button></div>}
    {!selectedCompany || selectedCompany.id !== companyId ? <p>{error ? 'Cadastro não disponível.' : 'Carregando cadastro...'}</p> : <>
    <div className="company-heading"><span className="pillar-mark" aria-hidden="true">E</span><div><h1 className="text-2xl font-semibold">{selectedCompany.legal_name || selectedCompany.name}</h1><p className="text-sm text-graphite-600 mt-1">{formatTaxId(selectedCompany.identification_type, selectedCompany.tax_id)} · {activeOffice.name}</p></div><Badge status="neutral">{STATUS_LABELS[selectedCompany.status]}</Badge></div>
    <button className="portal-link my-5 text-sm" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}>{sidebarOpen ? 'Recolher navegação' : 'Mostrar navegação'}</button>
    <div className={sidebarOpen ? 'company-work-grid' : ''}>
    {sidebarOpen && <nav aria-label="Navegação da empresa" className="company-navigation">{[['overview', 'Visão geral'], ['registration', 'Dados cadastrais'], ['history', 'Histórico tributário']].map(([id, label]) => <Link key={id} aria-current={section === id ? 'page' : undefined} to={`${base}/${id}`}>{label}</Link>)}<p className="portal-eyebrow mt-7 mb-3">Áreas de trabalho</p>{PILLARS.map(pillar => <Link key={pillar.id} aria-current={section === 'pillars' && tab === pillar.id ? 'page' : undefined} to={`${base}/pillars/${pillar.id}`}>{pillar.label}</Link>)}</nav>}
    <div className="min-w-0 company-work-content">
    {!personnel && <div className="company-toolbar"><span>{dirty ? 'Alterações não salvas' : 'Cadastro da empresa'}</span>{section === 'registration' && <Button form="company-registration" type="submit" size="sm" disabled={savingDetail}>{savingDetail ? 'Salvando...' : 'Salvar cadastro'}</Button>}</div>}
    {personnel ? <PayrollWorkspace key={activeOffice.id + '/' + selectedCompany.id}
      companyId={selectedCompany.id} companyName={selectedCompany.legal_name || selectedCompany.name}
      onClose={() => navigate('/app/companies?pillar=personnel')} />
      : section === 'registration' ? <><div role="tablist" aria-label="Dados cadastrais" className="company-tabs">{tabs.map(([id, label], index) => <Link role="tab" id={`tab-${id}`} aria-controls="registration-panel" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} key={id} to={`${base}/registration/${id}`} onKeyDown={event => { const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1; if (next >= 0) { event.preventDefault(); navigate(`${base}/registration/${tabs[next][0]}`); document.getElementById(`tab-${tabs[next][0]}`)?.focus() } }}>{label}</Link>)}</div><form id="company-registration" onSubmit={saveDetail}><div id="registration-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="py-4">{tab === 'identity' && <div className="grid gap-4 md:grid-cols-2"><Input label="Razão social" value={profile.legalName} onChange={event => setProfile(previous => ({ ...previous, legalName: event.target.value }))} />
<Input label="Nome fantasia" value={profile.tradeName} onChange={event => setProfile(previous => ({ ...previous, tradeName: event.target.value }))} />
<Input label="Início das atividades" type="date" value={profile.activityStartedAt} onChange={event => setProfile(previous => ({ ...previous, activityStartedAt: event.target.value }))} />
<Input label="Natureza jurídica" value={profile.legalNature} onChange={event => setProfile(previous => ({ ...previous, legalNature: event.target.value }))} />
<label className="block text-xs font-medium text-graphite-600">É matriz?<select className="input-field mt-1" value={profile.isHeadquarters} onChange={event => setProfile(previous => ({ ...previous, isHeadquarters: event.target.value as ProfileForm['isHeadquarters'] }))}><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select></label></div>}
{tab === 'registrations' && <div className="grid gap-4 md:grid-cols-2"><Input label="Inscrição municipal" value={profile.municipalRegistration} onChange={event => setProfile(previous => ({ ...previous, municipalRegistration: event.target.value }))} />
<Input label="Inscrição estadual" value={profile.stateRegistration} onChange={event => setProfile(previous => ({ ...previous, stateRegistration: event.target.value }))} />
<Input label="Inscrição SUFRAMA" value={profile.suframaRegistration} onChange={event => setProfile(previous => ({ ...previous, suframaRegistration: event.target.value }))} />
<Input label="CEI" value={profile.cei} onChange={event => setProfile(previous => ({ ...previous, cei: event.target.value }))} />
<Input label="CAEPF" value={profile.caepf} onChange={event => setProfile(previous => ({ ...previous, caepf: event.target.value }))} /></div>}
{tab === 'activity' && <div className="grid gap-4 md:grid-cols-2"><Input label="CNAE principal" value={profile.primaryCnaeCode} onChange={event => setProfile(previous => ({ ...previous, primaryCnaeCode: event.target.value }))} />
<Input label="CNAE preparatório" value={profile.preparationCnaeCode} onChange={event => setProfile(previous => ({ ...previous, preparationCnaeCode: event.target.value }))} />
<Input label="Descrição da atividade" value={profile.activityDescription} onChange={event => setProfile(previous => ({ ...previous, activityDescription: event.target.value }))} /></div>}
{tab === 'size' && <div className="grid gap-4 md:grid-cols-2"><Input label="Capital social" inputMode="decimal" value={profile.shareCapital} onChange={event => setProfile(previous => ({ ...previous, shareCapital: event.target.value }))} />
<Input label="Faturamento anual" inputMode="decimal" value={profile.annualRevenue} onChange={event => setProfile(previous => ({ ...previous, annualRevenue: event.target.value }))} />
<label className="block text-xs font-medium text-graphite-600">Pequeno porte?<select className="input-field mt-1" value={profile.isSmallBusiness} onChange={event => setProfile(previous => ({ ...previous, isSmallBusiness: event.target.value as ProfileForm['isSmallBusiness'] }))}><option value="">Não informado</option><option value="true">Sim</option><option value="false">Não</option></select></label></div>}
{tab === 'address' && <div className="grid gap-4 md:grid-cols-2"><Input label="CEP" inputMode="numeric" value={address.postalCode} onChange={event => setAddress(previous => ({ ...previous, postalCode: formatPostalCode(event.target.value) }))} />
<Input label="Tipo de logradouro" value={address.streetType} onChange={event => setAddress(previous => ({ ...previous, streetType: event.target.value }))} />
<Input label="Logradouro" value={address.street} onChange={event => setAddress(previous => ({ ...previous, street: event.target.value }))} />
<Input label="Número" value={address.number} onChange={event => setAddress(previous => ({ ...previous, number: event.target.value }))} />
<Input label="Complemento" value={address.complement} onChange={event => setAddress(previous => ({ ...previous, complement: event.target.value }))} />
<Input label="Bairro" value={address.neighborhood} onChange={event => setAddress(previous => ({ ...previous, neighborhood: event.target.value }))} />
<Input label="Distrito" value={address.district} onChange={event => setAddress(previous => ({ ...previous, district: event.target.value }))} />
<Input label="Código do município" value={address.cityCode} onChange={event => setAddress(previous => ({ ...previous, cityCode: event.target.value }))} />
<Input label="Município" value={address.city} onChange={event => setAddress(previous => ({ ...previous, city: event.target.value }))} />
<Input label="UF" value={address.state} maxLength={2} onChange={event => setAddress(previous => ({ ...previous, state: event.target.value.toUpperCase() }))} />
<Input label="Código federal" value={address.federalCode} onChange={event => setAddress(previous => ({ ...previous, federalCode: event.target.value }))} /></div>}</div></form></> : section === 'history' ? <section className="py-6"><h2 className="text-lg font-semibold mb-5">Histórico tributário</h2>{selectedCompany.status !== 'closed' && <Button size="sm" onClick={() => { if (dirty) setConfirmRegime(true); else setRegimeCompany(selectedCompany) }}>Alterar regime</Button>}<div className="mt-5 overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr><th>Regime</th><th>Início</th><th>Fim</th></tr></thead><tbody>{selectedCompany.taxPeriods?.map(period => <tr key={period.id}><td className="py-3">{REGIMES.find(([id]) => id === period.tax_regime)?.[1] ?? period.tax_regime}</td><td>{period.start_date.slice(0, 10)}</td><td>{period.end_date?.slice(0, 10) ?? 'Vigente'}</td></tr>)}</tbody></table></div></section> : section === 'pillars' ? <section className="py-10"><p className="portal-eyebrow">{selectedCompany.name}</p><h2 className="text-xl font-semibold mt-3">{PILLARS.find(pillar => pillar.id === tab)?.label ?? 'Área de trabalho'}</h2><p className="text-graphite-600 mt-4">Rotinas desta área disponíveis em breve.</p></section> : <section className="py-4"><h2 className="text-xl font-semibold mb-4">Visão geral</h2><p className="text-graphite-600">Dados cadastrais e rotinas dos cinco pilares em um só lugar.</p><dl className="grid sm:grid-cols-2 gap-6 mt-8"><div><dt className="portal-eyebrow">Nome</dt><dd className="mt-2">{selectedCompany.name}</dd></div><div><dt className="portal-eyebrow">Situação</dt><dd className="mt-2">{STATUS_LABELS[selectedCompany.status]}</dd></div></dl><Link className="portal-link inline-block mt-8" to={`${base}/registration/identity`}>Abrir dados cadastrais →</Link></section>}
    </div></div></>}
    <DiscardChangesModal open={confirmRegime} onCancel={() => setConfirmRegime(false)} onDiscard={() => { setConfirmRegime(false); setDirty(false); void openDetail(companyId).then(() => setRegimeCompany(selectedCompany)) }} />
    {regimeCompany && <TaxRegimeModal company={regimeCompany} onClose={() => setRegimeCompany(null)} onSaved={async () => { await loadCompanies(); await openDetail(companyId) }} />}
  </div>

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-h3 text-graphite-900">Empresas</h2><p className="text-xs text-graphite-500">{activeOffice.name}</p></div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-graphite-600"><input type="checkbox" checked={includeClosed} onChange={event => setIncludeClosed(event.target.checked)} className="mr-1" />Exibir encerradas</label>
            <Button size="sm" onClick={() => navigate('/app/companies/new')}>Nova empresa</Button>
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {error && <div role="alert" className="text-sm text-danger-600 mb-3">{error} <Button variant="ghost" onClick={() => void loadCompanies()}>Tentar novamente</Button></div>}
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
                <Button size="sm" variant="ghost" onClick={() => navigate(`/app/companies/${company.id}/${search.get('pillar') ? 'pillars/' + search.get('pillar') : 'overview'}`)}>{search.get('pillar') === 'personnel' ? 'Departamento Pessoal' : 'Cadastro'}</Button>
                {company.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => setRegimeCompany(company)}>Regime</Button>}
                {!isOwner && company.status === 'active' && <Button size="sm" variant="secondary" onClick={() => void action(company, 'request-closure')}>Solicitar encerramento</Button>}
                {isOwner && company.status === 'closure_pending' && <><Button size="sm" onClick={() => void action(company, 'approve-closure')}>Aprovar</Button><Button size="sm" variant="secondary" onClick={() => void action(company, 'reject-closure')}>Rejeitar</Button></>}
                {isOwner && company.status === 'closed' && <Button size="sm" onClick={() => void action(company, 'reactivate')}>Reativar</Button>}
              </div></Table.Cell>
            </Table.Row>)}</tbody>
          </Table>
        )}
      </Card.Body>
      {regimeCompany && <TaxRegimeModal company={regimeCompany} onClose={() => setRegimeCompany(null)} onSaved={loadCompanies} />}

    </Card>
  )
}
