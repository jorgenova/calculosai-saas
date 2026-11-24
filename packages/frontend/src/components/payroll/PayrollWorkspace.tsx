import { useEffect, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { Button, Card } from '@/design-system'
import { type EngagementKind, PayrollPeoplePanel } from './PayrollPeoplePanel'
import { PayrollPolicyPanel } from './PayrollPolicyPanel'
import { PayrollPreviewPanel } from './PayrollPreviewPanel'
import { PayrollVacationPanel } from './PayrollVacationPanel'
import { PayrollGuidePanel } from './PayrollGuidePanel'
import { PayrollEsocialPanel } from './PayrollEsocialPanel'
import { useAuth } from '@/contexts/AuthContext'

type Access = { permissions: string[] }

export function PayrollWorkspace({ companyId, companyName, onClose }: { companyId: string; companyName: string; onClose: () => void }) {
  const [section, setSection] = useState<EngagementKind | 'policy' | 'preview' | 'vacation' | 'guides' | 'esocial'>('employee')
  const { isOwner } = useAuth()
  const [access, setAccess] = useState<Access | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.payroll<Access>(companyId).then(data => { if (active) setAccess(data) }, (failure: unknown) => {
      if (active) setError(failure instanceof ApiError && failure.status === 403
        ? 'Você não tem acesso ao Departamento Pessoal desta empresa.'
        : 'Não foi possível carregar o Departamento Pessoal.')
    })
    return () => { active = false }
  }, [companyId])

  return <Card>
    <Card.Header><div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-h3 text-graphite-900">Departamento Pessoal</h2><p className="text-sm text-graphite-600">{companyName}</p></div>
      <Button variant="secondary" size="sm" onClick={onClose}>Voltar às empresas</Button>
    </div></Card.Header>
    <Card.Body>
      {error ? <p role="alert" className="text-sm text-danger-600">{error}</p> : !access ? <p role="status">Carregando…</p> : <>
        <nav aria-label="Departamento Pessoal" className="mb-5 flex flex-wrap gap-2">
          <Button variant={section === 'employee' ? 'primary' : 'secondary'} aria-pressed={section === 'employee'} onClick={() => setSection('employee')}>Funcionários</Button>
          <Button variant={section === 'partner' ? 'primary' : 'secondary'} aria-pressed={section === 'partner'} onClick={() => setSection('partner')}>Sócios</Button>
          <Button variant={section === 'vacation' ? 'primary' : 'secondary'} aria-pressed={section === 'vacation'} onClick={() => setSection('vacation')}>Férias</Button>
          <Button variant={section === 'guides' ? 'primary' : 'secondary'} aria-pressed={section === 'guides'} onClick={() => setSection('guides')}>Guias</Button>
          <Button variant={section === 'esocial' ? 'primary' : 'secondary'} aria-pressed={section === 'esocial'} onClick={() => setSection('esocial')}>eSocial</Button>
          <Button variant={section === 'preview' ? 'primary' : 'secondary'} aria-pressed={section === 'preview'} onClick={() => setSection('preview')}>Prévia da folha</Button>
          <Button variant={section === 'policy' ? 'primary' : 'secondary'} aria-pressed={section === 'policy'} onClick={() => setSection('policy')}>Configurações</Button>
        </nav>
        {section === 'policy' ? <PayrollPolicyPanel companyId={companyId} canWrite={access.permissions.includes('write')} />
          : section === 'preview' ? <PayrollPreviewPanel companyId={companyId} canWrite={access.permissions.includes('write')} canApprove={access.permissions.includes('approve')} />
          : section === 'vacation' ? <PayrollVacationPanel companyId={companyId} canWrite={access.permissions.includes('write')} />
          : section === 'guides' ? <PayrollGuidePanel companyId={companyId} canWrite={access.permissions.includes('write')} />
          : section === 'esocial' ? <PayrollEsocialPanel companyId={companyId} canTransmit={access.permissions.includes('transmit')} canConfigure={isOwner} />
          : <PayrollPeoplePanel key={section} companyId={companyId} kind={section} canWrite={access.permissions.includes('write')}
            canTransmit={access.permissions.includes('transmit')} />}
      </>}
    </Card.Body>
  </Card>
}
