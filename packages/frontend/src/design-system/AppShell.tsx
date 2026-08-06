import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Badge } from './Badge'
import { Button } from './Button'

type NavItem = {
  label: string
  active?: boolean
  comingSoon?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Visão geral', active: true },
  { label: 'Lançamentos contábeis', comingSoon: true },
  { label: 'Notas fiscais', comingSoon: true },
  { label: 'Conciliação bancária', comingSoon: true },
  { label: 'Clientes e equipe', comingSoon: true },
]

interface AppShellProps {
  tenantName?: string
  roleLabel: string
  onLogout: () => void
  pageTitle: string
  children: ReactNode
}

export function AppShell({ tenantName, roleLabel, onLogout, pageTitle, children }: AppShellProps) {
  return (
    <div className="min-h-dvh flex">
      <aside className="hidden md:flex md:w-60 md:flex-col bg-ink-900 text-white shrink-0">
        <div className="px-6 py-6 border-b border-ink-800">
          <span className="text-h3 font-semibold tracking-tight">CalculosAI</span>
          {tenantName && <p className="text-xs text-ink-400 mt-1 truncate">{tenantName}</p>}
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <div
              key={item.label}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm',
                item.active && 'bg-ink-800 text-white font-medium border-l-2 border-aurum-400 -ml-px pl-[11px]',
                !item.active && !item.comingSoon && 'text-ink-200 hover:bg-ink-800/60 cursor-pointer',
                item.comingSoon && 'text-ink-500 cursor-default',
              )}
            >
              <span className="truncate min-w-0 flex-1">{item.label}</span>
              {item.comingSoon && (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-500">Em breve</span>
              )}
            </div>
          ))}
        </nav>

        <div className="px-4 py-4 border-t border-ink-800 space-y-3">
          <Badge status="neutral">{roleLabel}</Badge>
          <Button variant="ghost" size="sm" className="w-full !text-ink-200 hover:!bg-ink-800" onClick={onLogout}>
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col bg-graphite-50 min-w-0">
        <header className="md:hidden bg-white border-b border-graphite-200 px-4 h-14 flex items-center justify-between">
          <span className="font-semibold text-graphite-900">{tenantName ?? 'CalculosAI'}</span>
          <button onClick={onLogout} className="text-sm text-graphite-500 hover:text-graphite-700">
            Sair
          </button>
        </header>

        <main className="flex-1 px-6 md:px-10 py-8 max-w-4xl w-full mx-auto">
          <h1 className="text-h1 text-graphite-900 mb-6">{pageTitle}</h1>
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
