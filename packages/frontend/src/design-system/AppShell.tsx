import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, NavLink, Outlet, useBlocker, useLocation, useNavigate } from 'react-router-dom'
import { useOffice } from '@/contexts/OfficeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspace } from '@/contexts/WorkspaceContext'
import { PILLARS } from '@/pages/app/pillars'
import { DiscardChangesModal } from './DiscardChangesModal'

function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select, [tabindex="0"]'))
  const first = controls[0], last = controls[controls.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

export function AppShell() {
  const { offices, activeOffice, selectOffice } = useOffice()
  const { logout, isOwner } = useAuth()
  const { dirty, dirtyRef, setDirty } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const drawer = useRef<HTMLDialogElement>(null)
  const account = useRef<HTMLDialogElement>(null)
  const [notice, setNotice] = useState('')
  const [pendingAction, setPendingAction] = useState<{ type: 'office'; id: string } | { type: 'signout' } | null>(null)
  const allowNavigation = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (allowNavigation.current) { allowNavigation.current = false; return false }
    const companyPath = (path: string) => path.match(/^\/app\/companies\/[^/]+/)?.[0]
    return dirtyRef.current && (companyPath(currentLocation.pathname) !== companyPath(nextLocation.pathname) || !companyPath(currentLocation.pathname))
  })
  useEffect(() => {
    if (!dirty) return
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
  useEffect(() => { drawer.current?.close(); account.current?.close() }, [location.pathname])
  function switchOffice(id: string) {
    if (id === activeOffice?.id) return
    if (dirtyRef.current) { setPendingAction({ type: 'office', id }); return }
    completeOfficeSwitch(id)
  }
  function completeOfficeSwitch(id: string) {
    allowNavigation.current = true
    setDirty(false)
    selectOffice(id)
    navigate('/app/companies')
  }
  function signOut() {
    if (dirtyRef.current) { account.current?.close(); setPendingAction({ type: 'signout' }); return }
    completeSignOut()
  }
  function completeSignOut() {
    allowNavigation.current = true
    setDirty(false); logout(); navigate('/entrar')
  }
  function cancelDiscard() {
    setPendingAction(null)
    if (blocker.state === 'blocked') blocker.reset()
  }
  function discardChanges() {
    const action = pendingAction
    setPendingAction(null)
    setDirty(false)
    if (blocker.state === 'blocked') blocker.proceed()
    else if (action?.type === 'office') completeOfficeSwitch(action.id)
    else if (action?.type === 'signout') completeSignOut()
  }
  return <div className="portal-shell">
    <header className="portal-header">
      <button className="portal-icon" aria-label="Abrir menu" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" /></svg></button>
      <Link to="/app" className="portal-brand">Superior Contábil<span>Seu escritório, conectado.</span></Link>
      <label className="portal-office">Escritório ativo<select aria-label="Escritório ativo" value={activeOffice?.id ?? ''} onChange={event => switchOffice(event.target.value)}><option value="" disabled>Selecione um escritório</option>{offices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}</select></label>
      <button className="portal-account" aria-haspopup="dialog" onClick={() => account.current?.showModal()}><span className="portal-avatar" aria-hidden="true">{isOwner ? 'P' : 'A'}</span><span><strong>Minha conta</strong><small>Plano não informado</small></span><span aria-hidden="true">⌄</span></button>
    </header>
    <dialog onKeyDown={trapDialogFocus} ref={drawer} className="portal-drawer" aria-labelledby="global-navigation-title" onClick={event => { if (event.target === drawer.current) drawer.current.close() }}>
      <div className="portal-drawer-content"><div className="flex items-center justify-between mb-6"><h2 id="global-navigation-title" className="font-semibold">Navegação</h2><button className="portal-icon" aria-label="Fechar menu" onClick={() => drawer.current?.close()}>×</button></div>
      <nav onClick={event => { if ((event.target as HTMLElement).closest('a')) drawer.current?.close() }}><NavLink end to="/app">Início</NavLink><NavLink to="/app/companies">Empresas</NavLink><p className="portal-eyebrow mt-8 mb-3">Áreas de trabalho</p>{PILLARS.map(pillar => <NavLink key={pillar.id} to={`/app/pillars/${pillar.id}`}>{pillar.label}</NavLink>)}{isOwner && <><p className="portal-eyebrow mt-8 mb-3">Gestão</p><NavLink to="/app/administration">Escritórios e equipe</NavLink></>}</nav>
      </div>
    </dialog>
    <dialog onKeyDown={trapDialogFocus} ref={account} className="portal-account-dialog" aria-labelledby="account-title" onClick={event => { if (event.target === account.current) account.current.close() }}><div className="p-6"><div className="flex justify-between items-center"><h2 id="account-title" className="font-semibold">Minha conta</h2><button className="portal-icon" aria-label="Fechar conta" onClick={() => account.current?.close()}>×</button></div><p className="text-sm text-graphite-600 mt-2">{isOwner ? 'Proprietário' : 'Atendente'} · Nome não disponível</p><p className="text-xs text-graphite-600 mb-5">Plano não informado</p>{['Perfil', 'Preferências', 'Assinatura'].map(item => <button key={item} className="portal-menu-action" onClick={() => setNotice(`${item}: funcionalidade ainda não disponível.`)}>{item}<span>Em breve</span></button>)}{isOwner && <Link className="portal-menu-action" to="/app/administration">Gerenciar escritórios e equipe</Link>}<p role="status" className="text-sm my-3">{notice}</p><button className="portal-menu-action" onClick={signOut}>Sair da conta</button></div></dialog>
    <main className="portal-main"><Outlet key={activeOffice?.id ?? 'no-office'} /></main>
    <DiscardChangesModal open={blocker.state === 'blocked' || pendingAction !== null} onCancel={cancelDiscard} onDiscard={discardChanges} />
  </div>
}
